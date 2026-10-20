//! System open-target adapter (issue #21).
//!
//! Probes the machine and launches one authorized file. The OS-specific command
//! is built by the pure [`launch_plan`] function (tested for all three
//! platforms without spawning a GUI); the adapter only probes, then executes
//! the plan with explicit program + argv, no shell, a cleared environment and
//! null stdio.
//!
//! The locked `Abrir` decision offers only VS Code in the menu (§3.5 item 3).
//! The core still implements the OS reveal action required by #21;
//! `view_source` / `search_in_file` / `copy_path` never reach this adapter.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use super::super::domain::{OpenTarget, OpenTargetAvailability, OpenTargetError};
use super::super::ports::OpenTargetLauncher;

/// The OS family whose launch syntax is being used.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchPlatform {
    Macos,
    Windows,
    Linux,
}

/// How VS Code is reachable on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditorInstall {
    /// macOS application bundle; opened through `/usr/bin/open -a`.
    MacAppBundle,
    /// `code` CLI resolved to an absolute path.
    Cli(PathBuf),
    /// Windows `Code.exe`.
    WindowsExe(PathBuf),
}

/// One concrete process invocation: program identity plus argv, never a shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchPlan {
    pub program: PathBuf,
    pub args: Vec<String>,
}

/// Returns the running OS family.
pub fn current_platform() -> LaunchPlatform {
    if cfg!(target_os = "macos") {
        LaunchPlatform::Macos
    } else if cfg!(target_os = "windows") {
        LaunchPlatform::Windows
    } else {
        LaunchPlatform::Linux
    }
}

/// Builds the OS-specific launch plan, or `None` when the target is not an
/// external action or its tool is unavailable.
///
/// Pure by design: callers pass the probed editor installation and reveal tool,
/// so tests can assert every platform without touching the machine.
pub fn launch_plan(
    target: OpenTarget,
    path: &Path,
    platform: LaunchPlatform,
    editor: Option<&EditorInstall>,
    reveal_tool: Option<&Path>,
) -> Option<LaunchPlan> {
    let file = path.to_string_lossy().into_owned();
    match target {
        OpenTarget::Editor => match editor? {
            EditorInstall::MacAppBundle => Some(LaunchPlan {
                program: PathBuf::from("/usr/bin/open"),
                args: vec!["-a".to_owned(), "Visual Studio Code".to_owned(), file],
            }),
            EditorInstall::Cli(program) | EditorInstall::WindowsExe(program) => Some(LaunchPlan {
                program: program.clone(),
                args: vec![file],
            }),
        },
        OpenTarget::RevealInFileManager => {
            let program = reveal_tool?.to_path_buf();
            let args = match platform {
                LaunchPlatform::Macos => vec!["-R".to_owned(), file],
                LaunchPlatform::Windows => vec![format!("/select,{file}")],
                LaunchPlatform::Linux => {
                    let parent = path
                        .parent()
                        .filter(|parent| !parent.as_os_str().is_empty())
                        .unwrap_or(path);
                    vec![parent.to_string_lossy().into_owned()]
                }
            };
            Some(LaunchPlan { program, args })
        }
        OpenTarget::ViewSource | OpenTarget::SearchInFile | OpenTarget::CopyPath => None,
    }
}

/// Real machine probe and launcher.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemOpenTargetLauncher;

impl OpenTargetLauncher for SystemOpenTargetLauncher {
    fn availability(&self) -> Vec<OpenTargetAvailability> {
        vec![
            OpenTargetAvailability {
                target: OpenTarget::Editor,
                is_installed: editor_install().is_some(),
            },
            OpenTargetAvailability {
                target: OpenTarget::RevealInFileManager,
                is_installed: reveal_tool().is_some(),
            },
        ]
    }

    fn launch(&self, target: OpenTarget, path: &Path) -> Result<(), OpenTargetError> {
        let editor = editor_install();
        let reveal = reveal_tool();
        let plan = launch_plan(
            target,
            path,
            current_platform(),
            editor.as_ref(),
            reveal.as_deref(),
        )
        .ok_or_else(|| OpenTargetError::TargetUnavailable {
            target: target.as_str().to_owned(),
        })?;

        let mut command = Command::new(&plan.program);
        command
            .args(&plan.args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .env_clear()
            .env("PATH", std::env::var_os("PATH").unwrap_or_default());
        #[cfg(windows)]
        if let Some(system_root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", system_root);
        }
        #[cfg(windows)]
        for variable in ["USERPROFILE", "APPDATA", "LOCALAPPDATA"] {
            if let Some(value) = std::env::var_os(variable) {
                command.env(variable, value);
            }
        }
        #[cfg(unix)]
        if let Some(home) = std::env::var_os("HOME") {
            command.env("HOME", home);
        }
        // GUI launchers need their display/server environment; these are
        // session identifiers, not secrets.
        #[cfg(target_os = "linux")]
        for variable in [
            "DISPLAY",
            "WAYLAND_DISPLAY",
            "XDG_RUNTIME_DIR",
            "DBUS_SESSION_BUS_ADDRESS",
        ] {
            if let Some(value) = std::env::var_os(variable) {
                command.env(variable, value);
            }
        }
        if let Some(parent) = path.parent() {
            command.current_dir(parent);
        }

        let mut child = command.spawn().map_err(|_| OpenTargetError::LaunchFailed {
            target: target.as_str().to_owned(),
        })?;
        // Reap the launcher without blocking the command or the UI. The editor
        // itself may keep running after this short-lived process exits.
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }
}

fn editor_install() -> Option<EditorInstall> {
    match current_platform() {
        LaunchPlatform::Macos => {
            if Path::new("/Applications/Visual Studio Code.app").exists() {
                Some(EditorInstall::MacAppBundle)
            } else {
                find_in_path("code").map(EditorInstall::Cli)
            }
        }
        LaunchPlatform::Windows => windows_code_paths()
            .into_iter()
            .find(|candidate| candidate.is_file())
            .or_else(|| find_in_path("code.exe"))
            .map(EditorInstall::WindowsExe),
        LaunchPlatform::Linux => find_in_path("code").map(EditorInstall::Cli),
    }
}

fn reveal_tool() -> Option<PathBuf> {
    match current_platform() {
        LaunchPlatform::Macos => {
            let open = PathBuf::from("/usr/bin/open");
            open.is_file().then_some(open)
        }
        LaunchPlatform::Windows => std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .map(|root| root.join("explorer.exe"))
            .filter(|explorer| explorer.is_file()),
        LaunchPlatform::Linux => find_in_path("xdg-open"),
    }
}

fn windows_code_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        paths.push(PathBuf::from(local).join(r"Programs\Microsoft VS Code\Code.exe"));
    }
    for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(program_files) = std::env::var_os(variable) {
            paths.push(PathBuf::from(program_files).join(r"Microsoft VS Code\Code.exe"));
        }
    }
    paths
}

