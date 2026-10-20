//! Hook review and `PreToolUse` execution domain (issue #20).
//!
//! Pure product rules for provider-reported hooks and the project decision that
//! resolves them: identities, limits, command tokenization and the
//! reviewed/executable shapes (`business-logic.md` §2 `Hook`). The approval
//! matrix lives in [`super::approval_policy`]; no Tauri, Serde wire attributes
//! or process APIs live here.
//!
//! Provider data and project state are deliberately separate:
//! [`HookDefinition`] is what the provider configured, [`HookReport`] pairs it
//! with the provider's reported baseline status, and [`ReviewedHook`] is the
//! definition plus the status the owning project actually resolves (a project
//! decision overrides the baseline).

use crate::features::projects::domain::HookApprovalStatus;

/// Maximum accepted length for hook ids (Limits tier).
pub const MAX_ID_LEN: usize = 128;

/// Maximum accepted length for hook names (Limits tier).
pub const MAX_NAME_LEN: usize = 256;

/// Maximum accepted length for a hook origin (Limits tier).
pub const MAX_ORIGIN_LEN: usize = 256;

/// Maximum accepted length for a hook trigger type (Limits tier).
pub const MAX_HOOK_TYPE_LEN: usize = 64;

/// Maximum accepted length for the rendered hook command (Limits tier).
pub const MAX_COMMAND_LEN: usize = 2048;

/// Maximum number of hooks one project may expose (Limits tier).
pub const MAX_HOOKS_PER_PROJECT: usize = 64;

/// Maximum accepted hook timeout in milliseconds (Limits tier).
pub const MAX_TIMEOUT_MS: u32 = 600_000;

/// Identity of a reviewed hook (`hook-lint-on-write`, ...).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct HookId(String);

impl HookId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, HookError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(HookError::EmptyHookId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(HookError::HookIdTooLong { len: id.len() });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One provider-configured lifecycle hook, without any project decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookDefinition {
    pub id: HookId,
    pub name: String,
    pub is_new: bool,
    pub origin: String,
    pub hook_type: String,
    pub command: String,
    pub timeout_ms: u32,
}

impl HookDefinition {
    /// Validates every provider-supplied field at the Limits tier.
    ///
    /// `origin` and `hook_type` are open provider data; only their emptiness
    /// and length are constrained. The command stays an opaque string here —
    /// it is tokenized only when an approved hook is about to execute.
    pub fn new(
        id: HookId,
        name: impl Into<String>,
        is_new: bool,
        origin: impl Into<String>,
        hook_type: impl Into<String>,
        command: impl Into<String>,
        timeout_ms: u32,
    ) -> Result<Self, HookError> {
        let name = name.into();
        if name.trim().is_empty() {
            return Err(HookError::EmptyName);
        }
        if name.len() > MAX_NAME_LEN {
            return Err(HookError::NameTooLong { len: name.len() });
        }
        let origin = origin.into();
        if origin.trim().is_empty() {
            return Err(HookError::EmptyOrigin);
        }
        if origin.len() > MAX_ORIGIN_LEN {
            return Err(HookError::OriginTooLong { len: origin.len() });
        }
        let hook_type = hook_type.into();
        if hook_type.trim().is_empty() {
            return Err(HookError::EmptyHookType);
        }
        if hook_type.len() > MAX_HOOK_TYPE_LEN {
            return Err(HookError::HookTypeTooLong {
                len: hook_type.len(),
            });
        }
        let command = command.into();
        if command.trim().is_empty() {
            return Err(HookError::EmptyCommand);
        }
        if command.len() > MAX_COMMAND_LEN {
            return Err(HookError::CommandTooLong { len: command.len() });
        }
        if timeout_ms == 0 || timeout_ms > MAX_TIMEOUT_MS {
            return Err(HookError::InvalidTimeout { timeout_ms });
        }
        Ok(Self {
            id,
            name,
            is_new,
            origin,
            hook_type,
            command,
            timeout_ms,
        })
    }

    /// Whether this hook runs before a tool call.
    pub fn is_pre_tool_use(&self) -> bool {
        self.hook_type == "PreToolUse"
    }
}

/// A provider-configured hook plus the status the provider reports for it.
///
/// The reported status is a baseline only: a project decision overrides it
/// when the hook is reviewed for that project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookReport {
    pub definition: HookDefinition,
    pub reported_status: HookApprovalStatus,
}

