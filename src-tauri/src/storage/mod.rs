//! Embedded SQLite storage foundation (issue #82, planned in #81).
//!
//! One database file in `app_data_dir()` owned exclusively by the Rust core:
//! the webview never sees SQL, a connection or a file path, and no IPC command
//! or capability exposes this module. Feature repositories receive a cloned
//! [`Database`] handle and run their statements through [`Database::run`],
//! which executes on Tokio's blocking pool.

mod database;
mod migrations;

pub use database::{DATABASE_FILE_NAME, Database, DatabaseError};
pub use migrations::LATEST_SCHEMA_VERSION;
