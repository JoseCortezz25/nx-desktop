//! File open-target wire DTOs (issue #16, slice 4).
//!
//! Wire shapes only: the installed-target probe, the external launch, the
//! process adapter and command registration live in #21 (with the `Abrir`
//! policy from #12). Rust fields stay `snake_case`;
//! `#[serde(rename_all = "camelCase")]` emits the JSON the TypeScript contract
//! and the shared fixtures pin.
//!
//! `open_in_target` is authority-bearing through `project_id` and the
//! workspace-relative `path`; the Rust core validates both and the allowed
//! target before spawning anything
//! (`.claude/knowledge/business-logic.md` §3.3, §3.5 item 3). The DTO never
//! carries a client-supplied approval flag.

use serde::{Deserialize, Serialize};

/// A place a file can be opened into.
///
/// The vocabulary is closed at the five domain targets. The locked `Abrir`
/// decision offers only `editor` while it is installed
/// (`.claude/knowledge/business-logic.md` §3.5 item 3); that is a product rule
/// enforced by the core and the menu, not by removing values from this enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenTargetDto {
    Editor,
    ViewSource,
    SearchInFile,
    RevealInFileManager,
    CopyPath,
}

/// One external target's availability on the machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTargetAvailabilityDto {
    pub target: OpenTargetDto,
    pub is_installed: bool,
}

/// Request envelope for `open_in_target`; authority-bearing.
///
/// The command resolves `()` (`null` on the wire): the core records the intent
/// and launches, so there is no payload to render.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OpenInTargetRequestDto {
    pub project_id: String,
    pub target: OpenTargetDto,
    pub path: String,
}
