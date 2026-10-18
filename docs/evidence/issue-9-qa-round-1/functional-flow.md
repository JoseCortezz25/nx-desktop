# Issue #9 / PR #52 — functional browser QA transcript

- **App commit:** `37736c5a8849a754a872f31d03d63b22384cdc3b` (detached PR-head worktree `issue-9-qa`)
- **Served by:** `pnpm run dev` (Vite) from the PR-head worktree, `http://127.0.0.1:1520/` (route `/`)
- **Driver:** `agent-browser 0.26.0` (CDP, HeadlessChrome 152.0.0.0, deviceScaleFactor 1)
- **Auth:** none. **Data:** mock repositories (`Design system`, `API client` seeded; creation appends `proj-created-N`).
- **Selectors used** (stable hooks, in preference order): `aria-label` on buttons/inputs, `role` (`dialog`, `listbox`, `option`, `alert`), and the component class names that the molecule/organism own (`[role=dialog] .create-project-dialog__actions .button--text` for the one text-only control `Cancelar`, which carries no `aria-label`).

## Starting state (900x700)

`agent-browser snapshot -i` exposed: rail (`Inicio`, `Alternar barra lateral`, `Alternar panel derecho`), heading `¿En qué deberíamos trabajar?`, `button[aria-label="Proyecto: Design system"]`, `button[aria-label="Entorno: Este ordenador"]`, `textarea[aria-label="Mensaje"]`, `button[aria-label="Enviar"]`, provider/model/effort chips. No document overflow (`scrollWidth 900 = clientWidth 900`, `scrollHeight 700 = clientHeight 700`).

## Picker open / close (900x700 and 1440x900)

- Click `button[aria-label="Proyecto: Design system"]` → `aria-expanded=true`; `listbox[aria-label="Proyectos"]` with `option` rows `Design system` (`aria-selected=true`) and `API client` (`aria-selected=false`), plus a `button[aria-label="Nuevo proyecto"]` rendered **outside** the listbox.
- Click the chip again → popover closes (`aria-expanded=false`, no `[role=listbox]`).
- Reopen, press `Escape` → popover closes, no listbox. (Observed at both viewports.)

## `Nuevo proyecto` → dialog

Click `button[aria-label="Nuevo proyecto"]` → popover closes and `[role=dialog][aria-label="Crear proyecto"]` mounts. Empty state DOM: `h2 "Crear proyecto"`, `button[aria-label="Cerrar"]`, `input[aria-label="Nombre del proyecto"]`, `Carpetas de origen` + `Este equipo`, dashed `.create-project-dialog__dropzone` with hint `Añadir una carpeta` and `button[aria-label="Añadir"]`, `Cancelar` (`button--text`, no aria-label) and `button[aria-label="Crear proyecto"]`.

- **Initial focus:** `document.activeElement` = `BUTTON` `aria-label="Cerrar"` (first focusable in DOM order).
- **Dialog rect 900x700:** `572x359 @ (164, 170.5)`; `.dialog-overlay` rect `900x700 @ (0,0)`, `z-index 40` (drawer `z-index 20`). No overflow.

## Name validation (zero creates)

| Action                                    | Result                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Submit with empty name                    | Dialog stays open; `p[role=alert]` = `Escribe un nombre para el proyecto.`; focus stays on `Crear proyecto`                |
| Submit with whitespace-only `"   "`       | Dialog stays open; error remains (`input.value="   "`) — the rule is trimmed non-empty                                     |
| Type `"Reporte app"` with real keystrokes | `input.value="Reporte app"`, `document.activeElement` stays the input (`focusOnInput=true`) — no focus steal per keystroke |

Controlled zero-create matrix at 900x700 (project count read from the picker `option` count):

| Step                                 | Option count |
| ------------------------------------ | ------------ |
| baseline                             | 2            |
| after `Escape` dismissal             | 2            |
| after `Cerrar` (close control)       | 2            |
| after `Cancelar`                     | 2            |
| after backdrop full pointer sequence | 2            |
| after empty submit                   | 2            |

