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
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet]);

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
