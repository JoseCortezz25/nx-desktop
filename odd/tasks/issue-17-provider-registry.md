# Issue 17 — Rust: provider registry, list_providers and list_models

## Objective and authority

Implement [issue #17](https://github.com/JoseCortezz25/nx-desktop/issues/17) on
branch `feat/issue-17-provider-registry`, from `main`. Blocked by #16, which is
CLOSED (contract integrated into `main`), so the blocker is resolved.

The #16 contract (DTOs in `src-tauri/src/features/providers/dto.rs`, fixtures
`providers-list-providers.json` / `providers-list-models.json`, TS client
`listProviders`/`listModels`) is the frozen wire shape. This issue adds the Rust
service, commands, `AgentProvider` port, registry and fake adapter — no real
provider integrations (those are #25/#26/#27) and no frontend changes (the TS
client already exists and stays untouched).

## Specs

S1. Issue #17, "What to build": "The `AgentProvider` port, a registry, and a
fake adapter. `list_providers` and `list_models` return what the UI selectors
need. Invariant validation (`provider -> model -> effort`) lives in Rust."

S2. Acceptance criterion: "Commands implement the contract" — `list_providers`
(parameterless → `ProviderDto[]`) and `list_models` (`{ request:
{ providerId } }` → `ModelDto[]`), registered in `generate_handler!`, returning
`Result<TDto, AppErrorDto>` with the exact fixture wire shapes.

S3. Acceptance criterion: "Invalid selection chains are rejected with
`AppErrorDto`" — unknown/empty `providerId` → `validation_failed`; the
`provider -> model -> effort` invariant check lives in the service so #19 can
reuse it (model must belong to provider, effort must be exposed by that model).

S4. Acceptance criterion: "Follows the feature layout (`domain.rs`, `ports.rs`,
`service.rs`, `commands.rs`) and the IPC contract ticket" — DTOs stay in the
existing `dto.rs` untouched; domain has no Tauri/Serde-wire deps beyond what
DTOs need; one trait in `ports.rs` (`AgentProvider`); only a fake adapter
(`adapters/fake.rs`) — real `opencode.rs`/`codex.rs`/`claude.rs` belong to
#25–#27 and are NOT created here.

S5. Acceptance criterion: "No `.unwrap()` on fallible paths; no `MutexGuard`
held across `.await`" — registry reads are synchronous under short lock scopes;
errors propagate with `?` into `AppErrorDto`.

S6. Acceptance criterion: "`cargo test`, `cargo clippy -D warnings` and `cargo
fmt --check` pass" — unit tests for domain invariants, service selection-chain
validation, command error mapping; existing `ipc_contract.rs` fixtures must keep
passing byte-for-byte.

S7. Catalog data rule (`business-logic.md` §3.1 item 4, §3.4, §4): the seed
catalog mirrors the #16 fixture rows so service output matches the pinned wire
shapes; `supportedEffortLevels` values are placeholders pending research ticket
#31 and MUST be commented as such — never presented as product truth. No new
provider/model ids beyond the fixture rows.

## Tasks

T1. `domain.rs` — `ProviderId`, `ModelId`, effort-stop types and the
`provider -> model -> effort` invariant validators (S1, S3, S4).
T2. `ports.rs` + `adapters/fake.rs` — `AgentProvider` trait and the in-memory
fake serving the fixture catalog (S1, S4, S7).
T3. `service.rs` + `app_state.rs` — `ProviderRegistry` use cases
(`list_providers`, `list_models`, `validate_selection`) with Shape/Limits/
Invariants tiers and short lock scopes (S1, S3, S5).
T4. `commands.rs` + `lib.rs` wiring — thin `list_providers`/`list_models`
commands, `AppErrorDto` mapping with `request_id`, `generate_handler!`
registration (S2, S5).
T5. Tests + judges — unit/integration tests for T1–T4, then `cargo test`,
`cargo clippy -- -D warnings`, `cargo fmt --check` green (S6).

## Log

L1. User request verbatim: "Quiero que comencemos a implementar la #17".

L2. Implemented T1–T5 on `feat/issue-17-provider-registry` (2026-10-20):
`domain.rs` (ids, chain invariants, `IdTooLong` limit), `ports.rs`
(`AgentProvider`), `adapters/fake.rs` (fixture catalog), `service.rs`
(`ProviderRegistry`), `commands.rs` (`list_providers` / `list_models` with
`AppErrorDto` mapping), `lib.rs` (`manage` + `generate_handler!`). Evidence:
`cargo test` 15 unit + 29 contract green, `cargo clippy -- -D warnings` clean,
`cargo fmt --check` clean. Commit: `4e06d7a` feat(providers): add registry,
list_providers and list_models (795 insertions across 8 files — single
cohesive unit, one commit).
