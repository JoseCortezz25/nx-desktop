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
  // Window-shell chrome. The wireframe wording is the copy source
  // (`docs/wireframes/README.md`, "Ground rules for implementation", and
  // `docs/wireframes/01-home.html`); identifiers stay English.
  window: {
    menus: {
      file: 'Archivo',
      edit: 'Edición',
      view: 'Ver',
      help: 'Ayuda'
    },
    navigation: {
      backLabel: 'Atrás',
      forwardLabel: 'Adelante',
      toggleSidebarLabel: 'Alternar barra lateral',
      toggleRightPanelLabel: 'Alternar panel derecho'
    },
    controls: {
      minimize: 'Minimizar',
      maximize: 'Maximizar',
      close: 'Cerrar'
    }
  },
  rail: {
    navigationLabel: 'Navegación principal',
    homeLabel: 'Inicio'
  },
  // Sidebar contents (#10). Group headings and the empty-project row follow the
  // wireframe wording (`docs/wireframes/02-home-sidebar.html`,
  // `11-chat-conversation-sidebar.html`: "Fijados", "Proyectos", "Recientes",
  // "Sin chats"). The brand shows the active provider at runtime, never a
  // hardcoded placeholder.
  sidebar: {
    newChat: 'Nuevo chat',
    notificationsLabel: 'Notificaciones',
    searchLabel: 'Buscar',
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
    promptLabel: 'Mensaje',
    addLabel: 'Añadir',
    sendLabel: 'Enviar',
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
      header: 'Seleccionar proyecto'
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
      collapseLabel: 'Contraer actividad de herramientas'
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
 * The label and description of one approval level.
 *
 * The map is keyed by `ApprovalMode`, so TypeScript fails the build if the domain
 * gains a level without copy — the union is never retyped here.
 */
export function getApprovalModeCopy(mode: ApprovalMode) {
  return sharedMessages.composer.approval.modes[mode];
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
