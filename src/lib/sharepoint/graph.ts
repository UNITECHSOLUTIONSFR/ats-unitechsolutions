import { SHAREPOINT } from "./config";

/**
 * Accès Microsoft Graph en LECTURE SEULE (V1) : aucune fonction d'écriture n'existe dans ce module.
 * Jeton « application » (client_credentials), permission Sites.Selected limitée au site Recrutement.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface ElementDrive {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  parentReference?: { driveId?: string; id?: string; path?: string };
  file?: { mimeType?: string; hashes?: Record<string, string> };
  folder?: { childCount?: number };
  deleted?: { state?: string };
}

let jetonEnCache: { valeur: string; expireA: number } | null = null;

/** Jeton Graph : client_id et client_secret envoyés dans le corps (Microsoft ignore l'authentification Basic). */
export async function obtenirJeton(fetchFn: typeof fetch = fetch): Promise<string> {
  if (jetonEnCache && jetonEnCache.expireA > Date.now() + 60_000) return jetonEnCache.valeur;
  const secret = process.env.MS_CLIENT_SECRET;
  if (!secret) throw new Error("Variable MS_CLIENT_SECRET absente : impossible de se connecter à SharePoint.");
  const corps = new URLSearchParams({
    client_id: SHAREPOINT.clientId,
    client_secret: secret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetchFn(`https://login.microsoftonline.com/${SHAREPOINT.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corps,
  });
  const d = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !d.access_token) throw new Error(`Connexion Microsoft refusée (${d.error ?? r.status}).`);
  jetonEnCache = { valeur: d.access_token, expireA: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return d.access_token;
}

/** Appel Graph en écriture (PATCH / POST). Utilisé uniquement pour ajouter des lignes au fichier Excel de suivi. */
export async function graphEnvoyer<T>(methode: "PATCH" | "POST", chemin: string, corps: unknown, fetchFn: typeof fetch = fetch): Promise<T> {
  const jeton = await obtenirJeton(fetchFn);
  const r = await fetchFn(`${GRAPH}/${chemin.replace(/^\//, "")}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  if (!r.ok) throw new Error(`Graph ${r.status} sur ${chemin} : ${(await r.text()).slice(0, 300)}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

/**
 * Dépose un fichier dans un dossier SharePoint ; le dossier est créé s'il n'existe pas. Renvoie l'adresse web du fichier.
 * Au-delà de 4 Mo (limite d'un dépôt en une fois), le fichier est envoyé en plusieurs morceaux (session de dépôt Graph).
 */
export async function graphTeleverser(driveId: string, cheminFichier: string, contenu: Buffer, typeContenu: string, fetchFn: typeof fetch = fetch,
  siExiste: "replace" | "rename" = "replace"): Promise<{ id: string; webUrl: string; name: string }> {
  const jeton = await obtenirJeton(fetchFn);
  const chemin = cheminFichier.split("/").map(encodeURIComponent).join("/");
  if (contenu.length > 4 * 1024 * 1024) return televerserEnMorceaux(driveId, chemin, cheminFichier, contenu, jeton, fetchFn, siExiste);
  // « rename » : un fichier existant n'est jamais écrasé (le nouveau reçoit un suffixe).
  const r = await fetchFn(`${GRAPH}/drives/${driveId}/root:/${chemin}:/content?@microsoft.graph.conflictBehavior=${siExiste}`, {
    method: "PUT", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": typeContenu }, body: new Uint8Array(contenu),
  });
  if (!r.ok) throw new Error(`Graph ${r.status} (dépôt de ${cheminFichier}) : ${(await r.text()).slice(0, 300)}`);
  return (await r.json()) as { id: string; webUrl: string; name: string };
}

/** Morceaux de 3,75 Mo (multiple de 320 Kio, comme l'exige Graph). */
const TAILLE_MORCEAU = 12 * 320 * 1024;

async function televerserEnMorceaux(driveId: string, chemin: string, cheminFichier: string, contenu: Buffer, jeton: string,
  fetchFn: typeof fetch, siExiste: "replace" | "rename"): Promise<{ id: string; webUrl: string; name: string }> {
  const s = await fetchFn(`${GRAPH}/drives/${driveId}/root:/${chemin}:/createUploadSession`, {
    method: "POST", headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": siExiste } }),
  });
  if (!s.ok) throw new Error(`Graph ${s.status} (session de dépôt de ${cheminFichier}) : ${(await s.text()).slice(0, 300)}`);
  const { uploadUrl } = (await s.json()) as { uploadUrl: string };
  for (let debut = 0; debut < contenu.length; debut += TAILLE_MORCEAU) {
    const fin = Math.min(debut + TAILLE_MORCEAU, contenu.length);
    // L'adresse de la session porte déjà l'autorisation : pas de jeton dans cet appel (exigence de Graph).
    const r = await fetchFn(uploadUrl, {
      method: "PUT", headers: { "Content-Length": String(fin - debut), "Content-Range": `bytes ${debut}-${fin - 1}/${contenu.length}` },
      body: new Uint8Array(contenu.subarray(debut, fin)),
    });
    if (!r.ok) throw new Error(`Graph ${r.status} (morceau ${debut}-${fin - 1} de ${cheminFichier}) : ${(await r.text()).slice(0, 300)}`);
    if (fin === contenu.length) return (await r.json()) as { id: string; webUrl: string; name: string };
  }
  throw new Error(`Dépôt de ${cheminFichier} inachevé.`);
}

/**
 * Supprime un fichier TEMPORAIRE créé par l'outil pour une conversion en PDF. Refuse tout fichier qui n'est pas dans le
 * dossier des conversions temporaires (aucune autre suppression dans SharePoint).
 */
export async function graphSupprimerTemporaire(driveId: string, itemId: string, dossierAutorise: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const item = await graphGet<{ parentReference?: { path?: string } }>(`drives/${driveId}/items/${itemId}?$select=parentReference`, { fetchFn });
  const parent = decodeURIComponent(item.parentReference?.path ?? "");
  if (!parent.endsWith(`root:/${dossierAutorise}`)) throw new Error("Suppression refusée : fichier hors du dossier des conversions temporaires.");
  const jeton = await obtenirJeton(fetchFn);
  const r = await fetchFn(`${GRAPH}/drives/${driveId}/items/${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${jeton}` } });
  if (!r.ok && r.status !== 404) throw new Error(`Graph ${r.status} (suppression du fichier temporaire)`);
}

/** Appel GET Graph avec reprise automatique en cas de limitation (429/503). */
export async function graphGet<T>(chemin: string, options: { fetchFn?: typeof fetch; brut?: boolean } = {}): Promise<T> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = chemin.startsWith("http") ? chemin : `${GRAPH}/${chemin.replace(/^\//, "")}`;
  for (let essai = 0; ; essai++) {
    const jeton = await obtenirJeton(fetchFn);
    const r = await fetchFn(url, { headers: { Authorization: `Bearer ${jeton}` } });
    if ((r.status === 429 || r.status === 503 || r.status === 504) && essai < 5) {
      const attente = Number(r.headers.get("Retry-After") ?? 2 ** essai) * 1000;
      await new Promise((ok) => setTimeout(ok, Math.min(attente, 30_000)));
      continue;
    }
    if (!r.ok) {
      const texte = await r.text();
      throw new Error(`Graph ${r.status} sur ${url.replace(GRAPH, "")} : ${texte.slice(0, 300)}`);
    }
    return (options.brut ? Buffer.from(await r.arrayBuffer()) : await r.json()) as T;
  }
}

/** Identifiant de la bibliothèque « Documents partagés » du site. */
export async function trouverBibliotheque(fetchFn?: typeof fetch): Promise<string> {
  const d = await graphGet<{ value: { id: string; name: string }[] }>(`sites/${SHAREPOINT.siteId}/drives`, { fetchFn });
  const noms = SHAREPOINT.nomsBibliotheque as readonly string[];
  const b = d.value.find((x) => noms.includes(x.name)) ?? d.value[0];
  if (!b) throw new Error("Aucune bibliothèque de documents trouvée sur le site.");
  return b.id;
}

function encoderChemin(chemin: string): string {
  return chemin.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Enfants directs d'un dossier (pagination gérée). */
export async function listerEnfants(driveId: string, cheminDossier: string, fetchFn?: typeof fetch): Promise<ElementDrive[]> {
  const elements: ElementDrive[] = [];
  let url: string | undefined =
    `drives/${driveId}/root:/${encoderChemin(cheminDossier)}:/children?$top=999` +
    `&$select=id,name,size,webUrl,lastModifiedDateTime,createdDateTime,parentReference,file,folder`;
  while (url) {
    const page: { value: ElementDrive[]; "@odata.nextLink"?: string } = await graphGet(url, { fetchFn });
    elements.push(...page.value);
    url = page["@odata.nextLink"];
  }
  return elements;
}

export interface FichierCV extends ElementDrive {
  /** Chemin relatif au dossier des CV, ex. « Développeur/Unitech Solution, Jean Dupont, Développeur.docx ». */
  cheminRelatif: string;
  /** Premier sous-dossier = métier. */
  metier: string | null;
}

/** Parcourt récursivement le dossier des CV et renvoie tous les fichiers, avec leur métier. */
export async function listerFichiersCV(driveId: string, fetchFn?: typeof fetch): Promise<FichierCV[]> {
  const resultat: FichierCV[] = [];
  const aVisiter: string[] = [""];
  while (aVisiter.length) {
    const rel = aVisiter.shift()!;
    const enfants = await listerEnfants(driveId, [SHAREPOINT.dossierCV, rel].filter(Boolean).join("/"), fetchFn);
    for (const e of enfants) {
      const cheminRelatif = [rel, e.name].filter(Boolean).join("/");
      if (e.folder) aVisiter.push(cheminRelatif);
      else if (e.file) resultat.push({ ...e, cheminRelatif, metier: rel ? rel.split("/")[0] : null });
    }
  }
  return resultat;
}

/**
 * Synchronisation incrémentale (delta) : renvoie les éléments créés, modifiés ou supprimés depuis
 * le lien delta précédent, et le nouveau lien à conserver pour la prochaine nuit.
 * Sans lien précédent, renvoie tout le contenu (premier passage).
 */
export async function lireDelta(
  driveId: string,
  lienPrecedent: string | null,
  fetchFn?: typeof fetch,
): Promise<{ elements: ElementDrive[]; lienDelta: string }> {
  const elements: ElementDrive[] = [];
  let url: string | undefined =
    lienPrecedent ??
    `drives/${driveId}/root:/${encoderChemin(SHAREPOINT.dossierCV)}:/delta` +
      `?$select=id,name,size,webUrl,lastModifiedDateTime,parentReference,file,folder,deleted`;
  let lienDelta = "";
  while (url) {
    const page: { value: ElementDrive[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string } = await graphGet(url, {
      fetchFn,
    });
    elements.push(...page.value);
    url = page["@odata.nextLink"];
    if (page["@odata.deltaLink"]) lienDelta = page["@odata.deltaLink"];
  }
  return { elements, lienDelta };
}

/** Télécharge le contenu d'un fichier (en mémoire, jamais enregistré sur disque ni en base). */
export async function telechargerFichier(driveId: string, itemId: string, fetchFn?: typeof fetch): Promise<Buffer> {
  return graphGet<Buffer>(`drives/${driveId}/items/${itemId}/content`, { fetchFn, brut: true });
}
