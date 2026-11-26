/** Statuts d'une fiche (26/11/2026) : libellés et couleurs des pastilles, partagés par la fiche, la liste et les missions. */
export const STATUTS_FICHE = ["candidat", "consultant", "en_mission_unitech", "en_mission_ailleurs", "ne_pas_contacter", "inactif"] as const;
export type StatutFiche = (typeof STATUTS_FICHE)[number];

export const LIBELLES_STATUT: Record<string, string> = {
  candidat: "Candidat",
  consultant: "Consultant",
  en_mission_unitech: "Consultant Unitech · en mission",
  en_mission_ailleurs: "En mission ailleurs",
  ne_pas_contacter: "Ne pas contacter",
  inactif: "Inactif",
  en_mission: "En mission",
};

/** Pastille à afficher (null pour les statuts ordinaires). */
export function pastilleStatut(statut: string | null | undefined): { texte: string; classes: string } | null {
  if (statut === "en_mission_unitech") return { texte: "Unitech · en mission", classes: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" };
  if (statut === "en_mission_ailleurs") return { texte: "En mission ailleurs", classes: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  if (statut === "ne_pas_contacter") return { texte: "Ne pas contacter", classes: "bg-red-50 text-red-700 ring-1 ring-red-200" };
  return null;
}

/** Statuts propres à l'outil : jamais écrits dans l'Excel d'origine. */
export const STATUTS_EXCEL = new Set(["candidat", "consultant", "inactif"]);
