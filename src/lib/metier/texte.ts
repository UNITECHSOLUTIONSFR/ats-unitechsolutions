/** Retire les accents : « Éloïse » -> « Eloise ». */
export function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Forme normalisée d'un nom de compétence : minuscules, sans accents, espaces simples. */
export function normaliserCompetence(nom: string): string {
  return sansAccents(nom).toLowerCase().trim().replace(/\s+/g, " ");
}

/** Forme normalisée d'un nom de personne, pour comparer deux fiches. */
export function normaliserNomPersonne(prenom: string, nom: string): string {
  return sansAccents(`${prenom} ${nom}`)
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim();
}
