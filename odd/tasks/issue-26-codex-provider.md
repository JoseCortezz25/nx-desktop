# Issue 26 — Codex provider adapter

## Objective and authority

Implement [issue #26](https://github.com/JoseCortezz25/nx-desktop/issues/26) on
branch `feat/issue-26-codex-provider`, cut from `main` at `b8229ce` (the merge
of #25). It is the second real engine behind the `AgentProvider` port (#17)
and the `AgentRunner` port (#19), built with the same rules as the Claude
adapter (#25).

## Specs

S1. A real Codex adapter behind the port, with vendor wire formats kept
separate from domain models and DTOs. Models come from Rust provider
configuration, never from UI hardcoding.

S2. Runs stream through the same `Channel` events as the fake provider.

S3. Vendor errors map to `AppErrorDto` using the closed #16 code set.

S4. Credentials never reach the webview.

S5. Feature layout and IPC contract respected; no `.unwrap()` on fallible
paths; no `MutexGuard` across `.await`.

S6. `cargo test`, `cargo clippy -D warnings` and `cargo fmt --check` pass. A
manual smoke with a real Codex login is left to the user.

## Research: which Codex interface

"Codex" is OpenAI's open-source Codex coding agent (`codex` CLI,
github.com/openai/codex). Sources read on 2026-10-20:

- E1. Non-interactive mode docs (`developers.openai.com/codex/noninteractive`,
  now redirecting to `learn.chatgpt.com/docs/non-interactive-mode`):
  `codex exec` is the documented scripting/CI entry point. `--json` turns
  stdout into a JSON Lines event stream (`thread.started`, `turn.started`,
  `turn.completed` with `usage`, `turn.failed`, `item.started` /
  `item.updated` / `item.completed`, `error`). Runs are read-only by default
  (`--sandbox workspace-write` / `danger-full-access` widen it).
  `--skip-git-repo-check` and `--ephemeral` are documented. With no prompt
  argument, or with `-`, the prompt is read from stdin. `codex exec` reuses
  the CLI's saved login by default.
- E2. `codex-rs/exec/src/exec_events.rs` (main): the exact event schema.
  `ThreadEvent` is tagged by `type`; items are `{id, type, ...}` with types
  `agent_message`/`reasoning` (`text`), `command_execution` (`command`,
  `aggregated_output`, `exit_code`, `status` = `in_progress|completed|failed|declined`),
  `file_change` (`changes[{path, kind}]`, `status`), `mcp_tool_call`
  (`server`, `tool`, `arguments`, `status`), `web_search` (`query`),
  `todo_list`, `collab_tool_call` and `error` (`message`).
- E3. `codex-rs/exec/src/cli.rs` (main): `--json` (alias
  `--experimental-json`), `--color`, `--skip-git-repo-check`, `--ephemeral`,
  the optional prompt positional with `-` meaning stdin.
- E4. Codex models page (`learn.chatgpt.com/docs/models`): the `codex -m`
  ids `gpt-6.1-sol` (recommended for complex coding when available),
  `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`; per-model effort notes (6.1 Sol
  "Light to Ultra"; Astra Light/Medium/Extra High; 6 Luna up to Max, not
  Ultra). Light is `low` in the CLI. No non-interactive model-listing command
  is documented. `gpt-5.x` Codex models are retired or deprecated.
- E5. `codex-rs/app-server/README.md`: the app-server exposes `model/list`
  but the README does not document its request/response shape, launch or
  handshake, and parts of it are labelled experimental.

**Decision.** Drive the user's installed `codex` CLI through
`codex exec --json` as a supervised child process. It is the documented,
schema-stable automation surface (E1–E3), it keeps authentication inside the
CLI's own login, and it gives a JSONL stream that maps directly onto the run
progress port. The app-server (E5) was not chosen: its protocol is not
documented well enough to depend on yet. The OpenAI API fallback was not
needed.

## Design decisions

D1. **One adapter, two ports.** `providers/adapters/codex/` implements
`AgentProvider` (catalog) and `AgentRunner` (runs). Internals: `config.rs`
(model table, effort mapping, binary override, timeouts), `wire.rs` (JSONL
event payloads), `jsonl.rs` (chunk-safe line framer), `translate.rs` (events →
domain progress), `errors.rs` (CLI/process → `RunFailure`), `process.rs`
(binary resolution, argv, minimal env, process group), `client.rs` (turn
driver with cancellation), `workspace.rs` (project → canonical `cwd`).

D2. **Registration.** In `lib.rs` the Codex source goes **before** the fake
catalog in `ProviderRegistry::from_sources`, so the real adapter replaces the
fake `codex` row (duplicate ids are skipped, and the first one wins). The
provider order is now `codex, opencode (fake), claude`, so Codex becomes the
composer's default provider. `ProviderRoutingRunner` gets one more route,
`codex` → Codex adapter. The supervisor and `routing.rs` are unchanged.
Shared-file edits are additive: one `pub mod` line, one import, one route and
the registration lines.

D3. **Credentials: none in the app.** Codex authenticates with its own login
(`codex login`, stored by the CLI under `CODEX_HOME`). The app never reads,
stores or forwards a Codex token. The child's environment is cleared and only
an allowlist of non-secret variables is forwarded: home, user, locale, temp,
`TZ`, `CODEX_HOME`, `XDG_*`, proxy and CA variables, and Windows essentials.
`OPENAI_API_KEY`, `CODEX_API_KEY` and `ANTHROPIC_API_KEY` are never passed
(this is tested). So a user who relies on an API-key environment variable has
to store the key with `codex login` instead. Nothing from the child's
environment or stderr reaches a DTO, frame, failure or log line.

D4. **Binary resolution.** `NX_CODEX_BIN` (Rust process environment) can name
an absolute executable. Otherwise `codex` is looked up on `PATH`, then in
`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin` and `~/.local/bin`,
`~/.npm-global/bin`, `~/.volta/bin`, `~/.bun/bin`, because a GUI app launched
from the Finder inherits a minimal `PATH`. The binary is resolved on every
run, so installing Codex later needs no restart. If nothing is found, the run
fails with `provider_unavailable` and a fixed message: "the Codex CLI was not
found; install it and run `codex login`, or set NX_CODEX_BIN to its absolute
path". The provider still lists, and nothing is spawned. The child's `PATH`
starts with the binary's own directory, so the `node` beside an npm shim
resolves.

D5. **Spawn contract** (`security-and-capabilities.md` §4). `tokio::process`
with no shell, an absolute binary, and this exact argument array:
`exec --json --color never --sandbox read-only -c approval_policy="never"
--skip-git-repo-check --ephemeral --model <id> -c model_reasoning_effort="<stop>"
--cd <root> -`. The prompt is written to stdin and never appears in argv, so
it is not visible in `ps` and cannot be parsed as a flag. The model and effort
are catalog-validated tokens. `cwd` (and `--cd`) is the project's first
workspace folder, looked up through the managed `ProjectStore` and
re-canonicalized with the path policy. It must be an existing directory,
otherwise the run fails with `internal_error` before spawning.

D6. **Sandbox and approvals.** No approval bridge exists yet: `codex exec` is
non-interactive and the core has no channel to put a Codex tool request in
front of the user. So every run uses Codex's default `read-only` sandbox with
`approval_policy="never"`, whatever the project's `ApprovalMode`. Codex can
read the workspace and answer, but cannot write or run unsandboxed commands.
Mapping `auto_approve` / `full_access` onto `workspace-write` is a policy
decision left for a follow-up (see L4).

D7. **Models and effort** (E4, research #31 §3/§8). Rust config table, with
the first row as the default: `gpt-6.1-sol` (`low medium high xhigh max
ultra`), `gpt-6-astra` (`low medium xhigh`), `gpt-6-sol` (`low medium high
xhigh max`), `gpt-6-luna` (`low medium high xhigh max`). The native token is
the wire value for `model_reasoning_effort`, mapped 1:1. `ultra` is Codex-CLI
vocabulary and is only offered on 6.1 Sol (research G2). `none` is a reasoning
toggle, not an effort stop (research §6.4), so it is not advertised. Foreign
or unadvertised stops are rejected. GPT-6 Sol's stops come from the `openai`
catalogue row in research #31, because the Codex page has no card for it.
"GPT-6.1 Sol" is also a wireframe placeholder name. Here it is the real model
documented by Codex (E4) and lives only in Rust configuration.

D8. **Stream mapping.** `agent_message` (completed) → `text_delta`, with
consecutive messages separated by a blank line. `exec --json` emits whole
messages, not token deltas. `command_execution` → `command`, `file_change` →
`diff`, `mcp_tool_call` → `command` and `web_search` → `search` tool
activity, keyed by item id: `running` on started/updated, then `completed` or
`failed` (a non-zero `exit_code` counts as `failed`). The UI upserts by id, so
each item is one row. Summary subjects are bounded to 120 characters and
details to 4 KiB. `reasoning`, `todo_list`, item-level `error`, lifecycle
and unknown events are ignored. `turn.completed` completes the run and
`turn.failed` fails it. A top-level `error` notice is remembered (it can be a
recoverable reconnect) and is used only to classify an abnormal exit. The
supervisor still owns `started` and the single terminal frame.

D9. **Error mapping** (fixed adapter-authored messages; vendor text and
stderr are inspected only to pick a message, never forwarded):

| Codex signal                                                       | `AppErrorDto.code`     |
| ------------------------------------------------------------------ | ---------------------- |
| binary not found / `NX_CODEX_BIN` invalid / spawn failure          | `provider_unavailable` |
| `turn.failed` or exit ≠ 0 mentioning auth (`401`, login, ...)      | `provider_unavailable` |
| `turn.failed` or exit ≠ 0 mentioning rate/usage limit (`429`, ...) | `provider_unavailable` |
| `turn.failed` or exit ≠ 0 saying the model is unavailable          | `provider_unavailable` |
| other `turn.failed`, exit ≠ 0, killed by a signal                  | `provider_unavailable` |
| clean exit before `turn.completed`, stalled stream, stdout failure | `provider_unavailable` |
| CLI rejected the adapter's arguments (clap usage error)            | `internal_error`       |
| malformed / oversized / non-UTF-8 JSONL line                       | `internal_error`       |
| workspace folder missing, unknown model, unadvertised effort       | `internal_error`       |
| cancellation                                                       | `cancelled` (terminal) |

D10. **Cancellation and lifetime.** The child leads its own process group
(`process_group(0)`, Unix). Writing the prompt, reading each stdout chunk and
waiting for the exit all race `Cancellation::cancelled()`. On cancel the
group gets `SIGTERM`, then up to `exit_grace` (3 s) to exit. The
`ChildGuard` drop then sends `SIGKILL` to the group (plus `kill_on_drop` on
the leader), so the CLI and every command it spawned stop on every exit path,
including a dropped future. A cancel that lands mid-chunk is re-checked
before each forwarded frame. After `turn.completed` the CLI also gets the
grace period to exit before the group is reaped. There is no lock in the
adapter. The one `unsafe` block is `libc::killpg`, documented with a SAFETY
note. On Windows the leader is killed directly.

D11. **Limits on vendor input.** JSONL line ≤ 8 MiB (command items carry
their output), stderr tail ≤ 16 KiB, tool detail ≤ 4 KiB, idle timeout
between events 20 min (a healthy turn can run a long, silent command), exit
grace 3 s.

D12. **Dependencies.** `libc 0.2` as a Unix-only dependency (already in the
lockfile at `0.2.190`; the lockfile only gains the edge). No other crate.

## Tasks

T1. Config table + effort mapping, wire types, JSONL framer, translator,
error mapping + unit tests.
T2. Process boundary (binary resolution, argv, env allowlist, process-group
guard) and turn driver with cancellation.
T3. Workspace resolver over `ProjectStore`; `CodexAgentProvider` for both ports.
T4. `lib.rs` registration and route.
T5. Fake-executable integration tests and judges.

## Log

L1. Delivered in the `feat(providers): add Codex agent provider adapter`
commit on this branch.

L2. Tests. None runs the real CLI. Each integration test writes a `/bin/sh`
fake `codex` into its own temp directory. Unit tests cover the framer at every
split point and byte-by-byte (CRLF, multi-byte characters, length and UTF-8
limits), wire decoding with unknown-type tolerance, the translator (text,
command/file/search/MCP rows, failed and declined commands, ignored items,
`turn.failed`, error notices, bounds), the classification table, effort
mapping, the exact argv, the env allowlist (secrets excluded, `PATH` led by
the binary directory), binary resolution and the workspace resolver.
Fake-executable tests cover:

- text and tool frames stream in order;
- argv, stdin prompt (byte for byte, absent from argv), canonical `cwd` and
  minimal env are exactly as documented;
- `PATH` resolution without an override;
- a missing binary maps to `provider_unavailable`;
- cancellation of a stalled CLI returns promptly and kills both the CLI and
  its grandchild;
- the idle timeout abandons a silent CLI;
- a malformed line maps to `internal_error`;
- `turn.failed` and a non-zero exit with a "Not logged in" stderr map without
  leaking a secret;
- a clean exit before `turn.completed` is reported as truncated;
- a missing workspace, unknown model or unadvertised effort never spawns;
- the catalog matches the config table;
- a `RunSupervisor` driving the adapter emits `started → textDelta →
completed` with seq 1–3.

L3. Verification: `cargo fmt --check`, `cargo clippy --all-targets -- -D
warnings`, `cargo test` (293 unit + 29 contract tests), `pnpm run check` and
`pnpm test` (562 frontend tests) all green. The Codex test subset (44 tests)
passed five consecutive runs.

L4. Known limits and follow-ups:

- Runs are read-only (D6) until an approval bridge maps `ApprovalMode` onto
  Codex sandbox/approval settings.
- Runs are single-turn and `--ephemeral`. Conversation history and
  `codex exec resume` are not used yet.
- Only the project's first workspace folder is the `cwd`. Extra folders are
  readable through the read-only sandbox but are not passed with `--add-dir`.
- Models come from a config table (E4). If a documented listing interface
  appears (for example a stable app-server `model/list`), it should replace
  the table.
- Codex is now the first, and therefore default, provider (D2). The OpenCode
  adapter (#27) touches the same registration line, so the final order is a
  merge-time decision.
- `AppErrorDto.retryable` is derived from the code, so "not signed in"
  (`provider_unavailable`) reports `retryable: true` (same as #25).
- A process-group id could in theory be reused between the leader's reap and
  the guard's final `SIGKILL`. The window is microseconds and is accepted.
- Manual smoke with a real Codex login is left to the user.
