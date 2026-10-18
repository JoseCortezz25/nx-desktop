# Issue #9 / PR #52 — QA round 1 evidence (visual + functional)

Durable evidence for the independent Fabrica QA of the create-project dialog flow.

- **Issue:** https://github.com/JoseCortezz25/nx-desktop/issues/9
- **PR:** https://github.com/JoseCortezz25/nx-desktop/pull/52
- **App commit under QA:** `37736c5a8849a754a872f31d03d63b22384cdc3b` (base `529c19e9efe47467238fbd34c55bca553b3a1f38`)
- **Validation type:** `visual+functional` (binding). Functional via `user-flow-browser-qa`; visual via `visual-baseline-setup` + `visual-qa-evaluation` (structural comparison, method below).
- **Result:** passed.

## Contents

| Path                 | What it proves                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `functional-flow.md` | Full functional transcript: picker, `Nuevo proyecto`, validation, folder add/remove, creation, keyboard containment, all dismissal paths, reachability, console |
| `comparison.md`      | Structural comparison of the picker and both dialog states against wireframes 04/05/06, with the reason the comparison is not pixel parity                      |
| `manifest.json`      | Root manifest: app commit, url/route, scope, capture mode, viewports, masks, baseline source, states, measurement index                                         |
| `captures/`          | Current viewport captures at 900x700 and 1440x900: picker open, dialog empty, dialog folder                                                                     |
| `measurements/`      | Raw JSON results per check and the two console logs                                                                                                             |

## Baseline reference

`docs/wireframes/04-project-picker.html`, `05-create-project-empty.html`, `06-create-project-folder.html` at commit `37736c5a8849a754a872f31d03d63b22384cdc3b` — low-fidelity grayscale wireframes compared for the specified dialog/picker state and shell structure, not pixel equality. No pre-existing pixel baseline applies to this slice; none is created or overwritten in the implementation branch.

## Limitations

- Native Tauri OS frame not exercised (headless Chromium at the requested viewport, no window manager).
- Touch-only input not exercised; Chromium mouse interaction observed.
- Remote CI not claimed.
- The Vitest environment is `node`-only, so mounted focus/pointer behaviour is proven by this browser run, not by a DOM unit test. If the QA skill's flow-test creation step is required, it is absent from the project harness and is recorded as a finding for Builder approval, not written as QA.
