//! Git workspace diff adapter (issue #21).
//!
//! Runs `git diff` with an authorized `cwd`, no shell, no external diff driver
//! and a bounded output, then parses the unified patch into the domain change
//! set. The `Abrir`/diff UI never runs git itself.
//!
//! `git diff HEAD` covers staged and unstaged changes. A repository without a
//! `HEAD` (no commits yet) falls back to `git diff --cached` plus `git diff`,
//! merging files by path.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use super::super::domain::{
    DiffFile, DiffHunk, DiffLine, DiffLineKind, MAX_DIFF_BYTES, MAX_DIFF_FILES, MAX_HUNKS_PER_FILE,
    MAX_LINES_PER_FILE,
};
use super::super::ports::{BoxFuture, DiffSourceError, WorkspaceDiffSource};

const GIT_TIMEOUT: Duration = Duration::from_secs(10);

/// `git diff` flags shared by every invocation.
const DIFF_FLAGS: [&str; 6] = [
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--unified=3",
    "--no-renames",
    "--no-relative",
];

/// Real git-backed workspace diff source.
#[derive(Debug, Default, Clone, Copy)]
pub struct GitDiffSource;

impl WorkspaceDiffSource for GitDiffSource {
    fn read(&self, cwd: &Path) -> BoxFuture<'_, Result<Vec<DiffFile>, DiffSourceError>> {
        let cwd = cwd.to_path_buf();
        Box::pin(async move {
            if !git_succeeds(&cwd, &["rev-parse", "--is-inside-work-tree"]).await? {
                return Err(DiffSourceError::NotARepository);
            }
            let mut global = vec!["--no-pager", "-c", "core.quotePath=false", "diff"];
            global.extend(DIFF_FLAGS);

            let files = if git_succeeds(&cwd, &["rev-parse", "--verify", "--quiet", "HEAD"]).await?
            {
                let mut args = global.clone();
                args.push("HEAD");
                parse_output(&run_git(&cwd, &args).await?)?
            } else {
                let mut staged_args = global.clone();
                staged_args.push("--cached");
                let mut files = parse_output(&run_git(&cwd, &staged_args).await?)?;
                let unstaged = parse_output(&run_git(&cwd, &global).await?)?;
                for file in unstaged {
                    merge_file(&mut files, file);
                }
                files
            };
            ensure_bounds(&files)?;
            Ok(files)
        })
    }
}

fn parse_output(bytes: &[u8]) -> Result<Vec<DiffFile>, DiffSourceError> {
    let text = String::from_utf8(bytes.to_vec()).map_err(|_| DiffSourceError::ParseFailed)?;
    parse_unified_diff(&text)
}

/// Runs git and requires a successful status.
async fn run_git(cwd: &Path, args: &[&str]) -> Result<Vec<u8>, DiffSourceError> {
    let (success, stdout) = run_git_raw(cwd, args).await?;
    if !success {
        return Err(DiffSourceError::Failed);
    }
    if stdout.len() > MAX_DIFF_BYTES {
        return Err(DiffSourceError::TooLarge);
    }
    Ok(stdout)
}

/// Runs git without treating a non-zero status as an error.
async fn run_git_raw(cwd: &Path, args: &[&str]) -> Result<(bool, Vec<u8>), DiffSourceError> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .env_clear()
        .env("PATH", std::env::var_os("PATH").unwrap_or_default())
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true);
    #[cfg(windows)]
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        command.env("SystemRoot", system_root);
    }
    #[cfg(unix)]
    if let Some(home) = std::env::var_os("HOME") {
        command.env("HOME", home);
    }

    let child = command
        .spawn()
        .map_err(|_| DiffSourceError::GitUnavailable)?;
    let output = tokio::time::timeout(GIT_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| DiffSourceError::Timeout)?
        .map_err(|_| DiffSourceError::Failed)?;
    if output.stdout.len() > MAX_DIFF_BYTES {
        return Err(DiffSourceError::TooLarge);
    }
    Ok((output.status.success(), output.stdout))
}

async fn git_succeeds(cwd: &Path, args: &[&str]) -> Result<bool, DiffSourceError> {
    run_git_raw(cwd, args).await.map(|(success, _)| success)
}

#[derive(Default)]
struct FileBuilder {
    path: String,
    hunks: Vec<DiffHunk>,
}

