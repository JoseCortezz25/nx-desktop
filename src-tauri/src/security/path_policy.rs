//! Workspace path authority primitives (issue #18).
//!
//! Pure filesystem helpers behind every authority-bearing command: canonicalize
//! project roots, resolve a requested path against them, and reject traversal,
//! absolute-path and symlink escapes. No Tauri, no DTOs — #21 reuses these to
//! enforce `business-logic.md` §3.3 before any file read.

use std::path::{Component, Path, PathBuf};

/// Maximum accepted path length in bytes (Limits tier).
pub const MAX_PATH_LEN: usize = 4096;

/// The ways workspace path authority can fail.
///
/// Kept free of IPC types on purpose: commands map each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathPolicyError {
    EmptyPath,
    PathTooLong { len: usize },
    RelativeRoot { path: String },
    TraversalEscape { path: String },
    AbsoluteEscape { path: String },
    SymlinkEscape { path: String },
    NoWorkspaceRoots,
}

/// Lexically normalizes a path without touching the filesystem.
///
/// Resolves `.` and `..` syntactically; unlike `std::fs::canonicalize` it
/// works for paths that do not exist yet (created projects, pending files).
fn normalize_lexically(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(prefix.as_os_str()),
            Component::RootDir => normalized.push(Component::RootDir),
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::Normal(part) => normalized.push(part),
        }
    }
    normalized
}

/// Canonicalizes a project root, falling back to lexical normalization when
/// the folder does not exist on this machine (seed rows such as
/// `/workspace/design-system` are authority records, not local checkouts).
///
/// A relative root is never authority: it is rejected instead of resolved
/// against the process working directory.
pub fn canonicalize_or_normalize_root(root: &Path) -> Result<PathBuf, PathPolicyError> {
    if root.is_relative() {
        return Err(PathPolicyError::RelativeRoot {
            path: root.to_string_lossy().into_owned(),
        });
    }
    match std::fs::canonicalize(root) {
        Ok(canonical) => Ok(canonical),
        Err(_) => Ok(normalize_lexically(root)),
    }
}

/// Canonicalizes a path through its nearest existing ancestor so symlink
/// escapes are caught even when the final path does not exist yet.
///
/// Ancestors are resolved component by component — never with a lexical
/// `strip_prefix` — so a symlink in the middle of the chain is followed
/// instead of folded back into the requested roots. Returns `None` when no
/// ancestor can be canonicalized; callers then fall back to the lexical
/// containment check instead of inventing an answer.
fn canonicalize_existing_or_ancestor(path: &Path) -> Option<PathBuf> {
    let mut built = if path.is_absolute() {
        PathBuf::from("/")
    } else {
        PathBuf::new()
    };
    let mut remainder = PathBuf::new();
    let mut seen_existing = false;
    for component in path.components() {
        match component {
            Component::Prefix(prefix) => built.push(prefix.as_os_str()),
            Component::RootDir => {}
            Component::CurDir => {}
            Component::ParentDir => {
                if seen_existing {
                    remainder.push("..");
                } else {
                    built.pop();
                }
            }
            Component::Normal(part) => {
                if seen_existing {
                    remainder.push(part);
                    continue;
                }
                built.push(part);
                match std::fs::canonicalize(&built) {
                    Ok(canonical) => built = canonical,
                    Err(_) => {
                        seen_existing = true;
                        remainder.push(part);
                    }
                }
            }
        }
    }
    if !remainder.as_os_str().is_empty() {
        built.push(remainder);
    }
    Some(built)
}

/// Verifies a canonicalized candidate against one canonical root.
fn check_canonical_candidate(
    root: &Path,
    candidate: &Path,
    requested: &str,
) -> Result<PathBuf, PathPolicyError> {
    if candidate == root || candidate.starts_with(root) {
        Ok(candidate.to_owned())
    } else {
        Err(PathPolicyError::SymlinkEscape {
            path: requested.to_owned(),
        })
    }
}

