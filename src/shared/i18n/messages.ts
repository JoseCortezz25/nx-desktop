/**
 * Shared cross-feature i18n messages.
 *
 * Single source of truth for generic UI copy reused by two or more features, as
 * defined in `.claude/rules/text-management.md`: generic reusable actions and
 * public IPC error-code translations. Feature-scoped copy lives in
 * `src/features/<feature>/messages.ts`.
 *
 * Components must never hardcode user-facing strings or wireframe placeholders.
 * Read copy through the accessors exported here (`getSharedMessages`,
 * `getSharedErrorMessage`) so lookup stays behind one seam.
 */
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { OpenTarget } from '@/shared/domain/open-target.types';
import type { SubagentStatusKind } from '@/shared/domain/subagent.types';

export const sharedMessages = {
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry'
  },
  errors: {
    validation_failed: 'The request contains invalid parameters.',
    permission_denied:
      'Operation not permitted outside the authorized workspace.',
    provider_unavailable:
      'The selected agent provider is currently unavailable.',
    cancelled: 'The run was cancelled.',
    internal_error: 'An unexpected internal error occurred.'
  },
  // The app's own navigation surface. The home destination plus the two region
  // toggles live in the rail (#42): the drawn title bar that used to hold the
  // toggles was removed because the OS draws the window frame and its controls,
  // and the native application menu is declared in Rust (`src-tauri/src/lib.rs`)
  // rather than drawn here. The wireframe's fake menu labels (`Archivo`,
  // `Edición`, `Ver`, `Ayuda`), the back/forward labels and the window-control
  // labels were removed with their controls; a native menu's labels belong to
  // the Rust declaration, not this copy map. Identifiers stay English.
  rail: {
    navigationLabel: 'Navegación principal',
    homeLabel: 'Inicio',
    toggleSidebarLabel: 'Alternar barra lateral',
    toggleRightPanelLabel: 'Alternar panel derecho'
  },
  // Sidebar contents (#10). Group headings and the empty-project row follow the
  // wireframe wording (`docs/wireframes/02-home-sidebar.html`,
  // `11-chat-conversation-sidebar.html`: "Fijados", "Proyectos", "Recientes",
  // "Sin chats"). The brand is the application name `Nx`, not a provider: #41
  // overrides the wireframe and supersedes #10 (`business-logic.md` §3.6).
  // The notifications and search labels were removed with their deferred
  // controls rather than kept as dead copy (#41).
  sidebar: {
    brand: 'Nx',
    newChat: 'Nuevo chat',
    pinned: 'Fijados',
    projects: 'Proyectos',
    recents: 'Recientes',
    emptyProject: 'Sin chats'
  },
  rightPanel: {
    closeLabel: 'Cerrar panel'
  },
  // Home view and composer (#6). The wireframe draws the prompt placeholder as
  // a phrase naming a concrete provider; that is placeholder text, never product
  // copy (`docs/wireframes/README.md`, ground rules; `.claude/knowledge/business-logic.md`
  // §3.4). The placeholder is therefore built at runtime from the active
  // provider's display name instead of naming a provider here.
  home: {
    title: '¿En qué deberíamos trabajar?'
  },
  // Composer provider/model/effort selectors (#7). The wireframe wording is the
  // copy source (`docs/wireframes/16-provider-selector.html`,
  // `07-model-selector.html`, `08-effort-selector.html`); provider, model and
  // effort *names* are runtime data and are interpolated, never hardcoded.
  composer: {
    hooks: {
      triggerLabel: (newHookCount: number) =>
        newHookCount > 0
          ? `Revisar hooks: ${newHookCount} nuevos`
          : 'Revisar hooks'
    },
    promptLabel: 'Mensaje',
    addLabel: 'Añadir',
    sendLabel: 'Enviar',
    cancelRunLabel: 'Detener la ejecución',
    promptPlaceholder: (providerName: string) => `Trabaja con ${providerName}`,
    provider: {
      listLabel: 'Proveedores',
      triggerLabel: (providerName: string) => `Proveedor: ${providerName}`,
      header: 'Seleccionar proveedor',
      footer: 'Los modelos disponibles dependen del proveedor'
    },
    model: {
      listLabel: 'Modelos',
      triggerLabel: (modelName: string) => `Modelo: ${modelName}`,
      header: 'Seleccionar modelo',
      providerLine: (providerName: string) => `Proveedor: ${providerName}`,
      changeLabel: 'Cambiar',
      leadTitle: 'Predeterminado',
      leadDescription: 'Selección recomendada de modelos',
      footer: 'Los modelos cambian según el proveedor seleccionado'
    },
    effort: {
      groupLabel: 'Esfuerzo',
      triggerLabel: (effortLabel: string) => `Esfuerzo: ${effortLabel}`,
      /**
       * Display labels for the stop vocabulary the providers report today.
       * These stops are placeholder data (#31 owns the real per-provider/per-model
       * mapping) and the wireframes only draw the first one ("Ligero"), so these
       * labels are placeholder copy too: `getEffortLevelLabel` falls back to the
       * provider's own token for any stop that is not listed here.
       */
      labels: {
        light: 'Ligero',
        standard: 'Estándar',
        high: 'Alto',
        extended: 'Extendido',
        maximum: 'Máximo'
      } as Readonly<Record<string, string | undefined>>
    },
    // Approval chip and its popover (#8). The levels come from the domain
    // (`APPROVAL_MODES`) and this map is keyed by them, so a level added to the
    // domain cannot ship without copy. Wording follows
    // `docs/wireframes/10-approval-mode.html`; the header names the active
    // provider at runtime, exactly like the prompt placeholder, because the
    // wireframe's "ChatGPT" is placeholder text.
    approval: {
      listLabel: 'Modos de aprobación',
      triggerLabel: (modeLabel: string) => `Aprobación: ${modeLabel}`,
      header: (providerName: string) =>
        `¿Cómo deben aprobarse las acciones de ${providerName}?`,
      modes: {
        ask_always: {
          label: 'Solicitar aprobación',
          description:
            'Pedir siempre confirmación antes de editar archivos externos y usar internet'
        },
        auto_approve: {
          label: 'Aprobar automáticamente',
          description:
            'Solicitar aprobación solo para las acciones detectadas como potencialmente inseguras'
        },
        full_access: {
          label: 'Acceso completo',
          description:
            'Acceder sin restricciones a internet y a cualquier archivo de tu ordenador'
        }
      }
    }
  },
  // Context bar that sits on the composer (#8): the project picker and the
  // environment popover (`docs/wireframes/04-project-picker.html`,
  // `09-local-environment.html`, `10-approval-mode.html`).
  //
  // The wireframe writes `09`'s popover in English while `04` and `10` are in
  // Spanish. The app's copy is Spanish throughout, so the environment field
  // labels are Spanish here and the wireframe's English wording is not carried
  // over (`docs/wireframes/README.md`: texts are placeholders, not final copy).
  contextBar: {
    project: {
      emptyLabel: 'Elegir proyecto',
      triggerLabel: (projectName: string) => `Proyecto: ${projectName}`,
      listLabel: 'Proyectos',
      header: 'Seleccionar proyecto',
      // The project picker's action row that opens the create-project dialog
      // (#9). It belongs to the shared picker rather than the projects feature,
      // because `src/shared/ui/**` may not import from `src/features/**`
      // (`.claude/rules/atomic-design.md`). Wording follows the wireframe's
      // `Nuevo proyecto` row (`docs/wireframes/04-project-picker.html`).
      createLabel: 'Nuevo proyecto'
    },
    environment: {
      localMachine: 'Este ordenador',
      triggerLabel: (environmentLabel: string) =>
        `Entorno: ${environmentLabel}`,
      listLabel: 'Entorno de ejecución',
      header: 'Configurar entorno local'
    }
  },
  // Fields of `RunEnvironment`, edited in the environment popover
  // (`docs/wireframes/09-local-environment.html`).
  environment: {
    worktree: 'Nuevo worktree',
    branch: 'Rama',
    branchListLabel: 'Ramas',
    name: 'Entorno',
    namePlaceholder: 'Sin entorno'
  },
  // Conversation region (#11): the collapsible tool-activity group, the inline
  // file chips and the actions row below each message
  // (`docs/wireframes/11-chat-conversation-sidebar.html`,
  // `12-chat-conversation-full.html`; `.claude/knowledge/business-logic.md` §3.5
  // item 2). Message text, conversation title and file paths are runtime data,
  // never hardcoded here.
  conversation: {
    toolActivity: {
      count: (total: number) =>
        `${total} ${total === 1 ? 'acción' : 'acciones'}`,
      expandLabel: 'Expandir actividad de herramientas',
      collapseLabel: 'Contraer actividad de herramientas',
      openChangesLabel: 'Abrir los cambios en el panel derecho',
      openSubagentLabel: 'Ver el subagente en el panel derecho'
    },
    fileChip: {
      openLabel: (path: string) => `Abrir ${path}`
    },
    message: {
      copyLabel: 'Copiar mensaje',
      feedbackLabel: 'Enviar comentarios',
      shareLabel: 'Compartir mensaje',
      timestampLabel: (time: string) => `Enviado a las ${time}`,
      editLabel: 'Editar mensaje'
    }
  },
  // Right panel diff view (#13): the per-file sections, their hunk tables and the
  // panel tab that opens them (`docs/wireframes/18-chat-with-diff.html`). File
  // paths and the numbers themselves are runtime data; `+` / `-` are diff
  // notation, not copy. The wireframe's `Vista dividida` / `Vista unificada`
  // toggle has no copy here because `split` is deferred
  // (`.claude/knowledge/business-logic.md` §3.5 item 1).
  diff: {
    panelTabLabel: 'Cambios',
    listLabel: 'Cambios del espacio de trabajo',
    loadingLabel: 'Cargando los cambios…',
    emptyLabel: 'No hay cambios en este espacio de trabajo',
    summary: {
      fileCount: (total: number) =>
        `${total} ${total === 1 ? 'archivo cambiado' : 'archivos cambiados'}`,
      addedLabel: (total: number) => `${total} líneas añadidas`,
      removedLabel: (total: number) => `${total} líneas eliminadas`
    },
    section: {
      expandLabel: (path: string) => `Expandir ${path}`,
      collapseLabel: (path: string) => `Contraer ${path}`,
      countsLabel: (added: number, removed: number) =>
        `${added} líneas añadidas, ${removed} líneas eliminadas`
    },
    hunk: {
      tableLabel: (path: string) => `Diferencias de ${path}`
    }
  },

  // Right panel subagents viewer (#14): the grouped list and the detail
  // (`docs/wireframes/21-subagents-list.html`, `22-subagent-detail.html`).
  // Status and group labels are keyed by the locked status vocabulary
  // (`SUBAGENT_STATUS_KINDS`, decision 2026-10-16) through the accessors below,
  // so a state added to the union cannot compile without its copy; names,
  // model strings, effort levels and transcripts are runtime data, never copy.
  subagents: {
    panelTabLabel: 'Subagentes',
    list: {
      groupsLabel: 'Subagentes',
      groupLabels: {
        processing: 'Activados',
        finished: 'Finalizados',
        cancelled: 'Cancelados',
        failed: 'Fallidos'
      } as Readonly<Record<SubagentStatusKind, string>>,
      groupHeading: (label: string, count: number) => `${label} · ${count}`,
      loadingLabel: 'Cargando los subagentes…',
      emptyLabel: 'Este run no tiene subagentes'
    },
    statuses: {
      processing: 'Procesando',
      finished: 'Finalizado',
      failed: 'Fallido',
      cancelled: 'Cancelado'
    } as Readonly<Record<SubagentStatusKind, string>>,
    detail: {
      backLabel: 'Volver a la lista',
      metaLabel: (model: string, effort: string) => `${model} · ${effort}`,
      transcriptLabel: 'Transcripción del subagente',
      earlierLabel: (count: number) => `${count} mensajes anteriores`,
      expandLabel: 'Mostrar mensajes anteriores',
      collapseLabel: 'Contraer mensajes anteriores'
    },
    actions: {
      stopLabel: 'Detener'
    }
  },
  // Right panel file viewer (#12): its tab strip, the breadcrumb toolbar and the
  // `Abrir` menu (`docs/wireframes/23-file-viewer-markdown.html`,
  // `24-file-open-menu.html`, `13-chat-with-editor.html`). The file paths and
  // names drawn here are runtime data, never copy.
  //
  // `targets` is keyed by the domain's `OpenTarget` and `getOpenTargetLabel` is
  // its one reader, so the corrected decision (`.claude/knowledge/business-logic.md`
  // §3.5 item 3: the editor target only) has copy where it needs it and nothing
  // advertises a target the menu no longer offers. `viewSourceLabel` and
  // `viewDocumentLabel` are the two sides of the same toolbar toggle: the
  // wireframe only draws "Ver código fuente", and the inverse label is the return
  // path the same control needs.
  fileViewer: {
    emptyLabel: 'Abre un archivo desde el chat',
    loadingLabel: 'Cargando el archivo…',
    missingLabel: 'No se pudo leer este archivo',
    breadcrumbLabel: 'Ruta del archivo',
    tabs: {
      listLabel: 'Archivos abiertos',
      closeLabel: (name: string) => `Cerrar ${name}`
    },
    toolbar: {
      searchLabel: 'Buscar en el archivo',
      copyPathLabel: 'Copiar ruta del archivo',
      viewSourceLabel: 'Ver código fuente',
      viewDocumentLabel: 'Ver documento'
    },
    openMenu: {
      triggerLabel: 'Abrir',
      menuLabel: 'Opciones de apertura',
      targets: {
        editor: 'Abrir en VS Code'
      } as Readonly<Partial<Record<OpenTarget, string>>>
    }
  }
} as const;

