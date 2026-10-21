//! Test helpers for the OpenCode adapter (issue #27): unique temp
//! directories and fake `opencode` executables. No test runs the real
//! binary or reaches the network.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

/// A temp directory removed on drop.
pub struct TempDir(PathBuf);

impl TempDir {
    pub fn new(label: &str) -> Self {
        let sequence = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "nx-opencode-{label}-{}-{sequence}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&path);
        std::fs::create_dir_all(&path).expect("create temp dir");
        Self(std::fs::canonicalize(&path).expect("canonical temp dir"))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Writes an executable `/bin/sh` script named `opencode` into `dir`.
#[cfg(unix)]
pub fn fake_binary(dir: &Path, body: &str) -> PathBuf {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    let path = dir.join("opencode");
    {
        let mut file = std::fs::File::create(&path).expect("create fake binary");
        file.write_all(format!("#!/bin/sh\n{body}\n").as_bytes())
            .expect("write fake binary");
        file.sync_all().expect("flush fake binary");
    }
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
        .expect("chmod fake binary");
    path
}
