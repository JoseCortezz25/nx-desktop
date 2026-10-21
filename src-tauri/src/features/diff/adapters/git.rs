//! Git workspace diff adapter (issue #21).
//!
//! Runs `git diff` with an authorized `cwd`, no shell, no external diff driver
//! and a bounded output, then parses the unified patch into the domain change
//! set. The `Abrir`/diff UI never runs git itself.
//!
//! `git diff HEAD` covers staged and unstaged changes. A repository without a
//! `HEAD` (no commits yet) falls back to `git diff --cached` plus `git diff`,
//! merging files by path.
//!
//! Untracked, non-ignored files (issue #196) come from
//! `git ls-files --others --exclude-standard -z` and are listed as added files
//! whose single hunk is their whole content. Each path is resolved through the
//! workspace path policy before it is read; a binary file, a file over
//! [`MAX_UNTRACKED_FILE_BYTES`] or one that would exceed the remaining diff
//! budget is listed with a notice and no hunks.

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use super::super::domain::{
    DiffFile, DiffFileNotice, DiffHunk, DiffLine, DiffLineKind, MAX_DIFF_BYTES, MAX_DIFF_FILES,
    MAX_HUNKS_PER_FILE, MAX_LINES_PER_FILE, MAX_UNTRACKED_FILE_BYTES,
};
use super::super::ports::{BoxFuture, DiffSourceError, WorkspaceDiffSource};
use crate::security::path_policy::resolve_in_workspaces;

/// Bytes git inspects for a NUL when it decides a blob is binary.
const BINARY_PROBE_BYTES: usize = 8000;

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
            let files = append_untracked(&cwd, files).await?;
            ensure_bounds(&files)?;
            Ok(files)
        })
    }
}

/// Lists untracked, non-ignored files and appends them as added files.
async fn append_untracked(
    cwd: &Path,
    mut files: Vec<DiffFile>,
) -> Result<Vec<DiffFile>, DiffSourceError> {
    let listing = run_git(
        cwd,
        &[
            "--no-pager",
            "-c",
            "core.quotePath=false",
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )
    .await?;
    let paths = parse_untracked_listing(&listing);
    let roots = [cwd.to_path_buf()];
    let mut budget = MAX_DIFF_BYTES.saturating_sub(diff_content_bytes(&files));

    for path in paths {
        if files.iter().any(|file| file.path == path) {
            continue;
        }
        // Authority: a path the policy rejects (traversal or symlink escape)
        // is never read nor listed.
        let Ok(resolved) = resolve_in_workspaces(&roots, &path) else {
            continue;
        };
        let Some(file) = read_untracked(&resolved, path, &mut budget).await else {
            continue;
        };
        if files.len() >= MAX_DIFF_FILES {
            return Err(DiffSourceError::TooLarge);
        }
        files.push(file);
    }
    Ok(files)
}

/// Splits the NUL-separated `ls-files -z` output into workspace paths.
///
/// A path that is not UTF-8 cannot cross the wire as a `String` and is skipped;
/// a trailing `/` marks a nested repository, which is not a file.
fn parse_untracked_listing(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|byte| *byte == 0)
        .filter_map(|entry| std::str::from_utf8(entry).ok())
        .filter(|path| !path.is_empty() && !path.ends_with('/'))
        .map(str::to_owned)
        .collect()
}

/// Content bytes already committed to the change set.
fn diff_content_bytes(files: &[DiffFile]) -> usize {
    files
        .iter()
        .flat_map(|file| file.hunks.iter())
        .flat_map(|hunk| hunk.lines.iter())
        .map(|line| line.content.len())
        .sum()
}

/// Reads one untracked entry. Returns `None` for entries that are not files
/// (nested repositories, sockets) or that vanished since the listing.
async fn read_untracked(resolved: &Path, path: String, budget: &mut usize) -> Option<DiffFile> {
    let metadata = tokio::fs::symlink_metadata(resolved).await.ok()?;
    let content = if metadata.file_type().is_symlink() {
        // Like git, a symlink's content is its target; it is never followed.
        let target = tokio::fs::read_link(resolved).await.ok()?;
        target.to_string_lossy().into_owned().into_bytes()
    } else if metadata.is_file() {
        if metadata.len() > MAX_UNTRACKED_FILE_BYTES {
            return Some(untracked_with_notice(path, DiffFileNotice::TooLarge));
        }
        tokio::fs::read(resolved).await.ok()?
    } else {
        return None;
    };
    Some(untracked_file(path, &content, budget))
}

