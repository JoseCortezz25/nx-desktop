//! The shared SQLite connection handle and its blocking-safe access helper.

use std::fmt;
use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

use super::migrations;

/// File name of the database inside `app_data_dir()`.
pub const DATABASE_FILE_NAME: &str = "nx-desktop.sqlite3";

/// Milliseconds a statement waits on a locked database before failing.
const BUSY_TIMEOUT_MS: u32 = 5000;

/// One embedded SQLite database owned by the Rust core.
///
/// Cloning shares the same connection. The `std::sync::Mutex` is only ever
/// locked inside a [`Database::run`] closure on the blocking pool, so no guard
/// crosses an `.await`.
#[derive(Clone)]
pub struct Database {
    connection: Arc<Mutex<Connection>>,
}

impl fmt::Debug for Database {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("Database").finish_non_exhaustive()
    }
}

impl Database {
    /// Opens (or creates) the database file and runs pending migrations.
    ///
    /// A database whose schema is newer than this binary knows is refused with
    /// [`DatabaseError::UnsupportedSchemaVersion`] before any pragma or
    /// migration writes to it, so the file is left untouched.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, DatabaseError> {
        let path = path.as_ref();
        if let Some(parent) = path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }
        Self::initialize(Connection::open(path)?)
    }

    /// Opens a private in-memory database with the same schema (tests and
    /// repository adapters' contract checks).
    pub fn open_in_memory() -> Result<Self, DatabaseError> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(mut connection: Connection) -> Result<Self, DatabaseError> {
        // `busy_timeout` and `foreign_keys` are per-connection settings and
        // write nothing; the version check must precede the WAL switch, which
        // rewrites the file header.
        connection.busy_timeout(std::time::Duration::from_millis(u64::from(BUSY_TIMEOUT_MS)))?;
        connection.pragma_update(None, "foreign_keys", true)?;
        migrations::ensure_supported(&connection)?;
        // In-memory databases answer `memory`; files switch to `wal`.
        let _mode: String =
            connection.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
        migrations::migrate(&mut connection)?;
        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
        })
    }

    /// Runs `work` against the connection on Tokio's blocking pool.
    ///
    /// The lock is taken and released inside the blocking closure, so callers
    /// may `.await` this from async commands without holding a guard across a
    /// suspension point or blocking the async worker.
    pub async fn run<T, E, F>(&self, work: F) -> Result<T, E>
    where
        F: FnOnce(&mut Connection) -> Result<T, E> + Send + 'static,
        T: Send + 'static,
        E: From<DatabaseError> + Send + 'static,
    {
        let connection = Arc::clone(&self.connection);
        tokio::task::spawn_blocking(move || {
            let mut guard = connection
                .lock()
                .map_err(|_| E::from(DatabaseError::ConnectionPoisoned))?;
            work(&mut guard)
        })
        .await
        .map_err(|_| E::from(DatabaseError::TaskAborted))?
    }
}

/// The ways opening or using the database can fail.
#[derive(Debug)]
pub enum DatabaseError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    /// The file was written by a newer binary; it is refused, never truncated.
    UnsupportedSchemaVersion {
        found: u32,
        latest: u32,
    },
    /// `user_version` holds a value no binary of this app writes.
    InvalidSchemaVersion {
        found: i64,
    },
    /// A previous holder of the connection lock panicked.
    ConnectionPoisoned,
    /// The blocking task panicked or was cancelled before finishing.
    TaskAborted,
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "database I/O failed: {error}"),
            Self::Sqlite(error) => write!(formatter, "database operation failed: {error}"),
            Self::UnsupportedSchemaVersion { found, latest } => write!(
                formatter,
                "database schema version {found} is newer than the supported version {latest}"
            ),
            Self::InvalidSchemaVersion { found } => {
                write!(formatter, "database schema version {found} is invalid")
            }
            Self::ConnectionPoisoned => write!(formatter, "database connection lock is poisoned"),
            Self::TaskAborted => write!(formatter, "database task was aborted"),
        }
    }
}

