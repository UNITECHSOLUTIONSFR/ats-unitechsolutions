import "server-only";

/**
 * Accès à Trello. Lecture : missions (chaque heure). Écriture : UNE seule, le déplacement d'une carte vers une autre colonne
 * depuis la vue Kanban (décision du 20/11/2026) ; il faut un jeton créé avec scope=read,write. Aucune autre écriture
 * (ni création, ni modification de texte, ni suppression, ni archivage).
 * Clé et jeton : variables TRELLO_API_KEY et TRELLO_TOKEN (Vercel, jamais dans le code), envoyés dans l'en-tête Authorization.
 */
const BASE = "https://api.trello.com/1";

export function trelloConfigure(): boolean {
  return !!(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN);
}

function entete(): Record<string, string> {
  const cle = process.env.TRELLO_API_KEY, jeton = process.env.TRELLO_TOKEN;
  if (!cle || !jeton) throw new Error("Clé Trello absente (TRELLO_API_KEY, TRELLO_TOKEN)");
  return { Authorization: `OAuth oauth_consumer_key="${cle}", oauth_token="${jeton}"`, Accept: "application/json" };
}

export async function trelloGet<T>(chemin: string): Promise<T> {
  // Trello indisponible un instant (erreur 5xx, limite de débit 429, coupure réseau) : jusqu'à 3 nouveaux essais espacés.
  for (let essai = 0; ; essai++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}${chemin}`, { headers: entete(), cache: "no-store" });
    } catch (e) {
      if (essai < 3) { await pause(essai); continue; }
      throw new Error(`Trello injoignable sur ${chemin.split("?")[0]} (${(e as Error).message.slice(0, 80)})`);
    }
    if ((r.status >= 500 || r.status === 429) && essai < 3) { await pause(essai); continue; }
    if (!r.ok) throw new Error(`Trello ${r.status} sur ${chemin.split("?")[0]}`);
    return (await r.json()) as T;
  }
}

/** Seule écriture autorisée : change la colonne d'une carte (placée en haut de la colonne). */
export async function deplacerCarteTrello(carteId: string, listeId: string): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!/^[0-9a-f]{24}$/i.test(carteId) || !/^[0-9a-f]{24}$/i.test(listeId)) return { ok: false, erreur: "Carte ou colonne Trello invalide." };
  for (let essai = 0; ; essai++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}/cards/${carteId}?idList=${listeId}&pos=top`, { method: "PUT", headers: entete(), cache: "no-store" });
    } catch {
      if (essai < 2) { await pause(essai); continue; }
      return { ok: false, erreur: "Trello ne répond pas : réessayez dans un instant." };
    }
    if ((r.status >= 500 || r.status === 429) && essai < 2) { await pause(essai); continue; }
    if (r.status === 401 || r.status === 403) return { ok: false, erreur: "Le jeton Trello ne permet pas d'écrire : un administrateur doit le remplacer par un jeton « lecture et écriture » (Vercel, TRELLO_TOKEN)." };
    if (!r.ok) return { ok: false, erreur: `Trello a refusé le déplacement (erreur ${r.status}).` };
    return { ok: true };
  }
}

const pause = (essai: number) => new Promise((ok) => setTimeout(ok, 1500 * (essai + 1)));

/** Télécharge une pièce jointe déposée sur une carte (fiche de poste), 4 Mo au plus. */
export async function telechargerPieceJointe(carteId: string, pieceId: string, nom: string): Promise<Buffer | null> {
  const r = await fetch(`${BASE}/cards/${carteId}/attachments/${pieceId}/download/${encodeURIComponent(nom)}`, { headers: entete(), cache: "no-store" });
  if (!r.ok) return null;
  const contenu = Buffer.from(await r.arrayBuffer());
  return contenu.length <= 4 * 1024 * 1024 ? contenu : null;
}

export interface ListeTrello { id: string; name: string; closed: boolean }
export interface PieceJointeTrello { id: string; name: string; mimeType: string | null; bytes: number | null; isUpload: boolean; date: string }
export interface CarteTrello {
  id: string; name: string; desc: string; idList: string; closed: boolean; shortUrl: string; dateLastActivity: string;
  attachments?: PieceJointeTrello[];
}
