//! Versioned JSON persistence for local-core stores (issue #22).
//!
//! One concrete filesystem boundary shared by the project and conversation
//! stores: load an optional JSON document, write it atomically through a temp
//! file + rename, and surface corruption/version errors instead of silently
//! discarding user data.
//!
//! The feature stores own their `Persisted*` records; this module only moves
//! bytes. It never runs on the async worker (the stores call it synchronously),
//! and it never holds a lock across an `.await` because there is no `.await`.

use std::fmt;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde::de::DeserializeOwned;

/// One JSON document at a fixed path.
#[derive(Debug, Clone)]
pub struct JsonPersistence {
    path: PathBuf,
}

impl JsonPersistence {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Loads the document, or `None` when the file does not exist yet.
    pub fn load<T: DeserializeOwned>(&self) -> Result<Option<T>, PersistenceError> {
        match std::fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map(Some)
                .map_err(PersistenceError::Serialize),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(PersistenceError::Io(error)),
        }
    }

    /// Writes the document atomically, creating its parent directory.
    ///
    /// Unix renames replace the destination in one step; Windows refuses to
    /// rename over an existing file, so the old file is removed first there.
    pub fn save<T: Serialize>(&self, value: &T) -> Result<(), PersistenceError> {
        if let Some(parent) = self.path.parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec(value)?;
        let temp = self.temp_path();
        std::fs::write(&temp, bytes)?;
        #[cfg(windows)]
        if self.path.exists() {
            std::fs::remove_file(&self.path)?;
        }
        std::fs::rename(&temp, &self.path)?;
        Ok(())
    }

    fn temp_path(&self) -> PathBuf {
        let mut value = self.path.as_os_str().to_owned();
        value.push(".tmp");
        PathBuf::from(value)
    }
}

/// The ways JSON persistence can fail.
#[derive(Debug)]
pub enum PersistenceError {
    Io(io::Error),
    Serialize(serde_json::Error),
    /// A document written by a future/older format.
    UnsupportedVersion {
        found: u32,
        expected: u32,
    },
    /// A persisted record no longer satisfies the domain invariants.
    InvalidData {
        field: &'static str,
    },
}

impl fmt::Display for PersistenceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "persistence I/O failed: {error}"),
            Self::Serialize(error) => write!(formatter, "persisted JSON is invalid: {error}"),
            Self::UnsupportedVersion { found, expected } => write!(
                formatter,
                "persisted format version {found} is not supported (expected {expected})"
            ),
            Self::InvalidData { field } => {
                write!(formatter, "persisted data is invalid at {field}")
            }
        }
    }
}

impl std::error::Error for PersistenceError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Serialize(error) => Some(error),
            Self::UnsupportedVersion { .. } | Self::InvalidData { .. } => None,
        }
    }
}

impl From<io::Error> for PersistenceError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for PersistenceError {
    fn from(error: serde_json::Error) -> Self {
        Self::Serialize(error)
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::{Value, json};

    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("nx-persistence-{name}-{}.json", std::process::id()))
    }

    #[test]
    fn round_trips_a_document_and_creates_its_parent() {
        let root = std::env::temp_dir().join(format!("nx-persistence-dir-{}", std::process::id()));
        let path = root.join("nested/store.json");
        let persistence = JsonPersistence::new(&path);
        let value = json!({ "version": 1, "rows": [1, 2, 3] });

        persistence.save(&value).expect("document saves");
        assert_eq!(
            persistence.load::<Value>().expect("document loads"),
            Some(value)
        );
        assert!(path.is_file());
        assert!(
            !JsonPersistence::new(path.with_extension("json.tmp"))
                .path()
                .exists()
        );

        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn a_missing_file_loads_as_none() {
        let path = temp_path("missing");
        let _ = fs::remove_file(&path);
        assert_eq!(
            JsonPersistence::new(&path)
                .load::<Value>()
                .expect("missing is not an error"),
            None
        );
    }

    #[test]
    fn a_corrupt_file_is_reported() {
        let path = temp_path("corrupt");
        fs::write(&path, b"{not json").expect("fixture file");
        let error = JsonPersistence::new(&path)
            .load::<Value>()
            .expect_err("corrupt JSON");
        assert!(matches!(error, PersistenceError::Serialize(_)));
        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn unsupported_versions_and_invalid_fields_are_distinct() {
        let version = PersistenceError::UnsupportedVersion {
            found: 2,
            expected: 1,
        };
        assert!(version.to_string().contains("version 2"));
        let invalid = PersistenceError::InvalidData {
            field: "projects[0].id",
        };
        assert!(invalid.to_string().contains("projects[0].id"));
    }
}