/**
 * Resolves the display label for a provider-reported effort stop.
 *
 * The stop vocabulary is open (`EffortLevel = string`), so a provider that
 * reports a stop this placeholder map does not know falls back to its own token
 * rather than inventing copy.
 */
export function getEffortLevelLabel(level: string): string {
  return sharedMessages.composer.effort.labels[level] ?? level;
}

/**
 * Resolves the visible status of one subagent.
 *
 * The map is keyed by `SubagentStatusKind`, so TypeScript fails the build if the
 * discriminated status union gains a kind without copy the row can print — the
 * union is never retyped here (texts follow wireframe 21).
 */
export function getSubagentStatusLabel(kind: SubagentStatusKind): string {
  return sharedMessages.subagents.statuses[kind];
}

/**
 * Resolves the list-group heading of one status bucket (wireframe 21 prints
 * "Activados · 2": this returns the first fragment; the count is runtime data
 * the panel composes).
 */
export function getSubagentGroupLabel(kind: SubagentStatusKind): string {
  return sharedMessages.subagents.list.groupLabels[kind];
}

/**
 * The label and description of one approval level.
 *
 * The map is keyed by `ApprovalMode`, so TypeScript fails the build if the domain
 * gains a level without copy — the union is never retyped here.
 */
export function getApprovalModeCopy(mode: ApprovalMode) {
  return sharedMessages.composer.approval.modes[mode];
}

/**
 * Resolves the visible label of one open target for the `Abrir` menu.
 *
 * The corrected decision offers the editor target only (§3.5 item 3), so the map
 * is deliberately partial: a target that is not offered has no label to leak into
 * the menu, and a target that is offered reads its label here and nowhere else.
 */
export function getOpenTargetLabel(target: OpenTarget): string {
  return sharedMessages.fileViewer.openMenu.targets[target] ?? target;
}

/** Stable `snake_case` error codes carried by `AppErrorDto`. */
export type SharedErrorCode = keyof typeof sharedMessages.errors;

/** Shape of the shared message map, derived from the `as const` literal. */
export type SharedMessages = typeof sharedMessages;

/** Returns the shared message map. */
export function getSharedMessages(): SharedMessages {
  return sharedMessages;
}

/** Resolves the localized copy for a public IPC error code. */
export function getSharedErrorMessage(code: SharedErrorCode): string {
  return sharedMessages.errors[code];
}
