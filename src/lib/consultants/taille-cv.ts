/** Limite des CV ajoutés depuis le navigateur (décision du 25/11/2026 : 4 Mo gardés, message clair avant tout envoi). */
export const TAILLE_MAX_CV = 4 * 1024 * 1024;

/** Message affiché tout de suite quand le CV choisi dépasse 4 Mo (null sinon). */
export function messageCVTropLourd(octets: number): string | null {
  if (octets <= TAILLE_MAX_CV) return null;
  const mo = (octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return `Ce CV fait ${mo} Mo : 4 Mo maximum. Compressez-le (par exemple « Enregistrer en PDF réduit » ou un site de compression PDF), puis ajoutez-le de nouveau.`;
}
