/**
 * In-memory file fixture behind the mock port and its tests. The running app
 * reads the IPC-backed repository (#24).
 *
 * The seed deliberately covers the paths the conversation's file chips point at
 * (`mock-conversation-repository.ts`) plus the Markdown document screen 23 draws,
 * so opening a chip actually renders both content modes. The bodies are authored
 * samples, not copies of the repository's own files: the real contents arrive
 * through the port once it reads the workspace.
 */
import type { FileDocument } from '@/shared/domain/file-document.types';
import type { FileRepository } from './file-repository';

const documents: readonly FileDocument[] = [
  {
    path: 'docs/research-tecnico/arquitectura-tauri.md',
    content: `# Arquitectura de aplicaciones con Tauri: guía para nx-desktop

El punto de partida es el código de este repositorio y las restricciones de sus wireframes. Las recomendaciones de organización son propias; cuando una regla procede de Tauri, Rust, Serde o React se enlaza su fuente.

## Índice

1. [Diagnóstico y alcance](#diagnostico)
2. [Qué arquitectura conviene](#arquitectura)
3. [DTO y contratos](#dto)

## Diagnóstico y alcance

La aplicación es un \`monolito modular por funcionalidades\` con puertos y adaptadores en los bordes externos. La interfaz no habla con el disco: cada lectura pasa por un puerto tipado.

### Lo comprobado en el repositorio

El panel derecho dibuja uno de dos modos:

- **Renderizado**: el documento Markdown, como en la pantalla 23.
- **Código fuente**: las mismas líneas numeradas, como en la pantalla 13.

\`\`\`ts
export interface FileRepository {
  readDocument(path: string): Promise<FileDocument | null>;
}
\`\`\`

> Un puerto con dos implementaciones plausibles es la única razón para introducir una abstracción.

---

Para el estado actual del proyecto se recomienda un monolito modular por funcionalidades, con puertos y adaptadores para las integraciones.
`
  },
  {
    path: 'src/shared/domain/selection-chain.ts',
    content: `import type { Provider } from './provider.types';
import type { EffortLevel } from './effort-level.types';
import type { ModelId, ProviderId } from './value-objects.types';

export interface ResolvedSelection {
  readonly provider: Provider;
  readonly model: Provider['availableModels'][number];
  readonly effortLevel: EffortLevel;
}

export function resolveSelection(
  providers: readonly Provider[],
  desired: { providerId: ProviderId; modelId: ModelId } | null
): ResolvedSelection | null {
  if (providers.length === 0) {
    return null;
  }
  const provider = providers.find(item => item.id === desired?.providerId) ?? providers[0];
  const model = provider.availableModels.find(item => item.id === desired?.modelId) ?? provider.availableModels[0];
  return { provider, model, effortLevel: model.supportedEffortLevels[0] ?? 'light' };
}
`
  },
  {
    path: 'src/features/providers/hooks/use-composer-selection.ts',
    content: `import { useState } from 'react';
import type { Provider } from '@/shared/domain/provider.types';
import { resolveSelection } from '@/shared/domain/selection-chain';

export function useComposerSelection(providers: readonly Provider[]) {
  const [desired, setDesired] = useState(null);
  const resolved = resolveSelection(providers, desired);
  return { resolved, setDesired };
}
`
  },
  {
    path: 'src/App.tsx',
    content: `import { AppShell } from './app/app-shell';

export function App() {
  return <AppShell />;
}
`
  }
];

/**
 * Builds a `FileRepository` backed by the mock contents above. A factory keeps
 * the seam identical to the future IPC client.
 */
export function createMockFileRepository(): FileRepository {
  return {
    readDocument(path) {
      return Promise.resolve(
        documents.find(document => document.path === path) ?? null
      );
    }
  };
}
