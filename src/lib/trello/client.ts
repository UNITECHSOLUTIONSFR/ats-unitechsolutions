import "server-only";

/**
 * Accès à Trello en LECTURE SEULE (jeton créé avec scope=read). Aucune fonction d'écriture n'existe dans l'outil.
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
  const r = await fetch(`${BASE}${chemin}`, { headers: entete(), cache: "no-store" });
  if (!r.ok) throw new Error(`Trello ${r.status} sur ${chemin.split("?")[0]}`);
  return (await r.json()) as T;
}

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
