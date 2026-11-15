/** Statuts d'une mission, dans l'ordre des onglets. « Chez le client » et « En pause » viennent des colonnes Trello. */
export const STATUTS_MISSIONS = [
  ["ouverte", "Ouvertes"], ["chez_client", "Chez le client"], ["pourvue", "Pourvues"], ["en_pause", "En pause"], ["fermee", "Fermées"],
] as const;
export const LIBELLE_STATUT: Record<string, string> = {
  ouverte: "Ouverte", chez_client: "Chez le client", pourvue: "Pourvue", en_pause: "En pause", fermee: "Fermée",
};
