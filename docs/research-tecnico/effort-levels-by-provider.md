# Reasoning effort levels by provider and model

**Research deliverable for issue #31.** Status: complete for the evidence that could be retrieved; open gaps are listed explicitly. This document records findings only. It makes **no implementation change and no UI-copy decision** — the final stop labels are a product choice made when the effort popover ships (#8).

- Access date for every URL below: **2026-10-17**.
- Local catalogue snapshot: `~/.cache/opencode/models.json`, cache `version` file `18`, 4,924,682 bytes, mtime `2026-09-26 20:51:02 -0500`, `sha256` prefix `a37427ede35e2a0bcfd5cdd90ecfffcb`.
- Scope: the three providers this app supports (`opencode`, `codex`, `claude`) and their model catalogues.

Everything below separates three different things that are easy to conflate:

| Layer | What it is | Where the truth lives | Example |
| --- | --- | --- | --- |
| **Capability** | The effort control a model actually accepts | Provider API docs and the model's catalogue entry | OpenAI `reasoning.effort`[6] |
| **Alias** | A labelled entry in a catalogue/selector | `models.dev` / OpenCode catalogue[8][2] | `openai/gpt-5.2`[2] |
| **Variant** | A named `#`-selector over one model's settings | OpenCode variant metadata[2] | `openai/gpt-5.2#high`[2] |

A model's capability and its OpenCode variant list can disagree; this document states which layer a claim belongs to.

## 1. Where the per-model levels come from at runtime

OpenCode's model catalogue is `models.dev`.[8] OpenCode lists models "from models.dev, provider integrations, and your configuration", and selection uses `provider/model` with an optional `#variant` suffix.[2] The provider ID ends at the first `/` and cannot contain `/` or `#`; the variant follows `#`; provider and model IDs are case-sensitive.[2]

Variant *names* are derived, not stored: "Variant names come from the selected model's current catalog metadata. Names such as `low`, `high`, and `max` are not available for every model, and an unknown variant produces a model-resolution error."[2] OpenCode builds a model's variants either from an explicit `variants` array or from the model's reasoning controls described in `capabilities.reasoning` using the models.dev v2 shape.[2] Those controls are `supported` (whether the model reasons), `toggle` ("adds a `none` variant that turns reasoning off"), `effort` (the effort levels to offer) and `budget` (optional thinking-token `min`/`max`).[2]

### 1.1 The local catalogue is evidence, not authority

The local cache expresses each model's reasoning controls in a field named **`reasoning_options`** — an array whose entries are one of:

- `{ "type": "effort", "values": ["low", "medium", "high", ...] }`
- `{ "type": "budget_tokens", "min": 1024, "max": ... }`
- `{ "type": "toggle" }`

Path shape: `~/.cache/opencode/models.json` → `["<providerId>"]["models"]["<modelId>"]["reasoning_options"]`.

**Contradiction with the ticket text.** Issue #31 states the catalogue "carries per-model `variants` blocks". The snapshot inspected here has **no key named `variants` anywhere** (`rg '"variant' ~/.cache/opencode/models.json` → 0 matches; `variants` appears 0 times). The reasoning controls live in `reasoning_options`, and OpenCode derives variant names from them.[2] The ticket's `variants` wording should be treated as superseded by the actual cache schema, or as referring to a different catalogue version than `18`.

A model is "no effort control" in this catalogue when `reasoning_options` is absent. Two sub-cases matter and are listed separately in §5: `reasoning: false` (the model does not reason at all) and `reasoning: true` with no options (it reasons, but exposes no selectable stop).

Every catalogue table in §2–§4.2 is sourced from that file at the path shape above; the vendor-doc URLs cited alongside corroborate the vocabulary and the models the two sources share.

## 2. Claude / provider `anthropic`