## Folder add / remove (mocked, typed)

- Empty `Añadir` → folder box with one `.source-folder-row` `alpha-app` and `button[aria-label="Quitar alpha-app"]`; add control becomes `button[aria-label="Añadir carpeta"]`.
- Two more adds → rows `alpha-app`, `beta-service`, `gamma-site`; `Añadir carpeta` becomes `disabled=true` (catalog exhausted).
- `Quitar beta-service` → rows `alpha-app`, `gamma-site`, add re-enabled.
- Remove the rest → back to the dashed dropzone (`Añadir una carpeta`).
- No `nx-desktop` placeholder path is ever drawn; folder names are the typed `MOCK_SOURCE_FOLDERS` fixture.

## Creation → immediate consistent project

- **Zero folders (900x700):** type `QA zero folder` → `Crear proyecto` closes the dialog, focus returns to `button[aria-label="Proyecto: QA zero folder"]`; picker now lists 3 options with the new one `aria-selected=true`; sidebar `Proyectos` group shows `QA zero folder` → `Sin chats`.
- **With one folder (1440x900):** add `alpha-app`, type `QA with folder` → dialog closes, chip `Proyecto: QA with folder`, sidebar shows `QA with folder` → `Sin chats`. Dialog rect at 1440x900 in folder state: `572x353 @ (434, 274)`; all controls hit-test to themselves; no overflow.
- **Duplicate interaction:** creating a second project with the same name `QA zero folder` yields two options named `QA zero folder` (count 4, `duplicateNameCount=2`), the newly created one selected. No uniqueness/charset policy is invented.

## Keyboard containment (mounted, 900x700)

- Focus `Crear proyecto`, `Tab` → `Cerrar` (forward wrap).
- Focus `Cerrar`, `Shift+Tab` → `Crear proyecto` (reverse wrap).
- Typing retains focus in `Nombre del proyecto` (above).

## Dismissal + focus restoration

| Path                                                                            | Dialog         | `document.activeElement`                        |
| ------------------------------------------------------------------------------- | -------------- | ----------------------------------------------- |
| `Escape` (900x700)                                                              | closed         | `BUTTON` `Proyecto: Design system` (not `body`) |
| `Cerrar` close control                                                          | closed         | `BUTTON` `Proyecto: Design system`              |
| `Cancelar`                                                                      | closed         | `BUTTON` `Proyecto: Design system`              |
| Backdrop full pointer sequence `mouse move 820 620` → `down` → `up` (900x700)   | closed         | `BUTTON` `Proyecto: Design system`              |
| Backdrop full pointer sequence `mouse move 1300 800` → `down` → `up` (1440x900) | closed         | `BUTTON` `Proyecto: QA with folder`             |
| Inside→outside drag: `move 450 190` → `down` → `move 820 620` → `up`            | **stays open** | `DIV.dialog[aria-label="Crear proyecto"]`       |

The backdrop result is the defect this Recovery round fixes: focus lands on the connected project trigger, never `document.body`, and the inside-start drag guard still holds.

## Reachability / overflow

- **900x700, sidebar drawer open, dialog open:** overlay `900x700 @ 0,0` (`z-index 40`) above drawer (`z-index 20`); `Cerrar`, name input, `Añadir`, `Cancelar`, `Crear proyecto` all `elementFromPoint` to themselves; no overflow.
- **900x700, modal closed:** `Proyecto` chip, `Mensaje` textarea, `Enviar`, provider and model chips all hit-test to themselves; no overflow.

## Console

`agent-browser console` at 900x700 and 1440x900: only `[vite] connecting…/connected` debug and the React DevTools info line. **No errors, no warnings.** (Raw logs: `measurements/console-900x700.txt`, `measurements/console-1440x900.txt`.)
