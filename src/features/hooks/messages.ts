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
    rejectLabel: 'Ahora no',
    allowAllLabel: 'Permitir todo',
    allowSelectionLabel: 'Permitir la selección'
  }
} as const;

export function getHookMessages() {
  return hookMessages;
}
