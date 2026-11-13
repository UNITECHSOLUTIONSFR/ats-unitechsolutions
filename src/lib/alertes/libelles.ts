/** Alertes techniques (rapprochement des fichiers Word ↔ PDF) : réservées aux administrateurs, jamais montrées aux recruteurs. */
export const ALERTES_TECHNIQUES = ["association_douteuse"];

/** Types d'alertes qu'un rôle peut voir. */
export const alerteVisible = (type: string, estAdmin: boolean) => estAdmin || !ALERTES_TECHNIQUES.includes(type);

export const LIBELLES_ALERTES: Record<string, string> = {
  doublon_possible: "Doublon possible",
  telephone_invalide: "Téléphone à vérifier",
  nom_manquant: "Nom manquant",
  cv_illisible: "CV à vérifier (illisible)",
  association_douteuse: "Association CV à vérifier",
  disponibilite_ancienne: "Disponibilité ancienne",
  autre: "À compléter",
};

/** Détail lisible d'une alerte. */
export function detailAlerte(details: Record<string, unknown> | null, estAdmin = true): string {
  if (!details) return "";
  const d = details as Record<string, unknown>;
  // La ligne du fichier Excel d'origine n'intéresse que les administrateurs.
  return [d.motif, d.valeur && `valeur : ${d.valeur}`, d.email && `email : ${d.email}`, d.fichier && `fichier : ${d.fichier}`, estAdmin && d.ligne_excel && `ligne Excel ${d.ligne_excel}`]
    .filter(Boolean).join(" · ");
}
