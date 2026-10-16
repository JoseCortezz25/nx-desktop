# Wireframes

Visual references for the desktop coding-agent app (Tauri + Rust + React). They show **layout and behavior**, not final visuals or copy.

Open any `.html` file directly in a browser. All files share `assets/wireframe.css` and use no JavaScript.

## Ground rules for implementation

- **Texts are placeholders.** "ChatGPT", "GPT-6.1 Sol", "Codex" and project names come from the reference images and must not be hardcoded. Provider, model and project data come from abstractions.
- **Provider-agnostic.** First providers: OpenCode, Codex, Claude. The set of available models depends on the selected provider.
- **No Chat/Work toggle.** It appeared in the references and is not part of the product.
- **Out of scope for now:** microphone and voice-chat buttons (they are drawn for fidelity only), and the unused rail icons.
- **Spanish labels** in the wireframes mirror the references. Real UI strings should go through i18n.

## Screen index

| # | File | Screen / state |
|---|------|----------------|
| 01 | `01-home.html` | Home, no sidebar, empty composer |
| 02 | `02-home-sidebar.html` | Home with sidebar open (pinned, projects, recents) |
| 03 | `03-chat-sitemap-doc.html` | Conversation + document tab open in the right panel |
| 04 | `04-project-picker.html` | Project dropdown anchored to the composer context bar |
| 05 | `05-create-project-empty.html` | Create project dialog, no folders yet |
| 06 | `06-create-project-folder.html` | Create project dialog with a source folder added |
| 07 | `07-model-selector.html` | Model popover (single list) |
| 08 | `08-effort-selector.html` | Effort popover (5-stop slider) |
| 09 | `09-local-environment.html` | Environment popover: new worktree, branch, environment |
| 10 | `10-approval-mode.html` | Approval-mode popover (3 levels) |
| 11 | `11-chat-conversation-sidebar.html` | Conversation with sidebar open |
| 12 | `12-chat-conversation-full.html` | Conversation, sidebar hidden |
| 13 | `13-chat-with-editor.html` | Conversation + file editor in the right panel |
| 14 | `14-hooks-review.html` | Hooks review modal, all collapsed |
| 15 | `15-hooks-review-expanded.html` | Hooks review modal, one hook expanded |
| 16 | `16-provider-selector.html` | Provider popover (OpenCode / Codex / Claude) |
| 17 | `17-model-selector-by-provider.html` | Model popover for Claude |
| 18 | `18-chat-with-diff.html` | Conversation + diff view in the right panel |
| 19 | `19-model-selector-codex.html` | Model popover for Codex |
| 20 | `20-model-selector-opencode.html` | Model popover for OpenCode (example models) |

## Layout regions

Every screen is a composition of the same regions:

1. **Title bar:** history navigation, sidebar toggle, menus (Archivo, Edición, Ver, Ayuda), window controls.
2. **Rail:** home and secondary navigation icons.
3. **Sidebar** (toggleable): new chat, pinned, projects (grouping conversations), recents.
4. **Main pane:** home view or conversation, plus the composer.
5. **Right panel** (toggleable, opens on file or diff click): tabs with a viewer.

## Reusable components

| Component | Used in | Notes |
|-----------|---------|-------|
| `Composer` | 01, 02, 04, 07-10, 16-17, 19-20, 11-13, 18 | Input, `+` menu, approval chip, hooks icon, provider chip, model chip, mic, send |
| `ContextBar` | 01, 04, 07-10, 16-17, 19-20 | Project chip, environment chip, settings gear |
| `Popover` / `Select` | 04, 07-10, 16, 17, 19, 20 | **One component**, different content. Provider (16) and model (07, 17, 19, 20) are the same list with a selected row and a check |
| `Dialog` | 05, 06, 14, 15 | Title, close, body, footer actions |
| `ToolActivityRow` | 03, 11-13, 18 | Icon + short description of an executed tool; collapsible group header |
| `FileChip` | 11-13, 18 | Inline link to a file inside a message; opens the right panel |
| `MessageActions` | 11-13, 18 | Copy, read aloud, feedback, share. Timestamp and edit are requested but not yet drawn |
| `RightPanel` | 03, 13, 18 | Tabs + breadcrumb + toolbar + one of: `DocumentView`, `CodeView`, `DiffView` |
| `DiffView` | 18 | Per-file collapsible sections, hunk headers, unified or split |
| `HookRow` | 14, 15 | Checkbox, name, `Nuevo` badge, expandable details |

## State and data the UI implies

These are the abstractions the wireframes need. Names are suggestions, not decisions.

| Concept | Fields visible in the wireframes |
|---------|----------------------------------|
| `Provider` | id, display name, icon, subtitle, available models |
| `Model` | id, display name, provider, supported effort levels |
| `ApprovalMode` | 3 levels: ask always, auto-approve, full access |
| `Project` | name, one or more source folders (workspace), conversations |
| `Conversation` | title, project, messages, pinned flag |
| `ToolCall` | kind (search, command, list files), summary, expandable detail |
| `RunEnvironment` | new worktree flag, git branch (from the repo's branches), environment name |
| `Hook` | name, status (`Nuevo`), origin, hook type (e.g. `PreToolUse`), command, timeout |
| `DiffFile` | path, added/removed counts, hunks, lines (context / added / removed) |

Selection chain in the composer: **provider -> model -> effort**. Changing the provider must reset the model to a valid one for that provider.

## Open questions

- Which effort levels exist per model? The slider shows 5 stops with the first labeled "Ligero".
- Is the approval mode global, per project or per conversation?
- Does changing provider mid-conversation start a new session, or can it continue?
- Hooks: what happens to a hook that is not allowed (`Ahora no`)? Is it re-prompted, and where is it managed (the modal mentions Ajustes)?
- Diff: unified only, or split as well? The toolbar in 18 draws both modes but only unified is rendered.
- Message timestamp and message editing were requested and are not drawn yet.
- OpenCode model names in 20 are examples; real models come from OpenCode's own configuration.
