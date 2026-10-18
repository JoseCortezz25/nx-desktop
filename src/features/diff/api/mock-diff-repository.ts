/**
 * In-memory change set used until the Rust core exposes a workspace diff.
 *
 * The seed is the change screen 18 draws: `src/App.tsx` (+9 / -4) and
 * `src-tauri/src/lib.rs` (+5 / -2), which is the `2 archivos cambiados` and the
 * `+14` / `-6` the summary bar prints. The bodies are authored samples, not a
 * copy of this repository's own history; real hunks arrive through the port.
 *
 * A file's declared counts are the repository's statement about its own lines
 * and the view never recomputes them, so the seed keeps the two in agreement
 * (`mock-diff-repository.test.ts` pins that agreement).
 */
import type { DiffFile } from '@/shared/domain/diff-file.types';
import type { DiffRepository } from './diff-repository';

const INITIAL_DIFF: readonly DiffFile[] = [
  {
    path: 'src/App.tsx',
    addedCount: 9,
    removedCount: 4,
    hunks: [
      {
        header: '@@ -6,7 +6,12 @@ function App()',
        lines: [
          { kind: 'context', content: 'function App() {' },
          {
            kind: 'removed',
            content: '  const [greetMsg, setGreetMsg] = useState("");'
          },
          {
            kind: 'added',
            content: '  const [provider, setProvider] = useState("claude");'
          },
          {
            kind: 'added',
            content: '  const [model, setModel] = useState("sonnet");'
          },
          {
            kind: 'context',
            content: '  const [name, setName] = useState("");'
          },
          { kind: 'context', content: '' },
          { kind: 'context', content: '  async function greet() {' },
          {
            kind: 'context',
            content:
              '    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/'
          },
          {
            kind: 'removed',
            content: '    setGreetMsg(await invoke("greet", { name }));'
          },
          {
            kind: 'added',
            content: '    const reply = await invoke<string>("send_message", {'
          },
          { kind: 'added', content: '      provider, model, name,' },
          { kind: 'added', content: '    });' },
          { kind: 'added', content: '    setGreetMsg(reply);' },
          { kind: 'added', content: '    setName("");' }
        ]
      },
      {
        header: '@@ -48,3 +50,3 @@ return (',
        lines: [
          { kind: 'context', content: '      <form className="row">' },
          {
            kind: 'removed',
            content:
              '        <input id="greet-input" onChange={(e) => setName(e.currentTarget.value)} />'
          },
          {
            kind: 'removed',
            content: '        <button type="submit">Greet</button>'
          },
          {
            kind: 'added',
            content:
              '        <input id="user-input" value={name} placeholder="Escribe tu mensaje..." />'
          },
          {
            kind: 'added',
            content: '        <button type="submit">Enviar</button>'
          }
        ]
      }
    ]
  },
  {
    path: 'src-tauri/src/lib.rs',
    addedCount: 5,
    removedCount: 2,
    hunks: [
      {
        header: '@@ -12,5 +12,8 @@ fn main() {',
        lines: [
          { kind: 'context', content: 'fn main() {' },
          { kind: 'removed', content: '    let greeting = "Hello";' },
          { kind: 'added', content: '    let provider = "claude";' },
          { kind: 'added', content: '    let model = "sonnet";' },
          { kind: 'added', content: '    let effort = "high";' },
          { kind: 'context', content: '    tauri::Builder::default()' },
          {
            kind: 'removed',
            content: '        .invoke_handler(tauri::generate_handler![greet])'
          },
          {
            kind: 'added',
            content:
              '        .invoke_handler(tauri::generate_handler![send_message])'
          },
          {
            kind: 'context',
            content: '        .run(tauri::generate_context!())'
          },
          {
            kind: 'added',
            content: '        .expect("error while running nx-desktop");'
          }
        ]
      }
    ]
  }
];

export interface MockDiffRepositoryOptions {
  /** Replaces the seed, e.g. with `[]` for the clean-workspace state. */
  readonly files?: readonly DiffFile[];
}

/**
 * Builds a `DiffRepository` backed by the seed above. A factory keeps the seam
 * identical to the future IPC client and lets a caller seed a different state
 * rather than sharing one module-level list.
 */
export function createMockDiffRepository(
  options: MockDiffRepositoryOptions = {}
): DiffRepository {
  const files = options.files ?? INITIAL_DIFF;

  return {
    readWorkspaceDiff() {
      return Promise.resolve(files);
    }
  };
}
