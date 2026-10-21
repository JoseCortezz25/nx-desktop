# Issue 25 — Claude provider adapter

## Objective and authority

Implement [issue #25](https://github.com/JoseCortezz25/nx-desktop/issues/25) on
branch `feat/issue-25-claude-provider`, cut from `main` at `2da2b16` (the merge
of #20). It is the first real engine behind the `AgentProvider` port (#17) and
the `AgentRunner` port (#19).

## Specs

S1. A real Claude adapter behind the port, with vendor wire formats kept
separate from domain models and DTOs. Models Opus, Sonnet and Haiku come from
Rust provider configuration, never from UI hardcoding.

S2. Runs stream through the same `Channel` events as the fake provider.

S3. Vendor errors map to `AppErrorDto` using the closed #16 code set.

S4. Credentials never reach the webview.

S5. Feature layout and IPC contract respected; no `.unwrap()` on fallible
paths; no `MutexGuard` across `.await`.

S6. `cargo test`, `cargo clippy -D warnings` and `cargo fmt --check` pass. Manual
smoke with a real account is left to the user.

## Design decisions

D1. **One adapter, two ports.** `providers/adapters/claude/` implements
`AgentProvider` (catalog) and `AgentRunner` (streaming). Internals: `config.rs`
(model table, effort mapping, endpoint, timeouts), `wire.rs` (vendor
request/event/error payloads), `sse.rs` (chunk-safe SSE parser), `translate.rs`
(vendor events → domain progress), `errors.rs` (vendor/HTTP/transport →
`RunFailure`), `client.rs` (`reqwest` transport).

D2. **Registered alongside the fake.** `ProviderRegistry::from_sources`
concatenates catalogs (fake first, then Claude; duplicate ids skipped).
`runs/adapters/routing.rs` adds `ProviderRoutingRunner`, which dispatches on
the validated `provider_id`: `claude` goes to the Claude adapter, every other
provider falls back to `FakeAgentRunner`. The supervisor is unchanged.

D3. **Credentials.** No credential policy existed, so a `CredentialSource` port
(`providers/ports.rs`) was added with `EnvCredentialSource`, which maps
`claude` → `ANTHROPIC_API_KEY` from the Rust process environment (never
`VITE_*`). The secret is wrapped in `ProviderCredential` (redacted `Debug`, no
`Display`/`Serialize`/`Clone`), resolved per run, and attached only as an
`x-api-key` header marked sensitive. It is in no DTO, frame, failure or log
line. A keychain adapter can replace the env source later.

D4. **Missing credential.** The provider still lists. A run fails before any
network call with `provider_unavailable` ("Claude credentials are not
configured; set ANTHROPIC_API_KEY for the app process").

D5. **Models and effort.** `claude-opus-5-5` (default, first row),
`claude-sonnet-5-5`, `claude-haiku-5-5`, shown as "Claude Opus 5.5" and so on.
Following research #31 (keep the provider-native token as the wire value), each
model advertises `low → medium → high → xhigh → max`, mapped 1:1 onto
`output_config.effort`. Foreign or unadvertised stops are rejected, not guessed.

D6. **Request.** `POST {base_url}/v1/messages` with `x-api-key`,
`anthropic-version: 2023-06-01` and JSON body `model`, `max_tokens: 64000`,
one user message, `stream: true`, `output_config.effort`. The body has no
`thinking`, `temperature`, `top_p` or prefill. The base URL is configurable
(the tests use a local mock server).

D7. **Stream mapping.** `text_delta` → `text_delta` progress. `tool_use`
blocks (with bounded `input_json_delta`) → `tool_activity` (`command`,
`pending`). Thinking, ping, `message_start` and unknown events are ignored.
`message_stop` resolves on the last `stop_reason`: `end_turn`/`stop_sequence`
complete the run, while `max_tokens`, `refusal`, `tool_use`, `pause_turn` or a
missing reason fail it with `internal_error`. The supervisor still owns
`started` and the single terminal frame.

D8. **Error mapping** (fixed adapter-authored messages; vendor `message` and
headers are never forwarded):

| Vendor signal                                 | `AppErrorDto.code`     |
| --------------------------------------------- | ---------------------- |
| 400 `invalid_request_error`                   | `internal_error`       |
| 401 `authentication_error`                    | `provider_unavailable` |
| 403 `permission_error`                        | `provider_unavailable` |
| 404 `not_found_error`                         | `provider_unavailable` |
| 413 `request_too_large`                       | `internal_error`       |
| 429 `rate_limit_error`                        | `provider_unavailable` |
| 500 `api_error` / other 5xx                   | `provider_unavailable` |
| 529 `overloaded_error` / stream `error` event | `provider_unavailable` |
| transport failure, stalled or truncated       | `provider_unavailable` |
| other 4xx, malformed SSE/JSON                 | `internal_error`       |
| missing credential                            | `provider_unavailable` |
| cancellation                                  | `cancelled` (terminal) |

D9. **Cancellation.** Sending the request, reading an error body and reading
each chunk all race `Cancellation::cancelled()`. On cancel the adapter returns
`RunFailure::cancelled()` and drops the `reqwest` future and body stream,
which aborts the request and closes the socket. A cancel that lands mid-chunk
is re-checked before each forwarded frame. There is no lock in the adapter, so
nothing can be held across `.await`.

D10. **Limits on vendor input.** SSE line ≤ 1 MiB, event data ≤ 4 MiB, error
body ≤ 16 KiB, tool input ≤ 4 KiB, connect timeout 30 s, idle/chunk timeout
300 s.

D11. **Dependencies.** `reqwest 0.13` (`json`, `stream`, `rustls`, default
features off; 0.13 renamed the 0.12 `rustls-tls` feature to `rustls`) and
`futures-util 0.3`. `reqwest 0.13.5` was already in the lockfile. Tokio
`net`/`io-util` are dev-only, for the mock server.

## Tasks

T1. `CredentialSource` port, `ProviderCredential`, `EnvCredentialSource` + tests.
T2. Claude wire types, SSE parser, translator, error mapping, config + unit tests.
T3. HTTP client with cancellation; `ClaudeAgentProvider` for both ports.
T4. `ProviderRegistry::from_sources`, `ProviderRoutingRunner`, `lib.rs` wiring.
T5. Mock-server integration tests and judges.

## Log

L1. Delivered in commit `7aa3fc9` (`feat(providers): add Claude agent provider
adapter`): 18 files, about 2,800 lines including tests and the lockfile.

L2. Tests (no test reaches the real API). The SSE parser is checked at every
split point, including inside a multi-byte character, plus byte-by-byte feeding,
CRLF, multi-line data, comments, unknown fields and the size/UTF-8 limits.
Other unit tests cover wire decoding with unknown-variant collapse, the
translator (text, thinking, tool use, every stop reason, error events), the
full HTTP status table, effort mapping, the model catalog, credential
redaction and the env source. Against a local `TcpListener` mock server: frames
stream in order, the request headers and body are as documented, cancellation
returns promptly and the server sees the client disconnect, 429 maps without
leaking the key or the vendor message, `max_tokens` fails, a truncated stream
fails, a mid-stream `error` event fails, and a `RunSupervisor` driving the
adapter emits `started → textDelta → textDelta → completed` with seq 1–4.

L3. Verification: `cargo fmt --check`, `cargo clippy --all-targets -- -D
warnings`, `cargo test` (249 unit + 29 contract tests), `pnpm run check` and
`pnpm test` (470 frontend tests) all green. The Claude test subset passed five
consecutive runs.

L4. Known limits and follow-ups:

- `AppErrorDto.retryable` is derived from the code, so an auth failure
  (`provider_unavailable`) reports `retryable: true`. Changing that is a
  contract decision outside this ticket.
- Runs are single-turn (prompt only). Conversation history, a system prompt
  and tool execution are not sent yet.
- Manual smoke with a real key is left to the user (see the handoff steps).
