//! Hook review and `PreToolUse` use cases (issue #20).
//!
//! Owns the project-scoped review flow: resolve a provider hook against the
//! owning project's decisions, record a new decision, and execute only the
//! hooks that are both `approved` and `PreToolUse`.
//!
//! Execution rules:
//!
//! - Pending hooks are skipped; **rejected hooks are never executed**. Whether
//!   declining a hook must also block the tool call it guards is an open
//!   product question (`business-logic.md` §4); this service records the
//!   decision and does not infer blocking.
//! - Hooks run sequentially, in provider order, with the project's first
//!   canonicalized workspace root as `cwd` and their own timeout.
//! - Commands are tokenized into program + argv and handed to the executor
//!   port; no shell is involved, and no `MutexGuard` is alive across the
//!   executor `.await` (the project snapshot is cloned under a short lock).
//!
//! The approval matrix itself is [`super::approval_policy`], exposed here as
//! [`authorize_tool`] so `#21` and provider adapters `#25–#27` have one core
//! gate to call before executing anything.

use std::collections::HashSet;
use std::path::Path;
use std::sync::Arc;

use super::approval_policy::{self, ApprovalDecision};
use super::domain::{
    HookCommand, HookError, HookId, HookReport, MAX_HOOKS_PER_PROJECT, ReviewedHook,
};
use super::ports::{HookExecutor, HookInvocation, HookRun, HookSource};
use crate::features::conversations::domain::ToolCallKind;
use crate::features::projects::domain::{HookApprovalStatus, Project, ProjectId};
use crate::features::projects::service::ProjectStore;
use crate::security::path_policy::canonicalize_or_normalize_root;

/// Long-lived owner of the hook review use cases.
pub struct HookService {
    source: Arc<dyn HookSource>,
}

impl HookService {
    pub fn new(source: Arc<dyn HookSource>) -> Self {
        Self { source }
    }

    /// Every hook of one project, with the project's decisions applied.
    pub fn list_hooks(
        &self,
        projects: &ProjectStore,
        project_id: &ProjectId,
    ) -> Result<Vec<ReviewedHook>, HookError> {
        let project = project_snapshot(projects, project_id)?;
        self.reviewed_hooks(&project)
    }

    /// Records one project-scoped decision and resolves the updated hook.
    ///
    /// The hook must belong to the project's source list; an unknown id is
    /// denied before any decision row is written.
    pub fn set_hook_decision(
        &self,
        projects: &ProjectStore,
        project_id: &ProjectId,
        hook_id: &HookId,
        approval_status: HookApprovalStatus,
    ) -> Result<ReviewedHook, HookError> {
        let project = project_snapshot(projects, project_id)?;
        let reports = self.reports(&project)?;
        let report = reports
            .into_iter()
            .find(|report| report.definition.id == *hook_id)
            .ok_or_else(|| HookError::UnknownHook {
                hook_id: hook_id.as_str().to_owned(),
            })?;
        projects
            .set_hook_decision(project_id, hook_id.as_str(), approval_status)
            .map_err(|_| HookError::UnknownProject {
                project_id: project_id.as_str().to_owned(),
            })?;
        Ok(ReviewedHook {
            definition: report.definition,
            approval_status,
        })
    }

    /// Runs the project's approved `PreToolUse` hooks and returns one outcome
    /// per executed hook, in provider order.
    pub async fn run_pre_tool_use(
        &self,
        projects: &ProjectStore,
        executor: &dyn HookExecutor,
        project_id: &ProjectId,
    ) -> Result<Vec<HookRun>, HookError> {
        let project = project_snapshot(projects, project_id)?;
        let hooks = self.reviewed_hooks(&project)?;
        let folder =
            project
                .workspace_folders
                .first()
                .ok_or_else(|| HookError::ProjectHasNoWorkspace {
                    project_id: project_id.as_str().to_owned(),
                })?;
        let cwd = canonicalize_or_normalize_root(Path::new(folder)).map_err(|_| {
            HookError::WorkspaceNotAuthorized {
                folder: folder.clone(),
            }
        })?;

        let mut runs = Vec::new();
        for hook in hooks.into_iter().filter(|hook| {
            hook.definition.is_pre_tool_use()
                && hook.approval_status == HookApprovalStatus::Approved
        }) {
            let hook_id = hook.definition.id.as_str().to_owned();
            let command = HookCommand::parse(&hook.definition.command).map_err(|error| {
                HookError::InvalidCommand {
                    hook_id: hook_id.clone(),
                    reason: error.describe().to_owned(),
                }
            })?;
            let run = executor
                .execute(HookInvocation {
                    hook_id: hook_id.clone(),
                    command,
                    cwd: cwd.clone(),
                    timeout_ms: hook.definition.timeout_ms,
                })
                .await
                .map_err(|_| HookError::HookExecutionFailed { hook_id })?;
            runs.push(run);
        }
        Ok(runs)
    }