fn find_in_path(executable: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|directory| directory.join(executable))
        .find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(
        target: OpenTarget,
        path: &str,
        platform: LaunchPlatform,
        editor: Option<&EditorInstall>,
        reveal: Option<&Path>,
    ) -> Option<LaunchPlan> {
        launch_plan(target, Path::new(path), platform, editor, reveal)
    }

    #[test]
    fn macos_opens_the_app_bundle_through_open() {
        let editor = EditorInstall::MacAppBundle;
        let plan = plan(
            OpenTarget::Editor,
            "/workspace/src/App.tsx",
            LaunchPlatform::Macos,
            Some(&editor),
            None,
        )
        .expect("editor plan");
        assert_eq!(plan.program, PathBuf::from("/usr/bin/open"));
        assert_eq!(
            plan.args,
            vec![
                "-a".to_owned(),
                "Visual Studio Code".to_owned(),
                "/workspace/src/App.tsx".to_owned()
            ]
        );
    }

    #[test]
    fn macos_reveals_with_open_r() {
        let reveal = Path::new("/usr/bin/open");
        let plan = plan(
            OpenTarget::RevealInFileManager,
            "/workspace/src/App.tsx",
            LaunchPlatform::Macos,
            None,
            Some(reveal),
        )
        .expect("reveal plan");
        assert_eq!(
            plan.args,
            vec!["-R".to_owned(), "/workspace/src/App.tsx".to_owned()]
        );
    }

    #[test]
    fn windows_launches_code_exe_directly() {
        let editor = EditorInstall::WindowsExe(PathBuf::from(r"C:\VS Code\Code.exe"));
        let plan = plan(
            OpenTarget::Editor,
            r"C:\workspace\src\App.tsx",
            LaunchPlatform::Windows,
            Some(&editor),
            None,
        )
        .expect("editor plan");
        assert_eq!(plan.program, PathBuf::from(r"C:\VS Code\Code.exe"));
        assert_eq!(plan.args, vec![r"C:\workspace\src\App.tsx".to_owned()]);
    }

    #[test]
    fn windows_reveals_with_explorer_select() {
        let reveal = Path::new(r"C:\Windows\explorer.exe");
        let plan = plan(
            OpenTarget::RevealInFileManager,
            r"C:\workspace\src\App.tsx",
            LaunchPlatform::Windows,
            None,
            Some(reveal),
        )
        .expect("reveal plan");
        assert_eq!(
            plan.args,
            vec![r"/select,C:\workspace\src\App.tsx".to_owned()]
        );
    }

    #[test]
    fn linux_opens_the_file_manager_on_the_parent() {
        let reveal = Path::new("/usr/bin/xdg-open");
        let plan = plan(
            OpenTarget::RevealInFileManager,
            "/workspace/src/App.tsx",
            LaunchPlatform::Linux,
            None,
            Some(reveal),
        )
        .expect("reveal plan");
        assert_eq!(plan.args, vec!["/workspace/src".to_owned()]);
    }

    #[test]
    fn linux_launches_the_code_cli() {
        let editor = EditorInstall::Cli(PathBuf::from("/usr/bin/code"));
        let plan = plan(
            OpenTarget::Editor,
            "/workspace/src/App.tsx",
            LaunchPlatform::Linux,
            Some(&editor),
            None,
        )
        .expect("editor plan");
        assert_eq!(plan.program, PathBuf::from("/usr/bin/code"));
        assert_eq!(plan.args, vec!["/workspace/src/App.tsx".to_owned()]);
    }

    #[test]
    fn in_app_targets_and_missing_tools_have_no_plan() {
        let editor = EditorInstall::Cli(PathBuf::from("/usr/bin/code"));
        for target in [
            OpenTarget::ViewSource,
            OpenTarget::SearchInFile,
            OpenTarget::CopyPath,
        ] {
            assert_eq!(
                plan(
                    target,
                    "/workspace/src/App.tsx",
                    LaunchPlatform::Linux,
                    Some(&editor),
                    Some(Path::new("/usr/bin/xdg-open")),
                ),
                None
            );
        }
        assert_eq!(
            plan(
                OpenTarget::Editor,
                "/workspace/src/App.tsx",
                LaunchPlatform::Linux,
                None,
                None,
            ),
            None
        );
        assert_eq!(
            plan(
                OpenTarget::RevealInFileManager,
                "/workspace/src/App.tsx",
                LaunchPlatform::Linux,
                None,
                None,
            ),
            None
        );
    }
}
