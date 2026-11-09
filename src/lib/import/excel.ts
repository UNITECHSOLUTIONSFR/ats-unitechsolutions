/**
 * Import du fichier Excel de suivi (lu une seule fois, depuis une copie .xlsx).
 * Ce module ne touche à aucune base : il lit, normalise, dédoublonne et produit un rapport.
 * L'écriture en base se fait ensuite, après lecture du rapport.
 */
import ExcelJS from "exceljs";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { calculerTrigramme } from "@/lib/metier/trigramme";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { sansAccents } from "@/lib/metier/texte";

export type ChampFiche =
  | "prenom"
  | "nom"
  | "nom_complet"
  | "email"
  | "telephone"
  | "trigramme"
  | "disponibilite"
  | "intitule_poste"
  | "localisation"
  | "notes"
  | "statut"
  | "date_maj"
  | "experience"
  | "tjm_salaire"
  | "linkedin"
  | "cv_lien"
  | "email_2"
  | "commentaire_email";

/** Intitulés de colonnes reconnus automatiquement (comparés sans accents ni majuscules). */
const SYNONYMES_COLONNES: Record<ChampFiche, string[]> = {
  prenom: ["prenom", "prenoms", "first name", "firstname"],
  nom: ["nom", "nom de famille", "last name", "lastname"],
  nom_complet: ["nom complet", "nom prenom", "prenom nom", "consultant", "candidat", "nom et prenom"],
  email: ["email", "e-mail", "mail", "adresse mail", "adresse email", "courriel"],
  telephone: ["telephone", "tel", "tel.", "portable", "mobile", "gsm", "numero", "numero de telephone"],
  trigramme: ["trigramme", "trigram", "tri"],
  disponibilite: ["disponibilite", "dispo", "date de disponibilite", "disponible le"],
  intitule_poste: ["intitule de poste", "poste", "fonction", "titre", "intitule", "profil", "metier"],
  localisation: ["localisation", "ville", "lieu", "region", "mobilite"],
  notes: ["notes", "commentaire", "commentaires", "remarque", "remarques", "observations"],
  statut: ["statut", "etat"],
  date_maj: ["date de mise a jour", "mise a jour", "date maj", "derniere mise a jour"],
  experience: ["experience", "experiences", "annees d'experience", "annees experience", "exp", "exp."],
  tjm_salaire: ["tjm / salaire", "tjm/salaire", "tjm", "salaire", "pretentions", "tjm salaire"],
  linkedin: ["linkedin", "profil linkedin", "lien linkedin"],
  cv_lien: ["cv", "lien cv", "lien du cv"],
  email_2: ["email 2", "email2", "deuxieme email", "autre email"],
  commentaire_email: ["commentaire email"],
};

const cle = (s: string) => sansAccents(s).toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/** Pour l'onglet principal : quel champ de la fiche consultant correspond à chaque en-tête affiché. */
export function champsParEntete(entetesOriginaux: string[], entetesAffiches: string[]): Record<string, ChampFiche> {
  const { correspondance } = detecterColonnes(entetesOriginaux);
  const r: Record<string, ChampFiche> = {};
  for (const [champ, i] of Object.entries(correspondance)) r[entetesAffiches[i as number]] = champ as ChampFiche;
  return r;
}

export type CorrespondanceColonnes = Partial<Record<ChampFiche, number>>; // champ -> index de colonne

export function detecterColonnes(entetes: string[]): {
  correspondance: CorrespondanceColonnes;
  nonReconnues: string[];
} {
  const correspondance: CorrespondanceColonnes = {};
  const nonReconnues: string[] = [];
  entetes.forEach((entete, i) => {
    const c = cle(entete);
    if (!c) return;
    const champ = (Object.keys(SYNONYMES_COLONNES) as ChampFiche[]).find(
      (f) => correspondance[f] === undefined && SYNONYMES_COLONNES[f].includes(c),
    );
    if (champ) correspondance[champ] = i;
    else nonReconnues.push(entete);
  });
  return { correspondance, nonReconnues };
}

export type Cellule = string | number | Date | null;

export interface OngletLu {
  nom: string;
  entetes: string[];
  lignes: Cellule[][];
  /** Numéro de ligne Excel de chaque ligne de données. */
  numeros: number[];
}

/** Lit TOUS les onglets d'un classeur : dans chacun, la première ligne non vide sert d'en-têtes. */
/** Colonnes ajoutées au tableau quand la case email contenait plusieurs informations. */
export const COLONNE_EMAIL_2 = "Email 2";
export const COLONNE_COMMENTAIRE_EMAIL = "Commentaire email";