**Native vocabulary.** Anthropic's effort control is the top-level `output_config.effort` parameter, available with no beta header on supported models.[3] Documented levels, in the order the docs present them, are `low`, `medium`, `high`, `xhigh`, `max`.[3] Which values are accepted per model is model-dependent: `max` is listed as available on Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Mythos Preview, Opus 5.5, Opus 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5.5, Sonnet 5, Sonnet 4.6 and Haiku 5.5; `xhigh` on the same list minus Mythos Preview, Opus 4.6 and Sonnet 4.6, and the docs warn "Not every model that supports `max` supports `xhigh`."[3]

**Defaults.** Most effort-capable models default to `high`; Opus 5.5 and Haiku 5.5 default to `medium`.[3] Setting `effort` explicitly to the default is identical to omitting it.[3]

**Thinking budgets (separate control).** Older models expose `thinking: {type: "enabled", budget_tokens: N}`: a numeric budget with a **minimum of 1,024 tokens**, strictly less than `max_tokens`.[4]

Extended thinking is deprecated on the 4.6 models and rejected with a 400 on 4.7 and later; on 4.5-and-earlier thinking-capable models it is the only mode.[4][5] The per-model table marks whether thinking is adaptive-only, extended-only, or both, and its default on/off state.[5] This budget is **not** a discrete stop set — it is a continuous token range, so it does not map onto a fixed slider.

**Catalogue (`anthropic`, 15 models).** Grouped by identical `reasoning_options`:

| Ordered levels exposed | Models (catalogue `anthropic`) |
| --- | --- |
| `low → medium → high → xhigh → max`[3] | `claude-fable-5`, `claude-fable-5-1`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5` |
| `low → medium → high → max` (+ `budget_tokens`)[3] | `claude-opus-4-6`, `claude-sonnet-4-6` |
| `low → medium → high` (+ `budget_tokens`)[3][4] | `claude-opus-4-5`, `claude-opus-4-5-20251101` |
| `toggle` + `low → medium → high → xhigh → max`[3] | `claude-sonnet-5` |
| `budget_tokens` only (min 1024)[4] | `claude-haiku-4-5`, `claude-haiku-4-5-20251001`, `claude-sonnet-4-5`, `claude-sonnet-4-5-20250929` |

The catalogue and the vendor docs agree on the level sets they share (all five on Opus 5/5.5 and Fable; `max`-but-not-`xhigh` on Opus 4.6/Sonnet 4.6; three levels on Opus 4.5). The catalogue is **incomplete** against the vendor list: it does not carry `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-mythos-5`, `claude-mythos-5-1` or `claude-mythos-preview`, all of which the vendor docs place on the effort table.[3]

## 3. Codex / provider `openai`

**Native vocabulary (API).** OpenAI reasoning models take `reasoning.effort` (Responses API) or `reasoning_effort` (Chat Completions). "Supported values are model-dependent and can include `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`."[6]

Explicit per-model exceptions are documented: GPT-6 Astra does not support `none` (HTTP 400), and GPT-6.1 Sol supports neither `none` nor `minimal` and defaults to `medium`.[6] Defaults are model-dependent, not universal (`gpt-5.5` defaults to `medium`), and reasoning *mode* (`standard`/`pro`) is a separate axis from effort.[6]

**Native vocabulary (Codex CLI).** `model_reasoning_effort` is "Reasoning effort advertised by the selected model, such as `low`, `medium`, `high`, `xhigh`, `max`, or `ultra`. Available levels depend on the model and client."[7] Related settings: `plan_mode_reasoning_effort` (Plan-mode override)[7] and `agents.default_subagent_reasoning_effort` (spawned-agent default).[7]

**Contradiction to flag.** The Codex reference names `ultra`[7] — a value absent from the OpenAI reasoning guide's list[6] and from the local catalogue. `ultra` is Codex-CLI vocabulary and must not be assumed for the raw API or the catalogue.

**Catalogue (`openai`, 50 models).** Grouped by identical `reasoning_options`:

| Ordered levels exposed | Models (catalogue `openai`) |
| --- | --- |
| `none → low → medium → high → xhigh → max`[6] | `gpt-5.6`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-luna`, `gpt-6-sol` |
| `low → medium → high → xhigh → max`[6] | `gpt-6-astra` |
| `none → low → medium → high → xhigh`[6] | `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5` |
| `minimal → low → medium → high → xhigh`[6] | `gpt-realtime-2.1` |
| `none → low → medium → high`[6] | `gpt-5.1` |
| `minimal → low → medium → high`[6] | `gpt-5`, `gpt-5-mini`, `gpt-5-nano` |
| `medium → high → xhigh` | `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` |
| `low → medium → high`[6] | `o1`, `o1-pro`, `o3`, `o3-mini`, `o3-pro`, `o4-mini` |
| `high` (single stop) | `gpt-5-pro` |
| `medium` (single stop) | `gpt-5.2-chat-latest` |

