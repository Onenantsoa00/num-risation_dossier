export const statutOptions = [
  { label: 'En attente dispatch', value: 'EN_ATTENTE_DISPATCH' },
  { label: 'En vérification', value: 'EN_VERIFICATION' },
  { label: 'En validation', value: 'EN_VALIDATION' },
  { label: 'Validé', value: 'VALIDE' },
  { label: 'Rejeté', value: 'REJETE' },
  { label: 'Retour dispatch', value: 'RETOUR_DISPATCH' },
  { label: 'Archivé', value: 'ARCHIVE' },
]

export function statusLabel(statut) {
  return statutOptions.find((s) => s.value === statut)?.label || statut
}

export function statusColor(statut) {
  const map = {
    EN_ATTENTE_DISPATCH: 'grey',
    EN_VERIFICATION: 'info',
    EN_VALIDATION: 'warning',
    VALIDE: 'positive',
    REJETE: 'negative',
    RETOUR_DISPATCH: 'secondary',
    ARCHIVE: 'dark',
  }
  return map[statut] || 'grey'
}