const MOTIF_EMAIL = /[^\s@,;:<>()"'\[\]]+@[^\s@,;:<>()"'\[\]]+\.[a-z]{2,}/gi;

/**
 * Nettoie une case « Email » (consigne de l'utilisatrice) :
 * « Â » mis pour « @ » corrigé ; deux adresses séparées ; mention LinkedIn déplacée ; reste en commentaire libre.
 */
export function analyserCaseEmail(brut: string): { email: string | null; email2: string | null; linkedin: string | null; commentaire: string | null } {
  const corrige = brut.replace(/\s*Â\s*/g, "@");
  const emails = [...corrige.matchAll(MOTIF_EMAIL)].map((m) => m[0].replace(/[.]+$/, "").toLowerCase());
  let reste = corrige;
  for (const e of corrige.matchAll(MOTIF_EMAIL)) reste = reste.replace(e[0], " ");
  reste = reste.replace(/^[\s,;:/|\-]+|[\s,;:/|\-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  let linkedin: string | null = null;
  const url = reste.match(/(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/\S+/i);
  if (url) {
    linkedin = url[0];
    reste = reste.replace(url[0], "").trim();
  } else if (/linked\s*-?\s*in/i.test(reste)) {
    linkedin = reste;
    reste = "";
  }
  reste = reste.replace(/^[\s,;:/|\-]+|[\s,;:/|\-]+$/g, "").trim();
  return { email: emails[0] ?? null, email2: emails[1] ?? null, linkedin, commentaire: reste || null };
}

/**
 * Applique le nettoyage des emails à l'onglet principal, AVANT l'import des fiches et du tableau
 * (les deux voient donc les mêmes valeurs). Ajoute les colonnes « Email 2 » et « Commentaire email » si besoin.
 */
export function corrigerOngletPrincipal(o: OngletLu): OngletLu {
  const { correspondance } = detecterColonnes(o.entetes);
  const iEmail = correspondance.email;
  if (iEmail === undefined) return o;
  const iLinkedin = correspondance.linkedin;
  const entetes = [...o.entetes];
  let iEmail2 = entetes.findIndex((e) => cle(e) === cle(COLONNE_EMAIL_2));
  let iCommentaire = entetes.findIndex((e) => cle(e) === cle(COLONNE_COMMENTAIRE_EMAIL));
  const lignes = o.lignes.map((l) => {
    const v = l[iEmail];
    if (typeof v !== "string" || normaliserEmail(v)) return l;
    const a = analyserCaseEmail(v);
    // Rien d'identifiable : tout part en commentaire et la case email est vidée.
    const n = [...l];
    n[iEmail] = a.email;
    if (a.email2) {
      if (iEmail2 < 0) { iEmail2 = entetes.length; entetes.push(COLONNE_EMAIL_2); }
      n[iEmail2] = a.email2;
    }
    if (a.linkedin) {
      if (iLinkedin !== undefined && !String(n[iLinkedin] ?? "").trim()) n[iLinkedin] = a.linkedin;
      else a.commentaire = [a.commentaire, a.linkedin].filter(Boolean).join(" ");
    }
    if (a.commentaire) {
      if (iCommentaire < 0) { iCommentaire = entetes.length; entetes.push(COLONNE_COMMENTAIRE_EMAIL); }
      n[iCommentaire] = a.commentaire;
    }
    return n;
  });
  return { ...o, entetes, lignes: lignes.map((l) => Array.from({ length: entetes.length }, (_, i) => l[i] ?? null)) };
}

export async function lireOnglets(contenu: ArrayBuffer | Uint8Array): Promise<OngletLu[]> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as ArrayBuffer);
  return classeur.worksheets.map((feuille) => {
    const toutes: { numero: number; valeurs: Cellule[] }[] = [];
    feuille.eachRow({ includeEmpty: false }, (ligne, numero) => {
      const valeurs: Cellule[] = [];
      for (let c = 1; c <= feuille.columnCount; c++) valeurs.push(valeurCellule(ligne.getCell(c).value));
      toutes.push({ numero, valeurs });
    });
    const [tete, ...corps] = toutes;
    let entetes = (tete?.valeurs ?? []).map((e) => (e === null ? "" : String(e)));
    // On retire les colonnes de fin sans en-tête et sans aucune valeur.
    let fin = entetes.length;
    while (fin > 0 && !entetes[fin - 1].trim() && corps.every((l) => l.valeurs[fin - 1] === null)) fin--;
    entetes = entetes.slice(0, fin);
    return {
      nom: feuille.name,
      entetes,
      lignes: corps.map((l) => l.valeurs.slice(0, fin)),
      numeros: corps.map((l) => l.numero),
    };
  });
}

/** Lit la première feuille d'un classeur : la première ligne non vide sert d'en-têtes. */
export async function lireClasseur(contenu: ArrayBuffer | Uint8Array): Promise<{ entetes: string[]; lignes: Cellule[][] }> {
  const [premier] = await lireOnglets(contenu);
  return premier ? { entetes: premier.entetes, lignes: premier.lignes } : { entetes: [], lignes: [] };
}

/** En-têtes uniques et jamais vides (« Colonne 5 » si vide, « Nom (2) » si répété). */
export function entetesUniques(entetes: string[]): string[] {
  const vus = new Map<string, number>();
  return entetes.map((e, j) => {
    const base = e.trim() || `Colonne ${j + 1}`;
    const n = (vus.get(base) ?? 0) + 1;
    vus.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

/** Valeur telle qu'affichée dans l'Excel (dates au format JJ/MM/AAAA). */
export function valeurAffichee(v: Cellule | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const j = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${j}/${m}/${v.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}

function valeurCellule(v: ExcelJS.CellValue): Cellule {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // lien hypertexte
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return valeurCellule(v.result as ExcelJS.CellValue); // formule
  }
  return String(v);
}

export interface FicheImport {
  ligne: number; // numéro de ligne Excel (pour le rapport)
  prenom: string;
  nom: string;
  trigramme: string;
  email: string | null;
  telephone_e164: string | null;
  telephone_brut: string | null;
  intitule_poste: string | null;
  disponibilite: string | null;
  disponible_le: string | null; // AAAA-MM-JJ
  localisation: string | null;
  notes: string | null;
  statut_texte: string | null;
  date_maj: string | null; // AAAA-MM-JJ, date de mise à jour de la ligne dans l'Excel
  experience: string | null;
  tjm_salaire: string | null;
  linkedin: string | null;
  cv_lien: string | null;
  email_2: string | null;
  commentaire_email: string | null;
  /** Toutes les lignes Excel d'origine de cette personne (plusieurs si doublons fusionnés), toutes colonnes. */
  donnees_excel: { ligne: number; valeurs: Record<string, string> }[];
}

export interface RapportImport {
  lignesLues: number;
  fichesRetenues: number;
  rejets: { ligne: number; raison: string; valeurs: Record<string, string> }[];
  telephonesCorriges: { ligne: number; avant: string; apres: string }[];
  telephonesInvalides: { ligne: number; valeur: string }[];
  emailsInvalides: { ligne: number; valeur: string }[];
  doublonsFusionnes: { lignes: number[]; cle: string }[];
  doublonsPossibles: { lignes: number[]; nom: string }[];
  trigrammesDifferents: { ligne: number; excel: string; calcule: string }[];
  colonnesNonReconnues: string[];
}

const texte = (v: Cellule | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
  return s === "" ? null : s;
};

function separerNomComplet(valeur: string): { prenom: string; nom: string } {
  const mots = valeur.trim().split(/\s+/);
  if (mots.length === 1) return { prenom: "", nom: mots[0] };
  // Convention fréquente « NOM Prénom » : le nom est en majuscules
  const majuscules = mots.filter((m) => m.length > 1 && m === m.toUpperCase());
  if (majuscules.length && majuscules.length < mots.length) {
    return { nom: majuscules.join(" "), prenom: mots.filter((m) => !majuscules.includes(m)).join(" ") };
  }
  return { prenom: mots[0], nom: mots.slice(1).join(" ") };
}

/** Transforme les lignes Excel en fiches normalisées et dédoublonnées, avec le rapport d'anomalies. */
export function preparerImport(
  entetes: string[],
  lignes: Cellule[][],
  correspondanceForcee?: CorrespondanceColonnes,
): { fiches: FicheImport[]; rapport: RapportImport } {
  const { correspondance: auto, nonReconnues } = detecterColonnes(entetes);
  const col = correspondanceForcee ?? auto;
  const lire = (l: Cellule[], champ: ChampFiche) => (col[champ] === undefined ? null : l[col[champ]!] ?? null);

  const rapport: RapportImport = {
    lignesLues: lignes.length,
    fichesRetenues: 0,
    rejets: [],
    telephonesCorriges: [],
    telephonesInvalides: [],
    emailsInvalides: [],
    doublonsFusionnes: [],
    doublonsPossibles: [],
    trigrammesDifferents: [],
    colonnesNonReconnues: correspondanceForcee ? [] : nonReconnues,
  };

  const fiches: FicheImport[] = [];
  lignes.forEach((l, i) => {
    const ligne = i + 2; // ligne 1 = en-têtes
    if (l.every((c) => texte(c) === null)) return;

    let prenom = texte(lire(l, "prenom")) ?? "";
    let nom = texte(lire(l, "nom")) ?? "";
    const complet = texte(lire(l, "nom_complet"));
    if (!prenom && !nom && complet) ({ prenom, nom } = separerNomComplet(complet));
    const valeurs: Record<string, string> = {};
    entetes.forEach((e, j) => {
      const t = texte(l[j]);
      if (t !== null) valeurs[e || `Colonne ${j + 1}`] = t;
    });
    if (!nom) {
      // Consigne : on importe quand même, avec une alerte « nom manquant » (voir ecriture.ts).
      rapport.rejets.push({ ligne, raison: "nom manquant (importée avec alerte)", valeurs });
    }

    const emailBrut = texte(lire(l, "email"));
    const email = normaliserEmail(emailBrut);
    if (emailBrut && !email) rapport.emailsInvalides.push({ ligne, valeur: emailBrut });

    const tel = normaliserTelephone(lire(l, "telephone"));
    if (tel.statut === "corrige") rapport.telephonesCorriges.push({ ligne, avant: tel.brut, apres: tel.e164! });
    if (tel.statut === "invalide") rapport.telephonesInvalides.push({ ligne, valeur: tel.brut });

    const calcule = calculerTrigramme(prenom, nom);
    const trigrammeExcel = texte(lire(l, "trigramme"))?.toUpperCase() ?? null;
    if (trigrammeExcel && trigrammeExcel !== calcule) {
      rapport.trigrammesDifferents.push({ ligne, excel: trigrammeExcel, calcule });
    }

    const dispo = lire(l, "disponibilite");
    fiches.push({
      ligne,
      prenom,
      nom,
      trigramme: trigrammeExcel ?? calcule, // on garde le trigramme existant (décision D6)
      email,
      telephone_e164: tel.e164,
      telephone_brut: tel.statut === "invalide" ? tel.brut : null,
      intitule_poste: texte(lire(l, "intitule_poste")),
      disponibilite: dispo instanceof Date ? null : texte(dispo),
      disponible_le: dispo instanceof Date ? dispo.toISOString().slice(0, 10) : null,
      localisation: texte(lire(l, "localisation")),
      notes: texte(lire(l, "notes")),
      statut_texte: texte(lire(l, "statut")),
      experience: texte(lire(l, "experience")),
      tjm_salaire: texte(lire(l, "tjm_salaire")),
      linkedin: texte(lire(l, "linkedin")),
      cv_lien: texte(lire(l, "cv_lien")),
      email_2: normaliserEmail(texte(lire(l, "email_2"))),
      commentaire_email: texte(lire(l, "commentaire_email")),
      donnees_excel: [{ ligne, valeurs }],
      date_maj: (() => { const v = lire(l, "date_maj"); return v instanceof Date ? v.toISOString().slice(0, 10) : null; })(),
    });
  });

  // Dédoublonnage dans le fichier : email, puis téléphone. La ligne la plus basse complète la plus haute.
  const retenues: FicheImport[] = [];
  const parCle = new Map<string, FicheImport>();
  for (const f of fiches) {
    const cles = [f.email && `email:${f.email}`, f.telephone_e164 && `tel:${f.telephone_e164}`].filter(Boolean) as string[];
    const existante = cles.map((c) => parCle.get(c)).find(Boolean);
    if (existante) {
      fusionner(existante, f);
      rapport.doublonsFusionnes.push({ lignes: [existante.ligne, f.ligne], cle: cles[0] });
      cles.forEach((c) => parCle.set(c, existante));
    } else {
      retenues.push(f);
      cles.forEach((c) => parCle.set(c, f));
    }
  }

  // Même nom, coordonnées différentes : doublon possible, à vérifier à la main.
  const parNom = new Map<string, FicheImport[]>();
  for (const f of retenues) {
    const n = cle(`${f.prenom} ${f.nom}`);
    parNom.set(n, [...(parNom.get(n) ?? []), f]);
  }
  for (const [n, groupe] of parNom) {
    if (groupe.length > 1) rapport.doublonsPossibles.push({ lignes: groupe.map((g) => g.ligne), nom: n });
  }

  rapport.fichesRetenues = retenues.length;
  return { fiches: retenues, rapport };
}

function fusionner(cible: FicheImport, source: FicheImport) {
  for (const k of Object.keys(source) as (keyof FicheImport)[]) {
    if (k === "ligne") continue;
    if (k === "donnees_excel") {
      cible.donnees_excel.push(...source.donnees_excel);
      continue;
    }
    if ((cible[k] === null || cible[k] === "") && source[k] !== null && source[k] !== "") {
      (cible as unknown as Record<string, unknown>)[k] = source[k];
    }
  }
}