    fn reviewed_hooks(&self, project: &Project) -> Result<Vec<ReviewedHook>, HookError> {
        let reports = self.reports(project)?;
        Ok(reports
            .into_iter()
            .map(|report| {
                let decision = project
                    .hook_decisions
                    .iter()
                    .find(|decision| decision.hook_id == report.definition.id.as_str())
                    .map(|decision| decision.approval_status);
                ReviewedHook {
                    definition: report.definition,
                    approval_status: decision.unwrap_or(report.reported_status),
                }
            })
            .collect())
    }

    fn reports(&self, project: &Project) -> Result<Vec<HookReport>, HookError> {
        let reports = self.source.hooks_for(project.id.as_str());
        if reports.len() > MAX_HOOKS_PER_PROJECT {
            return Err(HookError::TooManyHooks { len: reports.len() });
        }
        let mut seen = HashSet::with_capacity(reports.len());
        for report in &reports {
            if !seen.insert(report.definition.id.as_str()) {
                return Err(HookError::DuplicateHookId {
                    hook_id: report.definition.id.as_str().to_owned(),
                });
            }
        }
        Ok(reports)
    }
}

/// Applies the project's approval mode to one tool kind.
///
/// The policy is the core gate future tool executors must call before running
/// anything; it never reads an `approved` flag from the request.
pub fn authorize_tool(
    projects: &ProjectStore,
    project_id: &ProjectId,
    kind: ToolCallKind,
) -> Result<ApprovalDecision, HookError> {
    let project = project_snapshot(projects, project_id)?;
    Ok(approval_policy::evaluate(project.approval_mode, kind))
}

