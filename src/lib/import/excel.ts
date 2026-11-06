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
  | "statut";

/** Intitulés de colonnes reconnus automatiquement (comparés sans accents ni majuscules). */
const SYNONYMES_COLONNES: Record<ChampFiche, string[]> = {
  prenom: ["prenom", "first name", "firstname"],
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
};

const cle = (s: string) => sansAccents(s).toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

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

/** Lit la première feuille d'un classeur : la première ligne non vide sert d'en-têtes. */
export async function lireClasseur(contenu: ArrayBuffer | Uint8Array): Promise<{ entetes: string[]; lignes: Cellule[][] }> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(contenu as ArrayBuffer);
  const feuille = classeur.worksheets[0];
  if (!feuille) return { entetes: [], lignes: [] };
  const toutes: Cellule[][] = [];
  feuille.eachRow({ includeEmpty: false }, (ligne) => {
    const valeurs: Cellule[] = [];
    for (let c = 1; c <= feuille.columnCount; c++) valeurs.push(valeurCellule(ligne.getCell(c).value));
    toutes.push(valeurs);
  });
  const [entetes = [], ...lignes] = toutes;
  return { entetes: entetes.map((e) => (e === null ? "" : String(e))), lignes };
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
}

export interface RapportImport {
  lignesLues: number;
  fichesRetenues: number;
  rejets: { ligne: number; raison: string }[];
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
    if (!nom) {
      rapport.rejets.push({ ligne, raison: "nom manquant" });
      return;
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
    if ((cible[k] === null || cible[k] === "") && source[k] !== null && source[k] !== "") {
      (cible as unknown as Record<string, unknown>)[k] = source[k];
    }
  }
}