/// A hook as the owning project sees it after applying its own decision.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReviewedHook {
    pub definition: HookDefinition,
    pub approval_status: HookApprovalStatus,
}

/// A hook command tokenized into an executable and its argument array.
///
/// The supported syntax is deliberately small: whitespace separates arguments
/// and single/double quotes group them. Backslashes are literal (so Windows
/// paths survive), there are no escapes, and no shell is ever involved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookCommand {
    program: String,
    args: Vec<String>,
}

impl HookCommand {
    /// Tokenizes one provider command string without invoking a shell.
    pub fn parse(command: &str) -> Result<Self, HookCommandError> {
        let mut parts: Vec<String> = Vec::new();
        let mut current = String::new();
        let mut in_argument = false;
        let mut quote: Option<char> = None;

        for character in command.chars() {
            if character == '\0' {
                return Err(HookCommandError::NulByte);
            }
            match quote {
                Some(delimiter) => {
                    if character == delimiter {
                        quote = None;
                    } else {
                        current.push(character);
                    }
                }
                None if character.is_whitespace() => {
                    if in_argument {
                        parts.push(std::mem::take(&mut current));
                        in_argument = false;
                    }
                }
                None if character == '\'' || character == '"' => {
                    quote = Some(character);
                    in_argument = true;
                }
                None => {
                    current.push(character);
                    in_argument = true;
                }
            }
        }

        if quote.is_some() {
            return Err(HookCommandError::UnterminatedQuote);
        }
        if in_argument {
            parts.push(current);
        }
        let mut arguments = parts.into_iter();
        let program = arguments.next().ok_or(HookCommandError::EmptyCommand)?;
        if program.is_empty() {
            return Err(HookCommandError::EmptyCommand);
        }
        Ok(Self {
            program,
            args: arguments.collect(),
        })
    }

    pub fn program(&self) -> &str {
        &self.program
    }

    pub fn args(&self) -> &[String] {
        &self.args
    }
}

/// The ways tokenizing a hook command can fail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookCommandError {
    EmptyCommand,
    UnterminatedQuote,
    NulByte,
}

impl HookCommandError {
    /// Safe diagnostic text for the internal error message.
    pub fn describe(self) -> &'static str {
        match self {
            Self::EmptyCommand => "hook command is empty",
            Self::UnterminatedQuote => "hook command has an unterminated quote",
            Self::NulByte => "hook command contains a NUL byte",
        }
    }
}