fn project_snapshot(projects: &ProjectStore, project_id: &ProjectId) -> Result<Project, HookError> {
    projects
        .project(project_id)
        .ok_or_else(|| HookError::UnknownProject {
            project_id: project_id.as_str().to_owned(),
        })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use super::*;
    use crate::features::hooks::adapters::fake::FakeHookSource;
    use crate::features::hooks::ports::{
        BoxFuture, HookExecutionError, HookExecutor, HookInvocation, HookRun, HookRunOutcome,
        HookSource,
    };
    use crate::features::projects::domain::ApprovalMode;

    struct RecordingExecutor {
        invocations: Mutex<Vec<HookInvocation>>,
    }

    impl RecordingExecutor {
        fn new() -> Self {
            Self {
                invocations: Mutex::new(Vec::new()),
            }
        }

        fn invocations(&self) -> Vec<HookInvocation> {
            self.invocations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .clone()
        }
    }

    impl HookExecutor for RecordingExecutor {
        fn execute(
            &self,
            invocation: HookInvocation,
        ) -> BoxFuture<'_, Result<HookRun, HookExecutionError>> {
            self.invocations
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push(invocation.clone());
            Box::pin(async move {
                Ok(HookRun {
                    hook_id: invocation.hook_id,
                    outcome: HookRunOutcome::Succeeded,
                    exit_code: Some(0),
                })
            })
        }
    }

    struct FailingExecutor;

    impl HookExecutor for FailingExecutor {
        fn execute(
            &self,
            _invocation: HookInvocation,
        ) -> BoxFuture<'_, Result<HookRun, HookExecutionError>> {
            Box::pin(async { Err(HookExecutionError::SpawnFailed) })
        }
    }

    struct StaticSource {
        reports: Vec<HookReport>,
    }

    impl HookSource for StaticSource {
        fn hooks_for(&self, _project_id: &str) -> Vec<HookReport> {
            self.reports.clone()
        }
    }

    fn service() -> HookService {
        HookService::new(Arc::new(FakeHookSource))
    }

    fn projects() -> ProjectStore {
        ProjectStore::seeded()
    }

    fn design_system() -> ProjectId {
        ProjectId::new("proj-design-system").expect("fixture id")
    }

    fn lint_hook() -> HookId {
        HookId::new("hook-lint-on-write").expect("fixture id")
    }

    fn fixture_report(hook_type: &str, reported: HookApprovalStatus) -> HookReport {
        HookReport {
            definition: crate::features::hooks::domain::HookDefinition::new(
                HookId::new("hook-lint-on-write").expect("id"),
                "Lint on write",
                true,
                "Project configuration",
                hook_type,
                "node .claude/hooks/lint-on-write.mjs",
                5000,
            )
            .expect("fixture definition"),
            reported_status: reported,
        }
    }

    #[test]
    fn lists_the_fixture_hooks_with_their_reported_statuses() {
        let hooks = service()
            .list_hooks(&projects(), &design_system())
            .expect("known project");
        assert_eq!(hooks.len(), 2);
        assert_eq!(hooks[0].definition.id.as_str(), "hook-lint-on-write");
        assert_eq!(hooks[0].approval_status, HookApprovalStatus::Pending);
        assert_eq!(hooks[1].definition.id.as_str(), "hook-notify-tool-use");
        assert_eq!(hooks[1].approval_status, HookApprovalStatus::Approved);
    }

    #[test]
    fn a_project_decision_overrides_the_reported_status() {
        let hooks = service()
            .list_hooks(&projects(), &ProjectId::new("proj-api-client").expect("id"))
            .expect("known project");
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].approval_status, HookApprovalStatus::Rejected);
    }

    #[test]
    fn records_a_decision_and_does_not_duplicate_it() {
        let projects = projects();
        let hook = service()
            .set_hook_decision(
                &projects,
                &design_system(),
                &lint_hook(),
                HookApprovalStatus::Approved,
            )
            .expect("known hook");
        assert_eq!(hook.approval_status, HookApprovalStatus::Approved);
        let again = service()
            .set_hook_decision(
                &projects,
                &design_system(),
                &lint_hook(),
                HookApprovalStatus::Rejected,
            )
            .expect("known hook");
        assert_eq!(again.approval_status, HookApprovalStatus::Rejected);
        let project = projects.project(&design_system()).expect("known project");
        assert_eq!(project.hook_decisions.len(), 1);
    }

    #[test]
    fn rejects_an_unknown_project() {
        let error = service()
            .list_hooks(&projects(), &ProjectId::new("proj-ghost").expect("id"))
            .expect_err("unknown project");
        assert_eq!(
            error,
            HookError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }

    #[test]
    fn rejects_a_hook_the_project_does_not_expose() {
        let error = service()
            .set_hook_decision(
                &projects(),
                &design_system(),
                &HookId::new("hook-ghost").expect("id"),
                HookApprovalStatus::Approved,
            )
            .expect_err("unknown hook");
        assert_eq!(
            error,
            HookError::UnknownHook {
                hook_id: "hook-ghost".to_owned(),
            }
        );
    }

    #[tokio::test]
    async fn runs_only_approved_pre_tool_use_hooks() {
        let projects = projects();
        let executor = RecordingExecutor::new();
        let service = service();

        let runs = service
            .run_pre_tool_use(&projects, &executor, &design_system())
            .await
            .expect("pre-tool-use pass");
        assert!(
            runs.is_empty(),
            "pending and PostToolUse hooks must not run"
        );
        assert!(executor.invocations().is_empty());

        service
            .set_hook_decision(
                &projects,
                &design_system(),
                &lint_hook(),
                HookApprovalStatus::Approved,
            )
            .expect("decision recorded");
        let runs = service
            .run_pre_tool_use(&projects, &executor, &design_system())
            .await
            .expect("pre-tool-use pass");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].hook_id, "hook-lint-on-write");
        let invocations = executor.invocations();
        assert_eq!(invocations.len(), 1);
        assert_eq!(invocations[0].command.program(), "node");
        assert_eq!(
            invocations[0].command.args(),
            [".claude/hooks/lint-on-write.mjs"]
        );
        assert_eq!(
            invocations[0].cwd,
            PathBuf::from("/workspace/design-system")
        );
        assert_eq!(invocations[0].timeout_ms, 5000);
    }

    #[tokio::test]
    async fn never_runs_a_rejected_hook() {
        let projects = projects();
        let executor = RecordingExecutor::new();
        let runs = service()
            .run_pre_tool_use(
                &projects,
                &executor,
                &ProjectId::new("proj-api-client").expect("id"),
            )
            .await
            .expect("pre-tool-use pass");
        assert!(runs.is_empty());
        assert!(executor.invocations().is_empty());
    }

    #[tokio::test]
    async fn rejects_an_unparseable_command_before_spawning() {
        let malformed = HookReport {
            definition: crate::features::hooks::domain::HookDefinition::new(
                lint_hook(),
                "Lint on write",
                true,
                "Project configuration",
                "PreToolUse",
                "node \"unterminated",
                5000,
            )
            .expect("limits accept the malformed command"),
            reported_status: HookApprovalStatus::Approved,
        };
        let source = HookService::new(Arc::new(StaticSource {
            reports: vec![malformed],
        }));
        let executor = RecordingExecutor::new();
        let error = source
            .run_pre_tool_use(&projects(), &executor, &design_system())
            .await
            .expect_err("malformed command");
        assert_eq!(
            error,
            HookError::InvalidCommand {
                hook_id: "hook-lint-on-write".to_owned(),
                reason: "hook command has an unterminated quote".to_owned(),
            }
        );
        assert!(executor.invocations().is_empty());
    }

    #[tokio::test]
    async fn reports_an_executor_failure_with_the_hook_id() {
        let source = HookService::new(Arc::new(StaticSource {
            reports: vec![fixture_report("PreToolUse", HookApprovalStatus::Approved)],
        }));
        let error = source
            .run_pre_tool_use(&projects(), &FailingExecutor, &design_system())
            .await
            .expect_err("executor fails");
        assert_eq!(
            error,
            HookError::HookExecutionFailed {
                hook_id: "hook-lint-on-write".to_owned(),
            }
        );
    }

    #[test]
    fn caps_the_hook_collection() {
        let source = HookService::new(Arc::new(StaticSource {
            reports: vec![
                fixture_report("PreToolUse", HookApprovalStatus::Pending);
                MAX_HOOKS_PER_PROJECT + 1
            ],
        }));
        let error = source
            .list_hooks(&projects(), &design_system())
            .expect_err("too many hooks");
        assert_eq!(
            error,
            HookError::TooManyHooks {
                len: MAX_HOOKS_PER_PROJECT + 1,
            }
        );
    }

    #[test]
    fn rejects_duplicate_hook_ids() {
        let source = HookService::new(Arc::new(StaticSource {
            reports: vec![
                fixture_report("PreToolUse", HookApprovalStatus::Pending),
                fixture_report("PreToolUse", HookApprovalStatus::Pending),
            ],
        }));
        let error = source
            .list_hooks(&projects(), &design_system())
            .expect_err("duplicate hooks");
        assert_eq!(
            error,
            HookError::DuplicateHookId {
                hook_id: "hook-lint-on-write".to_owned(),
            }
        );
    }

    #[tokio::test]
    async fn rejects_a_project_without_an_authorized_root() {
        let project = Project {
            id: design_system(),
            name: "Empty".to_owned(),
            workspace_folders: Vec::new(),
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: Vec::new(),
        };
        let projects = ProjectStore::from_projects(vec![project]);
        let error = service()
            .run_pre_tool_use(&projects, &RecordingExecutor::new(), &design_system())
            .await
            .expect_err("no workspace");
        assert_eq!(
            error,
            HookError::ProjectHasNoWorkspace {
                project_id: "proj-design-system".to_owned(),
            }
        );
    }

    #[test]
    fn authorizes_tools_from_the_project_mode() {
        let projects = projects();
        assert_eq!(
            authorize_tool(&projects, &design_system(), ToolCallKind::Search)
                .expect("known project"),
            ApprovalDecision::RequireApproval
        );
        let api_client = ProjectId::new("proj-api-client").expect("id");
        assert_eq!(
            authorize_tool(&projects, &api_client, ToolCallKind::Search).expect("known project"),
            ApprovalDecision::Allow
        );
        assert_eq!(
            authorize_tool(&projects, &api_client, ToolCallKind::Command).expect("known project"),
            ApprovalDecision::RequireApproval
        );
        projects
            .set_approval_mode(&design_system(), ApprovalMode::FullAccess)
            .expect("known project");
        assert_eq!(
            authorize_tool(&projects, &design_system(), ToolCallKind::Command)
                .expect("known project"),
            ApprovalDecision::Allow
        );
    }

    #[test]
    fn rejects_authorization_for_an_unknown_project() {
        let error = authorize_tool(
            &projects(),
            &ProjectId::new("proj-ghost").expect("id"),
            ToolCallKind::Search,
        )
        .expect_err("unknown project");
        assert_eq!(
            error,
            HookError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }
}
