/**
 * Copy of the projects feature (#9), per `.claude/rules/text-management.md` §2:
 * feature-scoped strings live in the feature's own `messages.ts` with `as const`
 * and interpolation functions, never concatenated inside JSX.
 *
 * The wording follows `docs/wireframes/05-create-project-empty.html` and
 * `06-create-project-folder.html`; those texts are placeholders, so what is
 * carried over is the wording, never the sample project or folder names the
 * wireframes draw. Names of projects and folders are runtime data and are
 * interpolated, never hardcoded here.
 */
export const projectMessages = {
  createDialog: {
    title: 'Crear proyecto',
    closeLabel: 'Cerrar',
    nameLabel: 'Nombre del proyecto',
    namePlaceholder: 'Nombre del proyecto',
    /**
     * The only error the minimal rule can produce. The wireframe draws no error
     * state, so this is neutral copy for the one case that exists (an empty or
     * whitespace-only name) rather than a policy the issue did not specify.
     */
    nameError: 'Escribe un nombre para el proyecto.',
    foldersLabel: 'Carpetas de origen',
    foldersMachineLabel: 'Este equipo',
    foldersEmptyHint: 'Añadir una carpeta',
    addFolderLabel: 'Añadir',
    addFolderRowLabel: 'Añadir carpeta',
    removeFolderLabel: (folderName: string) => `Quitar ${folderName}`,
    cancelLabel: 'Cancelar',
    submitLabel: 'Crear proyecto'
  }
} as const;

/** Returns the projects feature message map. */
export function getProjectMessages() {
  return projectMessages;
}