/// Parses one unified `git diff` patch.
///
/// Only hunks are data; metadata lines are ignored. Paths come from the
/// `---`/`+++` headers (new path when present, old path for deletions), with the
/// `a/`/`b/` prefix removed.
pub(crate) fn parse_unified_diff(text: &str) -> Result<Vec<DiffFile>, DiffSourceError> {
    let mut files = Vec::new();
    let mut builder: Option<FileBuilder> = None;
    let mut in_hunk = false;

    for raw_line in text.lines() {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.starts_with("diff --git ") {
            flush(&mut files, builder.take())?;
            builder = Some(FileBuilder::default());
            in_hunk = false;
        } else if !in_hunk && let Some(path) = line.strip_prefix("--- ") {
            if let Some(file) = builder.as_mut()
                && file.path.is_empty()
                && path != "/dev/null"
            {
                file.path = strip_git_prefix(path);
            }
            in_hunk = false;
        } else if !in_hunk && let Some(path) = line.strip_prefix("+++ ") {
            if let Some(file) = builder.as_mut()
                && path != "/dev/null"
            {
                file.path = strip_git_prefix(path);
            }
            in_hunk = false;
        } else if line.starts_with("@@") {
            if let Some(file) = builder.as_mut() {
                if file.hunks.len() >= MAX_HUNKS_PER_FILE {
                    return Err(DiffSourceError::TooLarge);
                }
                file.hunks.push(DiffHunk {
                    header: line.to_owned(),
                    lines: Vec::new(),
                });
                in_hunk = true;
            }
        } else if in_hunk {
            let Some(hunk) = builder.as_mut().and_then(|file| file.hunks.last_mut()) else {
                continue;
            };
            let (kind, content) = match line.chars().next() {
                Some('+') => (DiffLineKind::Added, &line[1..]),
                Some('-') => (DiffLineKind::Removed, &line[1..]),
                Some(' ') => (DiffLineKind::Context, &line[1..]),
                Some('\\') => continue,
                None => (DiffLineKind::Context, line),
                Some(_) => continue,
            };
            if hunk.lines.len() >= MAX_LINES_PER_FILE {
                return Err(DiffSourceError::TooLarge);
            }
            hunk.lines.push(DiffLine {
                kind,
                content: content.to_owned(),
            });
        }
    }

    flush(&mut files, builder)?;
    Ok(files)
}

fn flush(files: &mut Vec<DiffFile>, builder: Option<FileBuilder>) -> Result<(), DiffSourceError> {
    let Some(file) = builder else {
        return Ok(());
    };
    if file.path.is_empty() {
        return Ok(());
    }
    if files.len() >= MAX_DIFF_FILES {
        return Err(DiffSourceError::TooLarge);
    }
    let added_count = count(file.hunks.iter(), DiffLineKind::Added);
    let removed_count = count(file.hunks.iter(), DiffLineKind::Removed);
    files.push(DiffFile {
        path: file.path,
        added_count,
        removed_count,
        hunks: file.hunks,
    });
    Ok(())
}

fn count<'a>(hunks: impl Iterator<Item = &'a DiffHunk>, kind: DiffLineKind) -> u32 {
    let total: usize = hunks
        .map(|hunk| hunk.lines.iter().filter(|line| line.kind == kind).count())
        .sum();
    total.min(u32::MAX as usize) as u32
}

fn strip_git_prefix(path: &str) -> String {
    let path = path.trim_matches('"');
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
        .to_owned()
}

fn merge_file(files: &mut Vec<DiffFile>, file: DiffFile) {
    if let Some(existing) = files.iter_mut().find(|entry| entry.path == file.path) {
        existing.added_count = existing.added_count.saturating_add(file.added_count);
        existing.removed_count = existing.removed_count.saturating_add(file.removed_count);
        existing.hunks.extend(file.hunks);
    } else {
        files.push(file);
    }
}

