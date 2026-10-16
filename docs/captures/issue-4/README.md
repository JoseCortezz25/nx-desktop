# Verification captures — issue #4 (app shell)

Rendered evidence for the scoped-visual validation of the window shell. These are
review artifacts, not application source or baselines; the baseline for the
comparison is the wireframe HTML itself (`docs/wireframes/01-home.html`).

All captures are `viewport` mode at **1440x900** (desktop), produced from the PR
branch with `pnpm run dev` (Vite dev server on `http://localhost:1420/`).

| File | State | Compared against |
| --- | --- | --- |
| `01-default-closed.png` | Title bar, rail, main pane; sidebar and right panel closed | `docs/wireframes/01-home.html` (region layout) |
| `02-sidebar-open.png` | Sidebar toggled open (318px, provider brand, new chat) | `docs/wireframes/02-home-sidebar.html` (region frame) |
| `03-sidebar-and-right-panel-open.png` | Both toggleable regions open at once | — (toggle proof) |
| `04-right-panel-open.png` | Right panel open, sidebar closed | — (toggle proof) |
| `ref-01-home.png` | Wireframe 01 rendered at the same viewport | reference render |
| `ref-02-home-sidebar.png` | Wireframe 02 rendered at the same viewport | reference render |
| `commands.txt` | Output of the required self-checks | — |
| `capture-result.json` | Measured region geometry and toggle assertions | — |

Measured geometry in the default state: title bar `1440x40`, rail `56` wide,
main pane `1384x848`, no console exceptions. Sidebar open: `318` wide (matching
the `--sidebar-width` token), brand `OpenCode` resolved from the mock provider
port, new-chat copy `Nuevo chat`.
