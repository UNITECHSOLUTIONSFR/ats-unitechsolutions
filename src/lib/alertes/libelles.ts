export const LIBELLES_ALERTES: Record<string, string> = {
  doublon_possible: "Doublon possible",
  telephone_invalide: "Téléphone à vérifier",
  nom_manquant: "Nom manquant",
  cv_illisible: "CV illisible (scanné ?)",
  association_douteuse: "Association CV à vérifier",
  disponibilite_ancienne: "Disponibilité ancienne",
  autre: "À compléter",
};

/** Détail lisible d'une alerte. */
export function detailAlerte(details: Record<string, unknown> | null): string {
  if (!details) return "";
  const d = details as Record<string, unknown>;
  return [d.motif, d.valeur && `valeur : ${d.valeur}`, d.email && `email : ${d.email}`, d.fichier && `fichier : ${d.fichier}`, d.ligne_excel && `ligne Excel ${d.ligne_excel}`]
    .filter(Boolean).join(" · ");
}
