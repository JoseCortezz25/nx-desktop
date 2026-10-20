//! Open-target commands (issue #21).
//!
//! Thin input adapters: validate the request ids, delegate to the service and
//! map failures to [`AppErrorDto`]. The commands never spawn a process
//! themselves; the machine adapter does, after the path and target checks.

use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use super::adapters::system::SystemOpenTargetLauncher;
use super::domain::{OpenTarget, OpenTargetAvailability, OpenTargetError};
use super::dto::{OpenInTargetRequestDto, OpenTargetAvailabilityDto, OpenTargetDto};
use super::service;
use crate::features::projects::domain::ProjectId;
use crate::features::projects::service::ProjectStore;
use crate::ipc::error::{AppErrorCode, AppErrorDto};

/// Monotonic suffix for command correlation ids (`req-<n>`).
static REQUEST_SEQ: AtomicU64 = AtomicU64::new(1);

fn request_id() -> String {
    format!("req-{}", REQUEST_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn validation_error(message: &str) -> AppErrorDto {
    AppErrorDto::new(
        AppErrorCode::ValidationFailed,
        message.to_owned(),
        request_id(),
    )
}

fn open_target_error(error: OpenTargetError) -> AppErrorDto {
    let (code, message) = match &error {
        OpenTargetError::UnknownProject { project_id } => (
            AppErrorCode::PermissionDenied,
            format!("unknown project: {project_id}"),
        ),
        OpenTargetError::PathDenied { path } => (
            AppErrorCode::PermissionDenied,
            format!("path is outside the authorized workspace root: {path}"),
        ),
        OpenTargetError::UnsupportedTarget { target } => (
            AppErrorCode::PermissionDenied,
            format!("target is not launchable from the core: {target}"),
        ),
        OpenTargetError::TargetUnavailable { target } => (
            AppErrorCode::PermissionDenied,
            format!("target is not installed on this machine: {target}"),
        ),
        OpenTargetError::InvalidPath { path } => (
            AppErrorCode::ValidationFailed,
            format!("path is not a valid workspace path: {path}"),
        ),
        OpenTargetError::FileNotFound { path } => (
            AppErrorCode::ValidationFailed,
            format!("file does not exist in the workspace: {path}"),
        ),
        OpenTargetError::LaunchFailed { target } => (
            AppErrorCode::InternalError,
            format!("target could not be launched: {target}"),
        ),
    };
    AppErrorDto::new(code, message, request_id())
}

fn to_open_target_dto(target: OpenTarget) -> OpenTargetDto {
    match target {
        OpenTarget::Editor => OpenTargetDto::Editor,
        OpenTarget::ViewSource => OpenTargetDto::ViewSource,
        OpenTarget::SearchInFile => OpenTargetDto::SearchInFile,
        OpenTarget::RevealInFileManager => OpenTargetDto::RevealInFileManager,
        OpenTarget::CopyPath => OpenTargetDto::CopyPath,
    }
}

fn from_open_target_dto(dto: OpenTargetDto) -> OpenTarget {
    match dto {
        OpenTargetDto::Editor => OpenTarget::Editor,
        OpenTargetDto::ViewSource => OpenTarget::ViewSource,
        OpenTargetDto::SearchInFile => OpenTarget::SearchInFile,
        OpenTargetDto::RevealInFileManager => OpenTarget::RevealInFileManager,
        OpenTargetDto::CopyPath => OpenTarget::CopyPath,
    }
}

fn to_availability_dto(availability: OpenTargetAvailability) -> OpenTargetAvailabilityDto {
    OpenTargetAvailabilityDto {
        target: to_open_target_dto(availability.target),
        is_installed: availability.is_installed,
    }
}

/// Reports the machine's external open targets.
#[tauri::command]
pub fn list_open_targets(
    launcher: State<'_, SystemOpenTargetLauncher>,
) -> Result<Vec<OpenTargetAvailabilityDto>, AppErrorDto> {
    Ok(service::list_open_targets(launcher.inner())
        .into_iter()
        .map(to_availability_dto)
        .collect())
}

/// Opens one authorized workspace file in `target`; resolves `null`.
#[tauri::command]
pub fn open_in_target(
    projects: State<'_, ProjectStore>,
    launcher: State<'_, SystemOpenTargetLauncher>,
    request: OpenInTargetRequestDto,
) -> Result<(), AppErrorDto> {
    let project_id = ProjectId::new(request.project_id)
        .map_err(|_| validation_error("projectId is not a valid id"))?;
    let target = from_open_target_dto(request.target);
    service::open_in_target(
        &projects,
        launcher.inner(),
        &project_id,
        target,
        &request.path,
    )
    .map_err(open_target_error)
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::sync::Mutex;

    use super::*;
    use crate::features::files::ports::OpenTargetLauncher;

    struct RecordingLauncher {
        available: Vec<OpenTargetAvailability>,
        launches: Mutex<Vec<(OpenTarget, std::path::PathBuf)>>,
    }

    impl RecordingLauncher {
        fn new() -> Self {
            Self {
                available: vec![
                    OpenTargetAvailability {
                        target: OpenTarget::Editor,
                        is_installed: true,
                    },
                    OpenTargetAvailability {
                        target: OpenTarget::RevealInFileManager,
                        is_installed: true,
                    },
                ],
                launches: Mutex::new(Vec::new()),
            }
        }
    }

    impl OpenTargetLauncher for RecordingLauncher {
        fn availability(&self) -> Vec<OpenTargetAvailability> {
            self.available.clone()
        }

        fn launch(&self, target: OpenTarget, path: &Path) -> Result<(), OpenTargetError> {
            self.launches
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .push((target, path.to_path_buf()));
            Ok(())
        }
    }

    fn fixture(name: &str) -> serde_json::Value {
        let raw = match name {
            "files-list-open-targets.json" => {
                include_str!("../../../../docs/ipc/fixtures/files-list-open-targets.json")
            }
            "files-open-in-target.json" => {
                include_str!("../../../../docs/ipc/fixtures/files-open-in-target.json")
            }
            other => panic!("unknown fixture: {other}"),
        };
        serde_json::from_str(raw).expect("fixture parses")
    }

    #[test]
    fn availability_output_matches_the_pinned_fixture() {
        let expected: Vec<OpenTargetAvailabilityDto> =
            serde_json::from_value(fixture("files-list-open-targets.json")["response"].clone())
                .expect("availability response deserializes");
        let launcher = RecordingLauncher::new();
        let actual: Vec<OpenTargetAvailabilityDto> = service::list_open_targets(&launcher)
            .into_iter()
            .map(to_availability_dto)
            .collect();
        assert_eq!(actual, expected);
    }

    #[test]
    fn target_mapping_round_trips_every_closed_value() {
        for dto in [
            OpenTargetDto::Editor,
            OpenTargetDto::ViewSource,
            OpenTargetDto::SearchInFile,
            OpenTargetDto::RevealInFileManager,
            OpenTargetDto::CopyPath,
        ] {
            assert_eq!(to_open_target_dto(from_open_target_dto(dto)), dto);
        }
    }

    #[test]
    fn open_request_matches_the_pinned_fixture_shape() {
        let raw: OpenInTargetRequestDto =
            serde_json::from_value(fixture("files-open-in-target.json")["request"].clone())
                .expect("open request deserializes");
        assert_eq!(raw.project_id, "proj-design-system");
        assert_eq!(raw.path, "src/App.tsx");
        assert_eq!(from_open_target_dto(raw.target), OpenTarget::Editor);
        assert_eq!(
            serde_json::to_value(()).expect("unit serializes"),
            serde_json::Value::Null
        );
    }

    #[test]
    fn authority_failures_carry_permission_denied() {
        for error in [
            OpenTargetError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            },
            OpenTargetError::PathDenied {
                path: "../secret".to_owned(),
            },
            OpenTargetError::UnsupportedTarget {
                target: "copy_path".to_owned(),
            },
            OpenTargetError::TargetUnavailable {
                target: "editor".to_owned(),
            },
        ] {
            let dto = open_target_error(error);
            assert_eq!(dto.code, AppErrorCode::PermissionDenied);
            assert!(!dto.retryable);
        }
    }

    #[test]
    fn missing_files_are_validation_errors() {
        let dto = open_target_error(OpenTargetError::FileNotFound {
            path: "missing.tsx".to_owned(),
        });
        assert_eq!(dto.code, AppErrorCode::ValidationFailed);
        assert!(dto.message.contains("does not exist"));
        assert!(dto.request_id.starts_with("req-"));
    }
}