The `none`-unsupported rule for GPT-6 Astra[6] is consistent with the catalogue (`gpt-6-astra` starts at `low`). The catalogue does not carry the GPT-6.1 Sol model named in the vendor docs.[6]

## 4. OpenCode / providers `opencode` and `opencode-go`

OpenCode is itself an aggregator: its selector exposes models from many upstream providers, and variants come from catalogue metadata.[2] Its own docs give the built-in variant vocabulary per upstream provider:[1]

- **Anthropic:** `high` (default), `max`.[1]
- **OpenAI:** "varies by model but roughly" `none`, `minimal`, `low`, `medium`, `high`, `xhigh`.[1]
- **Google:** `low`, `high`.[1]

"This list is not comprehensive."[1] Note that this OpenCode-level Anthropic list (`high`, `max`)[1] is **narrower** than the underlying Anthropic effort API (`low`…`max`)[3]: the variant list is what OpenCode ships by default, while the capability is larger. This is the capability-vs-alias distinction from the top of this document, and it is exactly why the issue's example list (`high`, `max`) must not be read as Anthropic's full set.

### 4.1 Catalogue `opencode` (OpenCode Zen, 112 models)

Grouped by identical `reasoning_options` (ordered levels shown ascending):

| Ordered levels exposed | Models |
| --- | --- |
| `low → medium → high → xhigh → max` | `claude-fable-5`, `claude-fable-5-1`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`, `claude-opus-5-5`, `claude-sonnet-5`, `gpt-6-astra`, `space-bunny-free` |
| `none → low → medium → high → xhigh → max` | `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-luna`, `gpt-6-sol` |
| `none → low → medium → high → xhigh` | `gpt-5.2`, `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.5` |
| `minimal → low → medium → high → xhigh` | `muse-spark-1.2`, `muse-spark-1.2-contributor-free`, `muse-spark-1.3`, `muse-spark-1.3-contributor-free` |
| `low → medium → high → xhigh` | `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex-spark`, `grok-4.6`, `grok-4.7` |
| `minimal → low → medium → high` | `gemini-3-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gpt-5`, `gpt-5-nano` |
| `low → medium → high → max` (+ `budget_tokens`) | `claude-opus-4-6`, `claude-sonnet-4-6` |
| `low → high → max` | `deepseek-v4-flash-free`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `x-preview-f-free` |
| `low → medium → high` | `gemini-3.1-pro`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `grok-4.5`, `laguna-s-2.1-free`, `ling-3.0-flash-free` |
| `low → medium → high` (+ `budget_tokens`) | `claude-opus-4-5` |
| `low → high` | `gemini-3-pro` |
| `none → low → medium → high` | `gpt-5.1` |
| `medium → high → xhigh` | `gpt-5.4-pro`, `gpt-5.5-pro` |
| `high → max` | `glm-5.2` |
| `none → high` | `north-mini-code-free` |
| `low → high → max` (+ `toggle`) | `deepseek-v4-flash`, `deepseek-v4-flash-vision-exp` |
| `low → medium → high` (+ `toggle`) | `hy3-free` |
| `low → medium → xhigh` (+ `toggle` + `budget_tokens`) | `qwen3.8-flash` |
| `high → max` (+ `toggle`) | `deepseek-v4-pro` |
| `max` (single stop) | `kimi-k3` |
| `budget_tokens` only (min 1024) | `claude-haiku-4-5`, `claude-opus-4-1`, `claude-sonnet-4`, `claude-sonnet-4-5` |
| `budget_tokens` only (max 81920, + `toggle`) | `qwen3.5-plus`, `qwen3.6-plus`, `qwen3.6-plus-free` |
| `toggle` only | `glm-4.6`, `glm-4.7`, `glm-4.7-free`, `glm-5`, `glm-5-free`, `glm-5.1`, `kimi-k2.5`, `kimi-k2.5-free`, `kimi-k2.6`, `ling-3.0-flash-fin-free`, `longcat-2.0-free`, `longcat-2.5-preview-free`, `minimax-m3-free`, `qwen3.8-max` |

### 4.2 Catalogue `opencode-go` (OpenCode Go, 42 models)

| Ordered levels exposed | Models |
| --- | --- |
| `none → low → medium → high → xhigh → max` | `gpt-5.6-luna`, `gpt-6-luna` |
| `low → medium → high → xhigh → max` | `space-bunny-free` |
| `low → medium → high → xhigh` | `grok-4.6`, `grok-4.7` |
| `minimal → low → medium → high → xhigh` | `muse-spark-1.2-contributor`, `muse-spark-1.3-contributor` |
| `low → high → max` | `deepseek-v4-flash`, `deepseek-v4.1-flash`, `glm-5.3`, `glm-5.3-flash`, `ox-alpha-free` |
| `low → medium → high` | `grok-4.5` |
| `low → high` | `omen-alpha` |
| `none → low → high` | `hy3` |
| `none → high` | `hy4-preview` |
| `high → max` | `deepseek-v4-pro`, `glm-5.2` |
| `max` (single stop) | `kimi-k3` |
| `low → high → max` (+ `toggle`) | `deepseek-v4-flash-vision-exp` |
| `low → medium → xhigh` (+ `toggle` + `budget_tokens`) | `qwen3.8-flash` |
| `low → medium → xhigh` (+ `toggle` + `budget_tokens` max 262144) | `qwen3.8-max` |
| `budget_tokens` only (max 81920, + `toggle`) | `qwen3.5-plus`, `qwen3.6-plus` |
| `budget_tokens` only (max 262144, + `toggle`) | `qwen3.7-max`, `qwen3.7-plus` |
| `toggle` only | `longcat-2.0`, `longcat-2.5-preview-free`, `minimax-m3` |

The `toggle`-only rows are not "no control": they expose an on/off reasoning switch mapped to OpenCode's `none` variant[2], which is a two-stop control, not a nameable effort ladder.

## 5. Models with no effort control

These are listed explicitly because "no effort control" is a real answer and must not be defaulted to a middle stop.

**Provider `anthropic`:** none. All 15 catalogue models carry a `reasoning_options` entry.

**Provider `openai` — non-reasoning (`reasoning: false`, no options):** `chatgpt-image-latest`, `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-2024-05-13`, `gpt-4o-2024-08-06`, `gpt-4o-2024-11-20`, `gpt-4o-mini`, `gpt-5.3-chat-latest`, `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`, `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002`.

**Provider `opencode` — reasons but exposes no selectable stop (`reasoning: true`, no `reasoning_options`):** `big-pickle`, `grok-build-0.1`, `grok-code`, `hy3-preview-free`, `kimi-k2-thinking`, `kimi-k2.7-code`, `ling-3.0-tiny-free`, `mimo-v2-flash-free`, `mimo-v2-omni-free`, `mimo-v2-pro-free`, `mimo-v2.5-free`, `mimo-v2.6-flash-free`, `minimax-m2.1`, `minimax-m2.1-free`, `minimax-m2.5`, `minimax-m2.5-free`, `minimax-m2.7`, `minimax-m3`, `nemotron-3-super-free`, `nemotron-3-ultra-free`, `nemotron-3.5-lightning-free`, `ring-2.6-1t-free`. Non-reasoning in the same provider: `claude-3-5-haiku`, `kimi-k2`, `ling-2.6-flash-free`, `qwen3-coder`, `trinity-large-preview-free`.

**Provider `opencode-go` — reasons but no selectable stop:** `glm-5`, `glm-5.1`, `kimi-k2.5`, `kimi-k2.6`, `kimi-k2.7-code`, `mimo-v2-omni`, `mimo-v2-pro`, `mimo-v2.5`, `mimo-v2.5-pro`, `mimo-v2.6-flash`, `mimo-v2.6-pro`, `minimax-m2.5`, `minimax-m2.7`.

The `codex` provider's own catalogue is not a separate entry in the snapshot: the Codex CLI client's models are catalogued under the `openai` and `opencode` providers rather than under a dedicated `codex` provider. In catalogue `version 18` the coverage is not uniform — `gpt-5.3-codex` and `gpt-5.3-codex-spark` appear under **both** `openai` and `opencode`, whereas `gpt-5.2-codex` and the `gpt-5.1-codex*` family (`gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex-max`) appear **only** under `opencode`. All of the listed IDs carry effort levels.

## 6. Vocabulary and UI-scale recommendation (no copy decision)

The rule already locked in the domain model — the stop set belongs to the `provider/model` pair and there is no universal ladder — is supported by the evidence: the same provider exposes 1 to 6 stops depending on model, and several stop sets are non-contiguous (e.g. `none → high`, `high → max`).[1][3][6]

Recommendations, stated as structure rather than copy:

1. **Do not render a fixed-size slider.** Draw exactly one stop per reported level, in the model's reported order, and normalise knob position by index — this is already the molecule's contract. A model reporting two stops must show two, not five.
2. **Define one ordinal rank over the union of known tokens** (`none < minimal < low < medium < high < xhigh < max`) so a control can plot consistent positions, but only ever *show* the subset the model reports. The catalogue's `effort.values` arrays are authored in ascending order and corroborate this ranking.
3. **Keep the provider-native token as the wire value**, and treat the human label as a separate, localised string. This keeps the value unambiguous across providers whose names collide but whose meanings differ (OpenCode's Anthropic variants are `high`/`max`[1] while the Anthropic API adds `low`/`medium`/`xhigh`[3]).
4. **Treat the reasoning on/off `toggle` as its own stop**, not as an effort level, so `none` does not read as "the lowest effort" where the provider means "reasoning disabled".[2]
5. **This section does not choose the labels.** The final UI copy for the stops remains the maintainer's product decision for #8.

## 7. Gaps and contradictions

| # | Gap / contradiction | Evidence | Consequence |
| --- | --- | --- | --- |
| G1 | Ticket says the catalogue carries `variants` blocks; the snapshot has none and uses `reasoning_options`. | §1.1; `rg '"variant' models.json` → 0 | Cite the actual field; do not build the adapter against a `variants` key. |
| G2 | Codex reference names `ultra`; OpenAI API list and the catalogue do not. | [7] vs [6], §3 | `ultra` is Codex-CLI-only; do not offer it from a generic OpenAI adapter. |
| G3 | `models.dev`/OpenCode catalogue is a snapshot (`version 18`, 2026-09-26); model sets change weekly. | §1.1 | Runtime must read the live catalogue; the cache is a fallback, not a fixture. |
| G4 | Anthropic `budget_tokens` is a continuous range (min 1024), not discrete stops. | [4] | An extended-thinking-only model has no natural stop count; a slider needs a product decision. |
| G5 | Catalogue `anthropic` lacks `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-mythos-*` that vendor docs place on the effort table. | [3], §2 | Adapter must not treat the current catalogue as the complete Anthropic model list. |
| G6 | Catalogue `openai` lacks the documented `gpt-6.1-sol`. | [6], §3 | Same as G5 for OpenAI. |
| G7 | Which catalogue provider backs the app's `opencode` provider (`opencode`/Zen vs `opencode-go`) is not settled. | §4.1, §4.2 | Issue #27 must decide the mapping before the UI can list stops. |
| G8 | Vendor docs are versioned pages without a pinned version number; levels are documented as changing per model. | [3][6] | Claims in this document are dated by access date, not by a vendor version. |

## 8. Consequences for the adapters (#25 Claude, #26 Codex, #27 OpenCode)

- **Runtime source of truth.** Per-model stop lists MUST be read by the Rust core from the active catalogue/config, not hardcoded in TypeScript. The catalogue's `reasoning_options` (or the provider's live model metadata) is the field to translate into each model's `supportedEffortLevels`.
- **Claude (#25).** The adapter drives `output_config.effort`.[3] Where a model is extended-thinking-only, the only control is the numeric `budget_tokens`[4] — a shape the current `EffortLevel = string` stop model does not represent; this is a real design gap (G4), not a labelling detail.
- **Codex (#26).** The adapter drives `model_reasoning_effort`.[7] It must source the accepted set from the model, because Codex names levels (`ultra`)[7] the raw API does not accept[6] (G2).
- **OpenCode (#27).** The adapter drives the `#variant` selector[2]; variants are derived from catalogue metadata, so the stop list and the variant IDs are the same data. It must also settle which catalogue provider the app's `opencode` provider maps to (G7).
- **Selection chain.** Because stop counts differ per model and are non-contiguous, the existing `provider → model → effort` reconciliation must clamp a retained effort to the newly selected model's reported set rather than to a global ladder.
- **No mirroring.** The stop list is data owned by the backend; the frontend must not re-derive or cache a global union as the available set.