fn untracked_with_notice(path: String, notice: DiffFileNotice) -> DiffFile {
    DiffFile {
        path,
        added_count: 0,
        removed_count: 0,
        hunks: Vec::new(),
        notice: Some(notice),
    }
}

/// Builds the added file for one untracked entry's bytes.
///
/// Binary content (a NUL in git's probe window, or invalid UTF-8) gets the
/// binary notice; content over the per-file line bound or the remaining diff
/// byte budget gets the too-large notice. An empty file has no hunks.
pub(crate) fn untracked_file(path: String, content: &[u8], budget: &mut usize) -> DiffFile {
    let probe = &content[..content.len().min(BINARY_PROBE_BYTES)];
    if probe.contains(&0) {
        return untracked_with_notice(path, DiffFileNotice::Binary);
    }
    let Ok(text) = std::str::from_utf8(content) else {
        return untracked_with_notice(path, DiffFileNotice::Binary);
    };
    if content.len() > *budget {
        return untracked_with_notice(path, DiffFileNotice::TooLarge);
    }
    let lines: Vec<DiffLine> = text
        .lines()
        .map(|line| DiffLine {
            kind: DiffLineKind::Added,
            content: line.to_owned(),
        })
        .collect();
    if lines.len() > MAX_LINES_PER_FILE {
        return untracked_with_notice(path, DiffFileNotice::TooLarge);
    }
    *budget -= content.len();
    let added_count = lines.len().min(u32::MAX as usize) as u32;
    let hunks = if lines.is_empty() {
        Vec::new()
    } else {
        vec![DiffHunk {
            header: format!("@@ -0,0 +1,{} @@", lines.len()),
            lines,
        }]
    };
    DiffFile {
        path,
        added_count,
        removed_count: 0,
        hunks,
        notice: None,
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
        notice: None,
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
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let sequence = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let root =
            std::env::temp_dir().join(format!("nx-git-diff-{}-{sequence}", std::process::id()));
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

    fn commit_all(repo: &Path) {
        run_git(repo, &["add", "."]);
        run_git(
            repo,
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
    }

    #[test]
    fn untracked_text_becomes_one_all_added_hunk() {
        let mut budget = MAX_DIFF_BYTES;
        let file = untracked_file("new.ts".to_owned(), b"one\r\ntwo\nthree", &mut budget);
        assert_eq!(file.added_count, 3);
        assert_eq!(file.removed_count, 0);
        assert_eq!(file.notice, None);
        assert_eq!(file.hunks.len(), 1);
        assert_eq!(file.hunks[0].header, "@@ -0,0 +1,3 @@");
        assert!(
            file.hunks[0]
                .lines
                .iter()
                .all(|line| line.kind == DiffLineKind::Added)
        );
        assert_eq!(file.hunks[0].lines[0].content, "one");
        assert_eq!(budget, MAX_DIFF_BYTES - 14);
    }

    #[test]
    fn an_empty_untracked_file_has_no_hunks() {
        let mut budget = MAX_DIFF_BYTES;
        let file = untracked_file("empty.txt".to_owned(), b"", &mut budget);
        assert_eq!(file.added_count, 0);
        assert!(file.hunks.is_empty());
        assert_eq!(file.notice, None);
    }

    #[test]
    fn binary_and_non_utf8_content_get_the_binary_notice() {
        let mut budget = MAX_DIFF_BYTES;
        for content in [&b"PNG\0\x01"[..], &b"caf\xe9"[..]] {
            let file = untracked_file("logo.png".to_owned(), content, &mut budget);
            assert_eq!(file.notice, Some(DiffFileNotice::Binary));
            assert!(file.hunks.is_empty());
            assert_eq!(file.added_count, 0);
        }
        assert_eq!(budget, MAX_DIFF_BYTES);
    }

    #[test]
    fn content_over_the_line_bound_or_budget_gets_the_too_large_notice() {
        let mut budget = MAX_DIFF_BYTES;
        let many_lines = "x\n".repeat(MAX_LINES_PER_FILE + 1);
        let file = untracked_file("long.txt".to_owned(), many_lines.as_bytes(), &mut budget);
        assert_eq!(file.notice, Some(DiffFileNotice::TooLarge));
        assert!(file.hunks.is_empty());

        let mut tiny_budget = 2;
        let file = untracked_file("a.txt".to_owned(), b"abc", &mut tiny_budget);
        assert_eq!(file.notice, Some(DiffFileNotice::TooLarge));
        assert_eq!(tiny_budget, 2);
    }

    #[test]
    fn the_listing_skips_nested_repositories_and_empty_entries() {
        let paths = parse_untracked_listing(b"a.ts\0nested/\0dir/b.ts\0");
        assert_eq!(paths, vec!["a.ts".to_owned(), "dir/b.ts".to_owned()]);
    }

    #[tokio::test]
    async fn lists_untracked_files_as_added_and_never_ignored_ones() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join(".gitignore"), "secret.env\nbuild/\n").expect("ignore file");
        fs::write(repo.join("app.ts"), "one\n").expect("fixture file");
        commit_all(&repo);

        fs::write(
            repo.join("new.ts"),
            "export const a = 1;\nexport const b = 2;\n",
        )
        .expect("untracked file");
        fs::create_dir_all(repo.join("src/nested")).expect("untracked dir");
        fs::write(repo.join("src/nested/deep.ts"), "deep\n").expect("nested untracked");
        fs::write(repo.join("secret.env"), "TOKEN=1\n").expect("ignored file");
        fs::create_dir_all(repo.join("build")).expect("ignored dir");
        fs::write(repo.join("build/out.js"), "out\n").expect("ignored build file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        let paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(paths, vec!["new.ts", "src/nested/deep.ts"]);
        assert_eq!(files[0].added_count, 2);
        assert_eq!(files[0].removed_count, 0);
        assert_eq!(files[0].hunks[0].header, "@@ -0,0 +1,2 @@");
        assert_eq!(files[0].hunks[0].lines[1].content, "export const b = 2;");

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn keeps_tracked_changes_before_untracked_files() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("app.ts"), "one\n").expect("fixture file");
        commit_all(&repo);
        fs::write(repo.join("app.ts"), "two\n").expect("modified file");
        fs::write(repo.join("added.ts"), "new\n").expect("untracked file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        let paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(paths, vec!["app.ts", "added.ts"]);

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn lists_untracked_files_in_a_repository_without_commits() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("first.ts"), "a\nb\nc\n").expect("untracked file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "first.ts");
        assert_eq!(files[0].added_count, 3);

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[tokio::test]
    async fn lists_binary_and_oversized_untracked_files_without_hunks() {
        let repo = temp_repo();
        run_git(&repo, &["init", "-q"]);
        fs::write(repo.join("logo.png"), [0x89, b'P', b'N', b'G', 0, 1, 2]).expect("binary file");
        let oversized = vec![b'a'; (MAX_UNTRACKED_FILE_BYTES + 1) as usize];
        fs::write(repo.join("huge.txt"), oversized).expect("oversized file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        let huge = files
            .iter()
            .find(|file| file.path == "huge.txt")
            .expect("oversized file listed");
        assert_eq!(huge.notice, Some(DiffFileNotice::TooLarge));
        assert!(huge.hunks.is_empty());
        let logo = files
            .iter()
            .find(|file| file.path == "logo.png")
            .expect("binary file listed");
        assert_eq!(logo.notice, Some(DiffFileNotice::Binary));
        assert!(logo.hunks.is_empty());
        assert_eq!(logo.added_count, 0);

        fs::remove_dir_all(&repo).expect("scratch cleanup");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn never_reads_an_untracked_symlink_that_escapes_the_workspace() {
        let repo = temp_repo();
        let outside = temp_repo();
        fs::write(outside.join("secret.txt"), "outside\n").expect("outside file");
        run_git(&repo, &["init", "-q"]);
        std::os::unix::fs::symlink(outside.join("secret.txt"), repo.join("link.txt"))
            .expect("symlink");
        fs::write(repo.join("ok.txt"), "ok\n").expect("untracked file");

        let files = GitDiffSource.read(&repo).await.expect("diff succeeds");
        let paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
        assert_eq!(paths, vec!["ok.txt"]);
        assert!(
            files
                .iter()
                .flat_map(|file| file.hunks.iter())
                .flat_map(|hunk| hunk.lines.iter())
                .all(|line| line.content != "outside")
        );

        fs::remove_dir_all(&repo).expect("scratch cleanup");
        fs::remove_dir_all(&outside).expect("scratch cleanup");
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
