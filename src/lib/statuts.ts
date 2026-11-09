/** Couleur d'une pastille selon le sens du statut : vert = disponible ou retenu, orange = à vérifier, rouge = alerte, gris = inactif. */
export function classePastille(texte: string | null | undefined): string {
  const t = (texte ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/inactif|archiv|parti|ferme|refuse/.test(t)) return "pastille pastille-gris";
  if (/alerte|bloqu|urgent|invalide|manquant/.test(t)) return "pastille pastille-rouge";
  if (/disponible|immediat|retenu|ouverte|libre|actif/.test(t)) return "pastille pastille-vert";
  if (/verifier|a confirmer|en cours|appele|envoye|propose|mission|preavis/.test(t)) return "pastille pastille-orange";
  return "pastille pastille-gris";
}
