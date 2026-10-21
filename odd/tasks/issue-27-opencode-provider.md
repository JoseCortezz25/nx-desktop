# Issue 27 — OpenCode provider adapter

## Objective and authority

Implement [issue #27](https://github.com/JoseCortezz25/nx-desktop/issues/27) on
branch `feat/issue-27-opencode-provider`, cut from `main` at `b8229ce` (the
merge of #25). It is the second real engine behind the `AgentProvider` port
(#17) and the `AgentRunner` port (#19), mirroring the Claude adapter (#25).

## Specs

S1. A real OpenCode adapter behind the port. Models come from OpenCode's own
configuration, never from a fixed list.

S2. Runs stream through the same `Channel` events as the fake provider.

S3. Vendor errors map to `AppErrorDto` using the closed #16 code set.

S4. OpenCode owns its credentials; the app never reads or forwards them, and
nothing secret reaches a DTO, frame, failure or log.

S5. Feature layout and IPC contract respected; no `.unwrap()` on fallible
paths; no `MutexGuard` across `.await`.

S6. `cargo test`, `cargo clippy -D warnings` and `cargo fmt --check` pass. Manual
smoke with a real OpenCode setup is left to the user.

## Research evidence (OpenCode v2.1.1, `~/.opencode/bin/opencode`)

E1. **CLI surface** (`opencode --help`, `run --help`, `models --help`, `api
--help`, `serve --help`). `run` accepts `--format json`, `--model
provider/model#variant`, `--standalone` ("Run with a private server instead
of the background service") and `--auto`. `api` calls a server operation by
OpenAPI id. `serve` starts the v2 HTTP API.

E2. **Run JSON stream** (read from the run implementation embedded in the
binary, since the docs at `opencode.ai/v2/docs/cli` do not document it): one
JSON object per line, `{"type", "timestamp", "sessionID", ...}`, with types
`step_start`, `text` (`part.text`, one line per finished text block),
`reasoning` (only with `--thinking`), `tool_use` (emitted when a tool
finishes; `part.tool`, `part.state.status` `completed`/`error`,
`part.state.input`), `step_finish` (`part.reason`) and `error` (`error`
object: `{"name": "APIError", "data": {"statusCode"}}`, effect-ai `_tag`
errors, or `{"type": "unknown", "message"}`). Exit code 1 on error, 130 on
SIGINT. Matches the community capture at
littlebearapps.com/help/untether/opencode-stream-json-cheatsheet.

E3. **Prompt input.** `run` merges positional arguments with stdin when stdin
is not a TTY; with no positional message the prompt is read from stdin. The
project directory is `PWD`, then `cwd`.

E4. **Cancellation.** The `run` SIGINT handler calls `session.interrupt` and
exits 130. `--standalone` spawns a private `opencode serve --stdio --port 0`
child (killed with SIGTERM, then SIGKILL after 3 s, when the CLI exits);
without it the run executes on the shared background service, where killing
the CLI would not stop the session.

E5. **Discovery.** `opencode models` prints `provider/model` lines from the
server's `model.list` operation, without variants. `opencode api --standalone
model.list` returns the same operation as JSON: `{"location", "data": [...]}`
with `id`, `providerID`, `name`, `enabled` and `variants[].id` per model. A
read-only local run listed 78 models (66 with variants) across `anthropic`,
`openai`, `opencode` and `opencode-go`. The rows also carry `headers`,
`body` and `settings`, which can hold provider configuration. No model run
was started.

## Design decisions

D1. **One adapter, two ports.** `providers/adapters/opencode/` implements
`AgentProvider` (catalog) and `AgentRunner` (streaming). Internals: `config.rs`
(binary resolution, timeouts, env allowlist), `wire.rs` (vendor payloads),
`discovery.rs` (`model.list` → catalog), `translate.rs` (JSON lines → domain
progress), `errors.rs` (failures → `RunFailure`), `process.rs` (supervised
child, bounded line reader), `workspace.rs` (run working directory).

D2. **Integration: supervised CLI child, not the HTTP server.** Each run is
`opencode run --standalone --format json --model <provider/model[#variant]>`
spawned with `tokio::process` (no shell, explicit argv, `kill_on_drop`), the
prompt written to stdin and stdin closed. `--standalone` keeps the session's
server inside the run's process tree, so cancelling or dropping the run stops
it (E4). Driving `opencode serve` over HTTP/SSE was rejected for this ticket:
it needs a long-lived server, a password, a port and its own lifecycle and
health handling, for no gain over the JSON stream.

D3. **Model discovery** runs `opencode api --standalone model.list` in Rust
(OS temp dir as `cwd`, 30 s timeout, 8 MiB output cap). Only `id`,
`providerID`, `name`, `enabled` and `variants[].id` are decoded; `headers`,
`body` and `settings` are skipped by Serde and never stored. Mapping: model
id = `providerID/modelID` (the exact `--model` value), so every upstream
provider configured in OpenCode appears under the single app provider
`opencode`. This settles research #31 gap G7. Display name = `name
(providerID)`. Disabled rows, ids over 128 bytes and ids that would not
round-trip through OpenCode's `provider/model#variant` parser are dropped;
the list is sorted by id.

D4. **Effort = OpenCode variants.** A model's stops are its variant ids in
OpenCode's order, and a stop maps to the `#variant` suffix (research #31 §8).
A model with no variant advertises the single stop `default`, which runs it
without a suffix, because the selection chain requires one stop. Any other
token is rejected, not guessed.

D5. **Async, lazy catalog.** The registry used to snapshot sources
synchronously at startup. It now also accepts _live_ sources
(`with_live_source`), read on every listing. A live provider replaces a
static row with the same id in place, so the real adapter supersedes the
fixture `opencode` row. `AgentProvider` gained a default `ready()` (static
catalogs are always ready). `list_providers` and `list_models` became async
commands that await `registry.ready()` off the UI thread. The adapter's
`ready()` refreshes when there is no catalog, when it is older than the
10-minute TTL, or 30 s after a failed attempt. Refresh is single-flight
(atomic flag plus a `watch` generation, with waiters bounded by the timeout),
and a drop guard clears the flag. The first discovery is spawned in `setup`.
A failed refresh keeps the last good catalog. With no binary, or if the first
discovery fails, the provider is listed with no models. The cache lock
(`std::sync::RwLock`) is only held for clones and swaps.

D6. **Binary resolution** happens at every spawn, so installing OpenCode
after the app starts is picked up. The order is: `NX_DESKTOP_OPENCODE_BIN`
(must be an absolute executable), each `PATH` entry, `~/.opencode/bin`,
`/opt/homebrew/bin`, then `/usr/local/bin`. Not found → `provider_unavailable`
("OpenCode is not installed or could not be found; install it or set
NX_DESKTOP_OPENCODE_BIN").

D7. **Workspace authority.** The run `cwd` (and `PWD`) is the project's first
workspace root, canonicalized through `path_policy::canonicalize_or_normalize_root`
and required to be an existing directory. `ProjectWorkspaceDirectory`
resolves it from the managed `ProjectStore`. That store is built in `setup`,
after the router, so the resolver is bound to the app handle there and fails
closed before binding. A missing root → `internal_error`, before any spawn.

D8. **Minimal environment and secret isolation.** `env_clear()` plus a
non-secret allowlist (`HOME`, `PATH`, `USER`, `SHELL`, locale, `TMPDIR`,
`XDG_*`, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and the Windows
equivalents), `PWD` pinned to the workspace and `NO_COLOR=1`. The app's own
`ANTHROPIC_API_KEY` never reaches the child. stderr is discarded, and no
vendor text is copied into failures.

D9. **Stream mapping.** `text` → `text_delta` (blocks after the first are
prefixed with a blank line). `tool_use` → `tool_activity` with status
`completed`/`failed`, summary `Tool: <name>`, the input bounded to 4 KiB as
detail, and never the output. The kind is classified from built-in tool
names (`grep`/`glob` → search, `read`/`list` → list files, `edit`/`write`/
`patch` → diff, else command). `step_*`, `reasoning` and unknown types are
skipped. A line not starting with `{` is ignored. An invalid JSON object
fails the run as `internal_error`. Lines over 16 MiB are dropped whole. Exit
0 completes the run. The supervisor still owns `started` and the single
terminal frame.

D10. **Error mapping** (fixed adapter-authored messages, with at most a
sanitized error name):

| OpenCode signal                                        | `AppErrorDto.code`     |
| ------------------------------------------------------ | ---------------------- |
| binary not found / cannot be started                   | `provider_unavailable` |
| `error`: authentication / API key                      | `provider_unavailable` |
| `error`: rate limit / quota                            | `provider_unavailable` |
| `error`: model or provider not found                   | `provider_unavailable` |
| `error`: `APIError` 401/403/404/408/429/5xx or no code | `provider_unavailable` |
| `error`: other `APIError` 4xx                          | `internal_error`       |
| `error`: anything else (`unknown`, `aborted`, ...)     | `internal_error`       |
| stream idle past 30 min / stdout read failure          | `provider_unavailable` |
| malformed JSON line / non-zero exit without an event   | `internal_error`       |
| unknown model, unadvertised stop, no workspace         | `internal_error`       |
| cancellation                                           | `cancelled` (terminal) |

D11. **Cancellation.** The stdin write and each line read race
`Cancellation::cancelled()`. On cancel the adapter sends SIGINT to the CLI,
which interrupts the session and shuts down its private server. It waits a
3 s grace period, then sends SIGKILL to the whole process group. On Unix the
child leads its own group. Signals are sent only while the leader is
unreaped, so the group id cannot be recycled. Timeouts kill the group
immediately. A `Drop` guard kills the group if the run future is dropped.
The adapter holds no lock across `.await`.

D12. **Dependency.** `libc 0.2` (Unix only; already in the lockfile) for
`kill`/`killpg`. Shared-file edits are additive: `ports.rs` (default
`ready()`), `service.rs` (live sources), `commands.rs` (async listings),
`adapters/mod.rs`, `lib.rs` (registration plus a `with_route`). The run
router is unchanged.

## Tasks

T1. Research the CLI surface, run stream, cancellation and discovery (E1–E5).
T2. Config, wire types, discovery mapping, translator, error mapping + unit tests.
T3. Supervised child process, bounded line reader, workspace resolver.
T4. `OpenCodeAgentProvider` for both ports with the async catalog cache.
T5. Registry live sources, async listing commands, `lib.rs` wiring.
T6. Fake-executable integration tests and judges.

## Log

L1. Delivered in commit `55cc94f` (`feat(providers): add OpenCode agent
provider adapter`): 17 files, about 2,700 lines including tests.

L2. Tests do not depend on the real binary or the network. They run
`/bin/sh` fake executables written to temp dirs, warmed once so first-exec
latency cannot eat into short timeouts.

- **Discovery:** exact argv, variants and names, single flight under
  concurrent listings, fresh-cache reuse, missing binary, malformed output,
  non-zero exit, a failed refresh that keeps the last good catalog, and a
  timeout that kills the child and its grandchild.
- **Registry:** the live row replaces the fixture `opencode` row.
- **Runs:** text and tool streaming with stray non-JSON lines; exact argv
  with the prompt on stdin (including a `--`/`$(...)` prompt); workspace
  `cwd`/`PWD`; cleared environment; the no-variant `default` stop.
- **Run failures:** a vendor `error` event that leaks no message or key;
  malformed JSON; a non-zero exit; unknown models, stops and workspaces
  rejected before any spawn; a binary removed after discovery.
- **Timeouts and cancellation:** idle timeout kills the group; cooperative
  SIGINT cancellation within the grace; SIGINT-ignoring children killed by
  group SIGKILL; a dropped run future kills its group.
- **Supervisor:** `started → textDelta → toolActivity → textDelta →
completed` with seq 1–5.
- **Unit tests:** binary resolution, env allowlist, error table, translator,
  line reader, wire decoding and the workspace resolver.

The parser was also checked once against the real `model.list` output (all
78 models parsed, 66 with variants); that probe was not committed.

L3. Verification: `cargo fmt --check`, `cargo clippy --all-targets -- -D
warnings`, `cargo test` (292 unit + 29 contract tests, three consecutive
runs), `pnpm run check` and `pnpm test` (562 frontend tests) all green.

L4. Known limits and follow-ups:

- `--auto` is not passed, so OpenCode auto-rejects permission prompts in
  non-interactive runs. Wiring the project's `ApprovalMode` and `PreToolUse`
  hooks into OpenCode permissions is a separate ticket.
- Runs are single-turn and start a fresh OpenCode session; conversation
  history is not resumed (`--session`).
- OpenCode provider keys supplied only through environment variables are not
  forwarded (D8); use `opencode auth login` or OpenCode config.
- Cancellation escalation is Unix-only; on Windows the child is killed
  directly (`start_kill`) without the private-server sweep.
- `AppErrorDto.retryable` is derived from the code (same as #25).
- Manual smoke with a real OpenCode setup is left to the user.
