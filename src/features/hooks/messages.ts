/** Feature-scoped hooks review copy; provider names and commands remain data. */
export const hookMessages = {
  hookReview: {
    title: 'Revisar hooks',
    closeLabel: 'Cerrar',
    newBadge: 'Nuevo',
    selectLabel: (name: string) => `Seleccionar ${name}`,
    expandLabel: (name: string) => `Expandir ${name}`,
    collapseLabel: (name: string) => `Contraer ${name}`,
    originLabel: 'Origen',
    hookTypeLabel: 'Tipo de hook',
    commandLabel: 'Comando',
    timeoutLabel: 'Tiempo límite',
    footerNote: 'Puedes cambiarlo más tarde en Ajustes',
    loadingLabel: 'Cargando hooks…',
    loadErrorLabel: 'No se pudieron cargar los hooks de este proyecto',
    emptyLabel: 'Este proyecto no tiene hooks para revisar',
    decisionErrorLabel: 'No se pudo guardar la decisión. Inténtalo de nuevo.',
    rejectLabel: 'Ahora no',
    allowAllLabel: 'Permitir todo',
    allowSelectionLabel: 'Permitir la selección'
  }
} as const;

export function getHookMessages() {
  return hookMessages;
}
