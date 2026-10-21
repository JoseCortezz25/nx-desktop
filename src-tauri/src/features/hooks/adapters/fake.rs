//! In-memory hook source (issue #20).
//!
//! Serves the frozen #16 fixture rows for `proj-design-system` and the single
//! hook `proj-api-client` already decided in the #18 seed. This is scaffolding,
//! not provider discovery: the real OpenCode/Codex/Claude configuration readers
//! belong to #25–#27 and replace this source behind the same
//! [`HookSource`](super::super::ports::HookSource) port.

use super::super::domain::{HookDefinition, HookId, HookReport};
use super::super::ports::HookSource;
use crate::features::projects::domain::HookApprovalStatus;

/// Fake provider source returning the fixture hooks.
#[derive(Debug, Default, Clone, Copy)]
pub struct FakeHookSource;

impl HookSource for FakeHookSource {
    fn hooks_for(&self, project_id: &str) -> Vec<HookReport> {
        match project_id {
            "proj-design-system" => vec![
                lint_on_write(HookApprovalStatus::Pending),
                notify_tool_use(),
            ],
            // The #18 seed records a rejected decision for this hook in the API
            // client project, so the source exposes it for that project too.
            "proj-api-client" => vec![lint_on_write(HookApprovalStatus::Pending)],
            _ => Vec::new(),
        }
    }
}

fn lint_on_write(reported_status: HookApprovalStatus) -> HookReport {
    HookReport {
        definition: must_definition(
            "hook-lint-on-write",
            "Lint on write",
            true,
            "Project configuration",
            "PreToolUse",
            "node .claude/hooks/lint-on-write.mjs",
            5000,
        ),
        reported_status,
    }
}

fn notify_tool_use() -> HookReport {
    HookReport {
        definition: must_definition(
            "hook-notify-tool-use",
            "Notify on tool use",
            false,
            "Plugin",
            "PostToolUse",
            "node plugins/notifications/tool-use.mjs",
            1500,
        ),
        reported_status: HookApprovalStatus::Approved,
    }
}

fn must_definition(
    id: &str,
    name: &str,
    is_new: bool,
    origin: &str,
    hook_type: &str,
    command: &str,
    timeout_ms: u32,
) -> HookDefinition {
    HookDefinition::new(
        HookId::new(id).expect("fixture hook id is non-empty"),
        name,
        is_new,
        origin,
        hook_type,
        command,
        timeout_ms,
    )
    .expect("fixture hook fields satisfy the limits tier")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn design_system_exposes_the_fixture_hooks() {
        let reports = FakeHookSource.hooks_for("proj-design-system");
        let ids: Vec<&str> = reports
            .iter()
            .map(|report| report.definition.id.as_str())
            .collect();
        assert_eq!(ids, vec!["hook-lint-on-write", "hook-notify-tool-use"]);
        assert_eq!(reports[0].reported_status, HookApprovalStatus::Pending);
        assert_eq!(reports[1].reported_status, HookApprovalStatus::Approved);
    }

    #[test]
    fn api_client_exposes_the_hook_its_seed_decided() {
        let reports = FakeHookSource.hooks_for("proj-api-client");
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].definition.id.as_str(), "hook-lint-on-write");
    }

    #[test]
    fn unknown_projects_have_no_hooks() {
        assert!(FakeHookSource.hooks_for("proj-ghost").is_empty());
    }
}