/// The ways hook validation and use cases can fail.
///
/// Kept free of IPC types on purpose: commands map each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HookError {
    EmptyHookId,
    HookIdTooLong { len: usize },
    EmptyName,
    NameTooLong { len: usize },
    EmptyOrigin,
    OriginTooLong { len: usize },
    EmptyHookType,
    HookTypeTooLong { len: usize },
    EmptyCommand,
    CommandTooLong { len: usize },
    InvalidTimeout { timeout_ms: u32 },
    TooManyHooks { len: usize },
    DuplicateHookId { hook_id: String },
    UnknownProject { project_id: String },
    UnknownHook { hook_id: String },
    ProjectHasNoWorkspace { project_id: String },
    WorkspaceNotAuthorized { folder: String },
    InvalidCommand { hook_id: String, reason: String },
    HookExecutionFailed { hook_id: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition(command: &str) -> HookDefinition {
        HookDefinition::new(
            HookId::new("hook-lint-on-write").expect("fixture id"),
            "Lint on write",
            true,
            "Project configuration",
            "PreToolUse",
            command,
            5000,
        )
        .expect("valid definition")
    }

    #[test]
    fn ids_reject_blank_and_overlong_input() {
        assert_eq!(
            HookId::new("  ").expect_err("blank id"),
            HookError::EmptyHookId
        );
        let long = "h".repeat(MAX_ID_LEN + 1);
        assert_eq!(
            HookId::new(long).expect_err("overlong id"),
            HookError::HookIdTooLong {
                len: MAX_ID_LEN + 1
            }
        );
    }

    #[test]
    fn definitions_reject_blank_parts() {
        let id = HookId::new("hook-x").expect("id");
        assert_eq!(
            HookDefinition::new(id.clone(), " ", false, "o", "PreToolUse", "cmd", 1)
                .expect_err("blank name"),
            HookError::EmptyName
        );
        assert_eq!(
            HookDefinition::new(id.clone(), "n", false, " ", "PreToolUse", "cmd", 1)
                .expect_err("blank origin"),
            HookError::EmptyOrigin
        );
        assert_eq!(
            HookDefinition::new(id.clone(), "n", false, "o", " ", "cmd", 1)
                .expect_err("blank type"),
            HookError::EmptyHookType
        );
        assert_eq!(
            HookDefinition::new(id, "n", false, "o", "PreToolUse", " ", 1)
                .expect_err("blank command"),
            HookError::EmptyCommand
        );
    }

    #[test]
    fn definitions_reject_invalid_timeouts() {
        let id = HookId::new("hook-x").expect("id");
        assert_eq!(
            HookDefinition::new(id.clone(), "n", false, "o", "PreToolUse", "cmd", 0)
                .expect_err("zero timeout"),
            HookError::InvalidTimeout { timeout_ms: 0 }
        );
        assert_eq!(
            HookDefinition::new(id, "n", false, "o", "PreToolUse", "cmd", MAX_TIMEOUT_MS + 1)
                .expect_err("oversized timeout"),
            HookError::InvalidTimeout {
                timeout_ms: MAX_TIMEOUT_MS + 1
            }
        );
    }

    #[test]
    fn the_fixture_hook_is_a_pre_tool_use_hook() {
        assert!(definition("node hook.mjs").is_pre_tool_use());
    }

    #[test]
    fn commands_split_on_whitespace() {
        let command =
            HookCommand::parse("node .claude/hooks/lint-on-write.mjs").expect("valid command");
        assert_eq!(command.program(), "node");
        assert_eq!(command.args(), [".claude/hooks/lint-on-write.mjs"]);
    }

    #[test]
    fn commands_keep_quoted_arguments_and_windows_paths() {
        let command = HookCommand::parse(
            r#"node "C:\Users\VICTUS\.orca\agent-hooks\codex-hook.cmd" --flag 'two words'"#,
        )
        .expect("valid command");
        assert_eq!(command.program(), "node");
        assert_eq!(
            command.args(),
            [
                r"C:\Users\VICTUS\.orca\agent-hooks\codex-hook.cmd",
                "--flag",
                "two words"
            ]
        );
    }

    #[test]
    fn commands_preserve_empty_quoted_arguments() {
        let command = HookCommand::parse(r#"probe "" "#).expect("valid command");
        assert_eq!(command.program(), "probe");
        assert_eq!(command.args(), [""]);
    }

    #[test]
    fn commands_reject_empty_input_and_unterminated_quotes() {
        assert_eq!(
            HookCommand::parse("   ").expect_err("empty command"),
            HookCommandError::EmptyCommand
        );
        assert_eq!(
            HookCommand::parse(r#""""#).expect_err("empty quoted program"),
            HookCommandError::EmptyCommand
        );
        assert_eq!(
            HookCommand::parse(r#"node "unfinished"#).expect_err("unterminated quote"),
            HookCommandError::UnterminatedQuote
        );
        assert_eq!(
            HookCommand::parse("node \0").expect_err("nul byte"),
            HookCommandError::NulByte
        );
    }
}
