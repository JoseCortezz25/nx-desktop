//! Forward-only schema migrations keyed on `PRAGMA user_version`.
//!
//! Migrations are ordered `const` SQL strings embedded in the binary. The
//! migration at index `i` moves the schema from version `i` to `i + 1`, and
//! each one runs in its own transaction together with the `user_version` bump
//! and its `schema_migrations` row, so a failure leaves the previous version
//! intact. A database newer than [`LATEST_SCHEMA_VERSION`] is refused before
//! anything is written.

use rusqlite::{Connection, params};

use super::database::DatabaseError;

/// Migration 1: the full schema planned in #81. Later slices only add columns.
///
/// Enum columns store the same `snake_case` values the JSON files use today;
/// timestamps are RFC 3339 text. Deletes cascade project → conversations →
/// messages → tool calls / file references, and conversation → runs.
const MIGRATION_0001_INITIAL_SCHEMA: &str = "
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    approval_mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE project_workspace_folders (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY (project_id, position)
);

CREATE TABLE hook_decisions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    hook_id TEXT NOT NULL,
    approval_status TEXT NOT NULL,
    PRIMARY KEY (project_id, hook_id)
);

CREATE TABLE conversations (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX conversations_project_id ON conversations(project_id);

CREATE TABLE messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    run_id TEXT NULL,
    UNIQUE (conversation_id, position)
);

CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    detail TEXT NOT NULL,
    status TEXT NOT NULL,
    subagent_id TEXT NULL,
    UNIQUE (message_id, position)
);

CREATE TABLE file_references (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    path TEXT NOT NULL,
    PRIMARY KEY (message_id, position)
);

CREATE TABLE runs (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    effort_level TEXT NOT NULL,
    environment_json TEXT NOT NULL,
    status TEXT NOT NULL,
    error_code TEXT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NULL
);
CREATE INDEX runs_conversation_id ON runs(conversation_id);

CREATE TABLE ui_preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
";

/// Every migration, in application order. Append only; never edit or reorder.
const MIGRATIONS: &[&str] = &[MIGRATION_0001_INITIAL_SCHEMA];

/// The schema version this binary produces.
pub const LATEST_SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

/// Reads the schema version stored in the database header.
pub(super) fn schema_version(connection: &Connection) -> Result<u32, DatabaseError> {
    let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    u32::try_from(version).map_err(|_| DatabaseError::InvalidSchemaVersion { found: version })
}

/// Refuses a database written by a newer binary, without writing to it.
pub(super) fn ensure_supported(connection: &Connection) -> Result<u32, DatabaseError> {
    let found = schema_version(connection)?;
    if found > LATEST_SCHEMA_VERSION {
        return Err(DatabaseError::UnsupportedSchemaVersion {
            found,
            latest: LATEST_SCHEMA_VERSION,
        });
    }
    Ok(found)
}

/// Applies every pending migration and returns how many ran.
///
/// Idempotent: a database already at [`LATEST_SCHEMA_VERSION`] runs nothing.
pub(super) fn migrate(connection: &mut Connection) -> Result<u32, DatabaseError> {
    let current = ensure_supported(connection)?;
    let mut applied = 0;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let version = index as u32 + 1;
        let transaction = connection.transaction()?;
        transaction.execute_batch(sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations (version, applied_at) \
             VALUES (?1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            params![version],
        )?;
        transaction.pragma_update(None, "user_version", version)?;
        transaction.commit()?;
        applied += 1;
    }
    Ok(applied)
}