impl std::error::Error for DatabaseError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
            Self::UnsupportedSchemaVersion { .. }
            | Self::InvalidSchemaVersion { .. }
            | Self::ConnectionPoisoned
            | Self::TaskAborted => None,
        }
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::super::migrations::{LATEST_SCHEMA_VERSION, migrate, schema_version};
    use super::*;

    const EXPECTED_TABLES: &[&str] = &[
        "conversations",
        "file_references",
        "hook_decisions",
        "messages",
        "project_workspace_folders",
        "projects",
        "runs",
        "schema_migrations",
        "tool_calls",
        "ui_preferences",
    ];

    /// A unique, empty directory per test (no extra dev-dependency needed).
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "nx-storage-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or_default()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn tables(connection: &Connection) -> Vec<String> {
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .expect("table query prepares");
        statement
            .query_map([], |row| row.get(0))
            .expect("table query runs")
            .collect::<Result<_, _>>()
            .expect("table names read")
    }

    async fn read_version(database: &Database) -> u32 {
        database
            .run(|connection| schema_version(connection))
            .await
            .expect("schema version reads")
    }

    #[tokio::test]
    async fn in_memory_database_migrates_to_the_full_schema() {
        let database = Database::open_in_memory().expect("in-memory database opens");

        assert_eq!(read_version(&database).await, LATEST_SCHEMA_VERSION);
        let names = database
            .run(|connection| Ok::<_, DatabaseError>(tables(connection)))
            .await
            .expect("tables list");
        assert_eq!(names, EXPECTED_TABLES);
        let recorded: Vec<u32> = database
            .run(|connection| {
                let mut statement =
                    connection.prepare("SELECT version FROM schema_migrations ORDER BY version")?;
                let rows = statement
                    .query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<u32>, _>>()?;
                Ok::<_, DatabaseError>(rows)
            })
            .await
            .expect("migration log reads");
        assert_eq!(recorded, (1..=LATEST_SCHEMA_VERSION).collect::<Vec<_>>());
    }

    #[tokio::test]
    async fn file_database_uses_the_required_pragmas() {
        let dir = temp_dir("pragmas");
        let database = Database::open(dir.join(DATABASE_FILE_NAME)).expect("file database opens");

        let (journal_mode, foreign_keys, busy_timeout) = database
            .run(|connection| {
                let journal: String =
                    connection.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
                let keys: i64 =
                    connection.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
                let timeout: i64 =
                    connection.query_row("PRAGMA busy_timeout", [], |row| row.get(0))?;
                Ok::<_, DatabaseError>((journal, keys, timeout))
            })
            .await
            .expect("pragmas read");

        assert_eq!(journal_mode, "wal");
        assert_eq!(foreign_keys, 1);
        assert_eq!(busy_timeout, i64::from(BUSY_TIMEOUT_MS));
        drop(database);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn migrations_run_once_and_are_idempotent_across_restarts() {
        let dir = temp_dir("restart");
        let path = dir.join(DATABASE_FILE_NAME);

        let first = Database::open(&path).expect("first open creates and migrates");
        first
            .run(|connection| {
                connection.execute(
                    "INSERT INTO projects (id, name, approval_mode, created_at, updated_at) \
                     VALUES ('project-1', 'Kept', 'ask', 't0', 't0')",
                    [],
                )?;
                Ok::<_, DatabaseError>(())
            })
            .await
            .expect("row inserts");
        drop(first);

        let second = Database::open(&path).expect("reopen succeeds");
        assert_eq!(read_version(&second).await, LATEST_SCHEMA_VERSION);
        let (projects, migrations_logged, rerun) = second
            .run(|connection| {
                let projects: i64 =
                    connection.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;
                let logged: i64 =
                    connection.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                        row.get(0)
                    })?;
                let rerun = migrate(connection)?;
                Ok::<_, DatabaseError>((projects, logged, rerun))
            })
            .await
            .expect("state reads");

        assert_eq!(projects, 1, "data survives a restart");
        assert_eq!(migrations_logged, i64::from(LATEST_SCHEMA_VERSION));
        assert_eq!(rerun, 0, "an up-to-date database runs no migration");
        drop(second);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_newer_schema_is_refused_and_the_file_is_left_untouched() {
        let dir = temp_dir("newer");
        std::fs::create_dir_all(&dir).expect("temp dir creates");
        let path = dir.join(DATABASE_FILE_NAME);
        let newer = LATEST_SCHEMA_VERSION + 1;
        {
            let connection = Connection::open(&path).expect("fixture opens");
            connection
                .execute_batch("CREATE TABLE future_table (id INTEGER PRIMARY KEY);")
                .expect("fixture table creates");
            connection
                .pragma_update(None, "user_version", newer)
                .expect("fixture version sets");
        }
        let before = std::fs::read(&path).expect("fixture bytes read");

        let error = Database::open(&path).expect_err("newer schema is refused");

        assert!(
            matches!(
                error,
                DatabaseError::UnsupportedSchemaVersion { found, latest }
                    if found == newer && latest == LATEST_SCHEMA_VERSION
            ),
            "unexpected error: {error}"
        );
        assert_eq!(
            std::fs::read(&path).expect("file still exists"),
            before,
            "the refused file is byte-for-byte unchanged"
        );
        let mut wal = path.clone().into_os_string();
        wal.push("-wal");
        assert!(!PathBuf::from(wal).exists(), "no WAL file was created");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_newer_in_memory_schema_is_refused_by_the_runner() {
        let mut connection = Connection::open_in_memory().expect("memory opens");
        connection
            .pragma_update(None, "user_version", LATEST_SCHEMA_VERSION + 1)
            .expect("version sets");

        let error = migrate(&mut connection).expect_err("runner refuses");

        assert!(matches!(
            error,
            DatabaseError::UnsupportedSchemaVersion { .. }
        ));
        assert!(tables(&connection).is_empty(), "nothing was created");
    }

    #[tokio::test]
    async fn deletes_cascade_from_project_to_its_history() {
        let database = Database::open_in_memory().expect("in-memory database opens");

        let remaining = database
            .run(|connection| {
                connection.execute_batch(
                    "INSERT INTO projects VALUES ('p', 'P', 'ask', 't', 't');
                     INSERT INTO project_workspace_folders VALUES ('p', 0, '/w');
                     INSERT INTO hook_decisions VALUES ('p', 'h', 'approved');
                     INSERT INTO conversations VALUES ('c', 'p', 'C', 0, 't', 't');
                     INSERT INTO messages VALUES ('m', 'c', 0, 'user', 'hi', 't', NULL);
                     INSERT INTO tool_calls VALUES ('tc', 'm', 0, 'read', 's', 'd', 'completed', NULL);
                     INSERT INTO file_references VALUES ('m', 0, 'src/main.rs');
                     INSERT INTO runs VALUES ('r', 'c', 'fake', 'm', 'low', '{}', 'completed', NULL, 't', 't');
                     DELETE FROM projects WHERE id = 'p';",
                )?;
                let mut total = 0_i64;
                for table in [
                    "project_workspace_folders",
                    "hook_decisions",
                    "conversations",
                    "messages",
                    "tool_calls",
                    "file_references",
                    "runs",
                ] {
                    let count: i64 = connection.query_row(
                        &format!("SELECT COUNT(*) FROM {table}"),
                        [],
                        |row| row.get(0),
                    )?;
                    total += count;
                }
                Ok::<_, DatabaseError>(total)
            })
            .await
            .expect("cascade runs");

        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn foreign_keys_are_enforced() {
        let database = Database::open_in_memory().expect("in-memory database opens");

        let result = database
            .run(|connection| {
                connection.execute(
                    "INSERT INTO conversations VALUES ('c', 'missing', 'C', 0, 't', 't')",
                    [],
                )?;
                Ok::<_, DatabaseError>(())
            })
            .await;

        assert!(matches!(result, Err(DatabaseError::Sqlite(_))));
    }

    #[tokio::test]
    async fn a_failed_closure_does_not_poison_later_calls() {
        let database = Database::open_in_memory().expect("in-memory database opens");

        let failed = database
            .run(|connection| {
                connection.execute("INSERT INTO no_such_table VALUES (1)", [])?;
                Ok::<_, DatabaseError>(())
            })
            .await;
        assert!(failed.is_err());

        assert_eq!(read_version(&database).await, LATEST_SCHEMA_VERSION);
    }
}
