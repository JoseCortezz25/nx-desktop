# Atomic Design Classification Catalog for `nx-desktop`

Mapping of `nx-desktop` wireframe components (`docs/wireframes/README.md`) to Atomic Design levels:

| Wireframe Component                                   | Atomic Level | Scope                                                          | Rationale                                                                                |
| ----------------------------------------------------- | ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Button`, `Badge`, `Icon`, `StatusDot`, `Kbd`         | **Atom**     | `src/shared/ui/atoms/`                                         | Single primitive with visual states only                                                 |
| `FileChip`                                            | **Atom**     | `src/shared/ui/atoms/`                                         | Inline clickable file badge emitting `onOpenFile(path)`                                  |
| `Popover` / `Select` (list shell)                     | **Molecule** | `src/shared/ui/molecules/`                                     | Shared floating list with selected row & check icon                                      |
| `Dialog` (modal shell)                                | **Molecule** | `src/shared/ui/molecules/`                                     | Title, close button, body slot, footer actions                                           |
| `ContextBar`                                          | **Molecule** | `src/shared/ui/molecules/`                                     | Composes project chip, environment chip, and settings trigger                            |
| `MessageActions`                                      | **Molecule** | `src/shared/ui/molecules/`                                     | Composes copy, read-aloud, feedback, and share icon buttons                              |
| `ToolActivityRow`                                     | **Molecule** | `src/features/runs/ui/molecules/`                              | Icon + summary + collapsible detail panel                                                |
| `HookRow`                                             | **Molecule** | `src/features/runs/ui/molecules/`                              | Checkbox + name + `New` badge + expandable metadata                                      |
| `Composer`                                            | **Organism** | `src/features/conversations/ui/organisms/`                     | Coordinates prompt input, provider/model/effort chips, approval mode, and run submission |
| `ProviderPicker` / `ModelPicker` / `EffortPicker`     | **Organism** | `src/features/providers/ui/organisms/`                         | Connects provider catalog & selection reconciliation hook to shared `Popover` molecule   |
| `CreateProjectDialog`                                 | **Organism** | `src/features/projects/ui/organisms/`                          | Connects workspace folder selection & project creation hook to shared `Dialog` molecule  |
| `HooksReviewModal`                                    | **Organism** | `src/features/runs/ui/organisms/`                              | Composes `Dialog` + `HookRow` list + approval policy actions                             |
| `RightPanel` (`DocumentView`, `CodeView`, `DiffView`) | **Organism** | `src/shared/ui/organisms/` & `src/features/runs/ui/organisms/` | Tabbed viewer coordinating active file/diff tabs                                         |