## 9. Verification and limitations

- **Markdown/structure:** file authored and committed via `git` with `git diff --check` run; header, per-provider tables, no-control list, gaps and adapter sections present.
- **Link reachability (checked 2026-10-17):** all eight sources in §Sources (`[1]`–`[8]`) returned HTTP `200` via `curl -L` with a browser user-agent. An earlier draft referred to a ninth candidate URL; it is not part of the committed `## Sources` block and is not reconstructable from this artifact, so it is dropped rather than asserted reachable. This is a reachability sample, not a content-hash pin.
- **Local evidence:** catalogue field paths and version above are from the file on disk at the stated mtime; `sha256` prefix recorded for traceability. Only public catalogue fields are quoted — no credentials, tokens or private config are reproduced.
- **Limitations:** a single cached snapshot (`version 18`) was available and it may lag the live `models.dev` data (G3). Some vendor-documented models are absent from the snapshot (G5, G6). No provider API call was made, so per-model acceptance is documented from vendor docs, not observed.

## Sources

[1] https://opencode.ai/docs/models — OpenCode docs — Models (built-in variants)
[2] https://opencode.ai/v2/docs/models — OpenCode v2 docs — Models (#variant syntax, capabilities.reasoning)
[3] https://platform.claude.com/docs/en/build-with-claude/effort — Anthropic — Effort
[4] https://platform.claude.com/docs/en/build-with-claude/extended-thinking — Anthropic — Extended thinking
[5] https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting — Anthropic — Troubleshooting thinking (per-model table)
[6] https://developers.openai.com/api/docs/guides/reasoning — OpenAI — Reasoning models guide
[7] https://learn.chatgpt.com/docs/config-file/config-reference — Codex — Configuration Reference
[8] https://models.dev — models.dev — model catalogue