/// Resolves `requested` against the first containing workspace root.
///
/// Relative requests resolve against the project roots and reject `..`
/// escapes that would climb past a root. Absolute requests must already sit
/// inside a root (component-wise, so `/workspace/api-client-evil` never
/// matches `/workspace/api-client`). Existing paths and their nearest
/// ancestors are canonicalized so symlink escapes are rejected even when the
/// final path is missing. The returned path is the lexical join, never a
/// canonicalized rewrite, so callers keep the project-relative form.
pub fn resolve_in_workspaces(
    roots: &[PathBuf],
    requested: &str,
) -> Result<PathBuf, PathPolicyError> {
    if requested.is_empty() {
        return Err(PathPolicyError::EmptyPath);
    }
    if requested.len() > MAX_PATH_LEN {
        return Err(PathPolicyError::PathTooLong {
            len: requested.len(),
        });
    }
    if roots.is_empty() {
        return Err(PathPolicyError::NoWorkspaceRoots);
    }

    let request_path = Path::new(requested);
    if request_path.is_absolute() {
        let candidate = normalize_lexically(request_path);
        for root in roots {
            let normalized_root = normalize_lexically(root);
            if candidate != normalized_root && !candidate.starts_with(&normalized_root) {
                continue;
            }
            let canonical_root = canonicalize_or_normalize_root(root)?;
            if let Some(canonical) = canonicalize_existing_or_ancestor(&candidate) {
                check_canonical_candidate(&canonical_root, &canonical, requested)?;
            }
            return Ok(candidate);
        }
        return Err(PathPolicyError::AbsoluteEscape {
            path: requested.to_owned(),
        });
    }

    let mut depth = 0usize;
    for component in request_path.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                return Err(PathPolicyError::AbsoluteEscape {
                    path: requested.to_owned(),
                });
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if depth == 0 {
                    return Err(PathPolicyError::TraversalEscape {
                        path: requested.to_owned(),
                    });
                }
                depth -= 1;
            }
            Component::Normal(_) => depth += 1,
        }
    }

    let mut first_candidate: Option<PathBuf> = None;
    let mut saw_existing = false;
    for root in roots {
        let candidate = normalize_lexically(&normalize_lexically(root).join(request_path));
        if first_candidate.is_none() {
            first_candidate = Some(candidate.clone());
        }
        let canonical_root = canonicalize_or_normalize_root(root)?;
        if let Some(canonical) = canonicalize_existing_or_ancestor(&candidate) {
            saw_existing = true;
            if check_canonical_candidate(&canonical_root, &canonical, requested).is_ok() {
                return Ok(candidate);
            }
        }
    }
    if saw_existing {
        return Err(PathPolicyError::SymlinkEscape {
            path: requested.to_owned(),
        });
    }
    match first_candidate {
        Some(candidate) => Ok(candidate),
        None => Err(PathPolicyError::NoWorkspaceRoots),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// A scratch workspace under the OS temp dir (never inside the repo).
    /// The caller owns cleanup via the returned path.
    fn temp_workspace(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("nx-path-policy-{name}"));
        if root.exists() {
            fs::remove_dir_all(&root).expect("scratch workspace resets");
        }
        fs::create_dir_all(&root).expect("scratch workspace exists");
        root
    }

    #[test]
    fn rejects_dot_dot_traversal() {
        let root = temp_workspace("traversal");
        let roots = vec![root.clone()];
        let result = resolve_in_workspaces(&roots, "../evil.txt");
        assert_eq!(
            result,
            Err(PathPolicyError::TraversalEscape {
                path: "../evil.txt".to_owned(),
            })
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_absolute_paths_outside_roots() {
        let root = temp_workspace("absolute");
        let roots = vec![root.clone()];
        let result = resolve_in_workspaces(&roots, "/etc/passwd");
        assert_eq!(
            result,
            Err(PathPolicyError::AbsoluteEscape {
                path: "/etc/passwd".to_owned(),
            })
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_prefix_sibling_confusion() {
        let root = temp_workspace("sibling");
        let sibling = format!("{}-evil/secret.txt", root.to_string_lossy());
        let roots = vec![root.clone()];
        let result = resolve_in_workspaces(&roots, &sibling);
        assert_eq!(
            result,
            Err(PathPolicyError::AbsoluteEscape { path: sibling })
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_symlink_escapes() {
        let root = temp_workspace("symlink");
        let outside = temp_workspace("symlink-outside");
        fs::write(outside.join("secret.txt"), "secret").expect("outside file exists");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("link")).expect("link created");
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&outside, root.join("link")).expect("link created");
        let roots = vec![root.clone()];
        let result = resolve_in_workspaces(&roots, "link/secret.txt");
        assert_eq!(
            result,
            Err(PathPolicyError::SymlinkEscape {
                path: "link/secret.txt".to_owned(),
            })
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
        fs::remove_dir_all(&outside).expect("scratch cleanup");
    }

    #[test]
    fn accepts_a_nested_path_inside_roots() {
        let root = temp_workspace("nested");
        fs::create_dir_all(root.join("src")).expect("nested dir exists");
        fs::write(root.join("src/main.rs"), "fn main() {}").expect("nested file exists");
        let roots = vec![root.clone()];
        let resolved = resolve_in_workspaces(&roots, "src/main.rs").expect("nested path resolves");
        assert_eq!(resolved, root.join("src/main.rs"));
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn accepts_a_missing_path_that_stays_inside_roots() {
        let root = temp_workspace("missing");
        let roots = vec![root.clone()];
        let resolved =
            resolve_in_workspaces(&roots, "not-yet-created.txt").expect("missing path resolves");
        assert_eq!(resolved, root.join("not-yet-created.txt"));
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_an_empty_request() {
        let root = temp_workspace("empty");
        let roots = vec![root.clone()];
        assert_eq!(
            resolve_in_workspaces(&roots, ""),
            Err(PathPolicyError::EmptyPath)
        );
        fs::remove_dir_all(&root).expect("scratch cleanup");
    }

    #[test]
    fn rejects_a_relative_project_root() {
        let relative = Path::new("workspace/relative");
        assert_eq!(
            canonicalize_or_normalize_root(relative),
            Err(PathPolicyError::RelativeRoot {
                path: "workspace/relative".to_owned(),
            })
        );
    }
}
