# Feature: wireframes

Objective: 13 mid-fi standalone HTML wireframes in docs/wireframes/ replicating reference images 1-13.
Route: delegated direct (13 haiku writers, one per file). TDD: off (static HTML).
Checks: rendered each file with agent-browser and compared to reference image; fixed 01, 06, 08.

- [x] T1 shared assets/wireframe.css (+ mid-fidelity layer)
- [x] T2 01..13 wireframes, mid-fidelity pass (inline SVG icons)
- [x] T3 01: toggle Chat/Work removed (user request)
- [x] T4 render review; fixes: 01 chip icon gap, 06 stray text, 08 popover overlap
- [ ] T5 commit (not requested; pending user decision)
- [x] T6 14, 15 hooks review modal (from reference images 14-15)
- [x] T7 16 provider selector, 17 model selector by provider, 18 chat with diff panel (no reference image; derived from 07 and 13)
- [x] T8 render review of 14-18; fixes: 16 popover footer overflow + stray clip glyph, 17 grey page bg + popover width
- [x] T9 19 codex and 20 opencode model selectors; toggle Chat/Work removed from 02; 01 renamed to 01-home.html
- [x] T10 docs/wireframes/README.md (screen index, components, data model, open questions)
- [x] T11 remote: private repo JoseCortezz25/nx-desktop created, origin added, 9 factory labels created (no push, no tickets)
- [ ] T12 AGENTS.md + docs/agents/* + foundation ticket, then atomic tickets (pending user go-ahead)