fn ensure_bounds(files: &[DiffFile]) -> Result<(), DiffSourceError> {
    if files.len() > MAX_DIFF_FILES {
        return Err(DiffSourceError::TooLarge);
    }
    for file in files {
        if file.hunks.len() > MAX_HUNKS_PER_FILE {
            return Err(DiffSourceError::TooLarge);
        }
        let lines: usize = file.hunks.iter().map(|hunk| hunk.lines.len()).sum();
        if lines > MAX_LINES_PER_FILE {
            return Err(DiffSourceError::TooLarge);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command as StdCommand;

    use super::*;

    #[test]
    fn parses_the_fixture_hunk() {
        let patch = r#"diff --git a/src/App.tsx b/src/App.tsx
index 1111111..2222222 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -6,7 +6,8 @@ function App()
 function App() {
-  const [name, setName] = useState("");
+  const [provider, setProvider] = useState("claude");
+  const [model, setModel] = useState("sonnet");
 }
"#;
        let files = parse_unified_diff(patch).expect("valid patch");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "src/App.tsx");
        assert_eq!(files[0].added_count, 2);
        assert_eq!(files[0].removed_count, 1);
        assert_eq!(files[0].hunks.len(), 1);
        assert_eq!(files[0].hunks[0].header, "@@ -6,7 +6,8 @@ function App()");
        assert_eq!(files[0].hunks[0].lines.len(), 5);
        assert_eq!(files[0].hunks[0].lines[1].kind, DiffLineKind::Removed);
        assert_eq!(
            files[0].hunks[0].lines[2].content,
            "  const [provider, setProvider] = useState(\"claude\");"
        );
    }

    #[test]
    fn keeps_the_old_path_for_deleted_files_and_skips_binaries() {
        let patch = r#"diff --git a/old.ts b/old.ts
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-removed
diff --git a/logo.png b/logo.png
Binary files a/logo.png and b/logo.png differ
"#;
        let files = parse_unified_diff(patch).expect("valid patch");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "old.ts");
        assert_eq!(files[0].added_count, 0);
        assert_eq!(files[0].removed_count, 1);
    }

    #[test]
    fn ignores_non_hunk_metadata_and_the_no_newline_marker() {
        let patch = r#"diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1 +1 @@
-old
+new
\ No newline at end of file
"#;
        let files = parse_unified_diff(patch).expect("valid patch");
        assert_eq!(files[0].hunks[0].lines.len(), 2);
        assert_eq!(files[0].added_count, 1);
        assert_eq!(files[0].removed_count, 1);
    }

    #[test]
    fn merges_the_same_path_across_two_patches() {
        let staged = r#"diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1 +1 @@
-old
+staged
"#;
        let unstaged = r#"diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -2 +2 @@
-old-two
+unstaged
"#;
        let mut files = parse_unified_diff(staged).expect("staged patch");
        for file in parse_unified_diff(unstaged).expect("unstaged patch") {
            merge_file(&mut files, file);
        }
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].added_count, 2);
        assert_eq!(files[0].removed_count, 2);
        assert_eq!(files[0].hunks.len(), 2);
    }

    fn temp_repo() -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("nx-git-diff-{}-{nanos}", std::process::id()));
        fs::create_dir_all(&root).expect("scratch repo exists");
        root
    }

    fn run_git(dir: &Path, args: &[&str]) {
        let status = StdCommand::new("git")
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git runs");
        assert!(status.success(), "git {args:?} failed");
    }

    #[tokio::test]
    async fn reads_a_real_working_tree_diff() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("app.ts"), "one\ntwo\n").expect("fixture file");
        run_git(&repo, &["add", "."]);
        run_git(
            &repo,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-qm",
                "init",
            ],
        );
        fs::write(repo.join("app.ts"), "one\nthree\nfour\n").expect("modified file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "app.ts");
        assert_eq!(files[0].added_count, 2);
        assert_eq!(files[0].removed_count, 1);
        assert_eq!(files[0].hunks.len(), 1);

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn reflects_a_clean_workspace_as_an_empty_list() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("app.ts"), "one\n").expect("fixture file");
        run_git(&repo, &["add", "."]);
        run_git(
            &repo,
            &[
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=Test",
                "commit",
                "-qm",
                "init",
            ],
        );

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        assert!(files.is_empty());

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn reads_staged_changes_without_a_head_commit() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("app.ts"), "one\n").expect("fixture file");
        run_git(&repo, &["add", "."]);

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "app.ts");
        assert_eq!(files[0].added_count, 1);
        assert_eq!(files[0].removed_count, 0);

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn rejects_a_directory_that_is_not_a_repository() {
        let directory = temp_repo();
        let error = GitDiffSource
            .read(&directory)
            .await
            .expect_err("not a repository");
        assert_eq!(error, DiffSourceError::NotARepository);
        fs::remove_dir_all(&directory).expect("scratch cleanup");
    }
}
