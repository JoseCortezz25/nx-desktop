// Shared cross-language IPC contract primitives (issue #16) plus the
// implemented backends: providers (#17), projects/conversations with the
// workspace path policy (#18), the run supervisor with its Channel stream
// (#19), the approval policy plus hook review (#20), the workspace
// file/open-target/diff services (#21), persisted catalogs (#22) and the
// Claude provider adapter (#25). Remaining services land on their own tickets.
pub mod features;
pub mod ipc;
pub mod persistence;
pub mod security;

use std::sync::Arc;

use tauri::Manager;

use features::conversations::{
    commands as conversation_commands,
    service::{ConversationStore, SystemClock},
};
use features::diff::{adapters::git::GitDiffSource, commands::read_workspace_diff};
use features::files::{
    adapters::system::SystemOpenTargetLauncher,
    commands::{list_open_targets, open_in_target},
};
use features::hooks::{
    adapters::fake::FakeHookSource,
    commands::{list_hooks, set_hook_decision},
    service::HookService,
};
use features::projects::{commands as project_commands, service::ProjectStore};
use features::providers::{
    adapters::{
        claude::{ClaudeAgentProvider, config::ClaudeConfig},
        env_credentials::EnvCredentialSource,
        fake::FakeAgentProvider,
    },
    commands::{list_models, list_providers},
    service::ProviderRegistry,
};
use features::runs::{
    adapters::{fake::FakeAgentRunner, routing::ProviderRoutingRunner},
    commands::{cancel_run, get_run, start_run},
    supervisor::RunSupervisor,
};
use features::workspace::commands::read_file;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Declares the native application menu from Tauri's platform defaults.
///
/// Issue #42: the application menu is the operating system's, so it is declared
/// here in Rust instead of being drawn by the frontend. `Menu::default` contains
/// only predefined OS/Tauri items (the app menu on macOS; File, Edit, View,
/// Window and Help submenus elsewhere) and defines **no product commands** — the
/// maintainer's decision for #42. Product-specific menu actions stay out of scope
/// until they are separately defined, and the four wireframe labels the drawn bar
/// used (`Archivo`, `Edición`, `Ver`, `Ayuda`) MUST NOT be ported here.
#[cfg(desktop)]
fn default_app_menu(handle: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    tauri::menu::Menu::default(handle)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The Claude adapter is registered alongside (not instead of) the fake
    // catalog. Its API key is resolved in Rust from the process environment
    // at run time and never crosses IPC; without one it still lists, and its
    // runs fail with a mapped `provider_unavailable` error.
    let claude = Arc::new(
        ClaudeAgentProvider::new(
            ClaudeConfig::default(),
            Arc::new(EnvCredentialSource::from_process_env()),
        )
        .expect("Claude HTTP client initialises"),
    );
    let registry = ProviderRegistry::from_sources(&[&FakeAgentProvider, claude.as_ref()]);
    let claude_provider_id = claude.provider_id().as_str().to_owned();
    let router = ProviderRoutingRunner::new(Arc::new(FakeAgentRunner::default()))
        .with_route(claude_provider_id, claude);
    let runs = RunSupervisor::new(Arc::new(router));
    let hooks = HookService::new(Arc::new(FakeHookSource));
    let open_targets = SystemOpenTargetLauncher;
    let diff_source = GitDiffSource;
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(registry)
        .manage(runs)
        .manage(hooks)
        .manage(open_targets)
        .manage(diff_source)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let projects = ProjectStore::with_persistence(data_dir.join("projects.json"))?;
            let conversations = ConversationStore::with_persistence(
                data_dir.join("conversations.json"),
                Box::new(SystemClock),
            )?;
            app.manage(projects);
            app.manage(conversations);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            list_providers,
            list_models,
            project_commands::list_projects,
            project_commands::create_project,
            project_commands::set_project_approval_mode,
            project_commands::list_workspace_branches,
            conversation_commands::list_conversations,
            conversation_commands::create_conversation,
            start_run,
            cancel_run,
            get_run,
            list_hooks,
            set_hook_decision,
            read_file,
            list_open_targets,
            open_in_target,
            read_workspace_diff
        ]);

    // The native menu is declared explicitly on every desktop platform. macOS
    // would install `Menu::default` on its own, but Windows and Linux show no
    // menu bar unless the app sets one, so the declaration is unconditional here.
    #[cfg(desktop)]
    let builder = builder.menu(default_app_menu);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, desktop))]
mod tests {
    use super::default_app_menu;

    /// Compile-time proof that the app-menu declaration has the exact shape
    /// `tauri::Builder::menu` accepts (`FnOnce(&AppHandle<R>) -> Result<Menu<R>>`).
    ///
    /// A functional assertion would need a live `AppHandle` (and the `tauri`
    /// crate's `test` feature), which this crate does not enable, so this test
    /// pins the wiring contract that the builder consumes instead of a menu
    /// instance. Content (platform defaults only, no product commands) is
    /// therefore guaranteed by `default_app_menu` itself, not by this test.
    #[test]
    fn default_app_menu_matches_builder_menu_signature() {
        fn accepts<F>(_: F)
        where
            F: FnOnce(&tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>>
                + Send
                + 'static,
        {
        }

        accepts(default_app_menu);
    }
}
