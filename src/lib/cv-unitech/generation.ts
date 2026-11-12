/**
 * CV au format Unitech : le gabarit Word (src/lib/cv-unitech/gabarit-unitech.docx, tiré d'un vrai CV Unitech et vidé
 * de toute donnée personnelle) garde polices, couleurs, bandeau, logo, en-tête et pied de page ; on remplit ses blocs.
 * Le même document sert au Word nominatif et au PDF anonymisé : il ne contient que le trigramme, jamais le nom ni les coordonnées.
 */
import JSZip from "jszip";

export interface CVUnitech {
  trigramme: string;
  titre: string;                      // ex. « TECH LEAD JAVA »
  annees_experience: number | null;
  adequation: { section: string; resume: string; points: { libelle: string; detail: string }[] };
  competences_metier: { domaine: string; points: string[] }[];
  outils: { categorie: string; elements: string }[];
  langues: { langue: string; niveau: string }[];
  formations: { annee: string | null; intitule: string; etablissement: string | null }[];
  experiences: { entreprise: string; poste: string; periode: string; projet: string | null; missions: string[]; environnement: string | null }[];
}

// Ordre des blocs du gabarit (voir la construction du gabarit dans SUIVI.md).
const B = {
  bandeau: 0, vide: 1, rubriqueAdequation: 2, videTexte: 3, texte: 4, videApresTexte: 5, puceLibelle: 6,
  rubriqueCompetences: 7, sousTitre: 8, puce: 9, videGras: 10, rubriqueOutils: 11, outil: 12, videOutil: 13,
  rubriqueLangues: 14, videLangues: 15, langue: 16, rubriqueFormation: 17, formation: 18, rubriqueExperiences: 19,
  videExp: 20, expTitre: 21, expDates: 22, expVide: 23, expProjet: 24, expVide2: 25, expDetail: 26, expPuce: 27,
  expVide3: 28, expEnvironnement: 29, expFin1: 30, expFin2: 31, section: 32,
} as const;

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Découpe le corps du document en blocs de premier niveau (paragraphes, tableaux, propriétés de section). */
export function blocsDuCorps(xml: string): { debut: string; blocs: string[]; fin: string } {
  const i = xml.indexOf("<w:body>") + 8, j = xml.lastIndexOf("</w:body>");
  const corps = xml.slice(i, j);
  const blocs: string[] = [];
  const ouverture = /<(w:p|w:tbl|w:sectPr)[ >]/g;
  let pos = 0;
  for (;;) {
    ouverture.lastIndex = pos;
    const m = ouverture.exec(corps);
    if (!m) break;
    const balise = m[1];
    const re = new RegExp(`<(/?)${balise}([ >/])`, "g");
    re.lastIndex = m.index;
    let profondeur = 0, fin = m.index;
    for (;;) {
      const n = re.exec(corps);
      if (!n) break;
      if (n[1] === "/") profondeur--;
      else if (corps[corps.indexOf(">", n.index) - 1] !== "/") profondeur++;
      if (profondeur === 0) { fin = corps.indexOf(">", n.index) + 1; break; }
    }
    blocs.push(corps.slice(m.index, fin));
    pos = fin;
  }
  return { debut: xml.slice(0, i), blocs, fin: xml.slice(j) };
}

interface Style { gras?: boolean; bleu?: boolean; italique?: boolean; surligne?: boolean }

/** Surlignage jaune Word (note « À compléter » pour l'équipe). */
function surligner(rPr: string): string {
  const marque = '<w:highlight w:val="yellow"/>';
  return rPr ? rPr.replace("</w:rPr>", `${marque}</w:rPr>`) : `<w:rPr>${marque}</w:rPr>`;
}

/** Nouveau paragraphe sur le modèle d'un bloc : même mise en page, mêmes puces, mises en forme de texte reprises du bloc. */
export function paragraphe(modele: string, segments: { texte: string; style?: Style }[]): string {
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(modele)?.[0] ?? "";
  const runs = modele.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [];
  // « <w:t » seul attrape aussi <w:tab/> : un vrai texte est <w:t> ou <w:t xml:space…>.
  const aDuTexte = (r: string) => /<w:t[ >]/.test(r);
  // Puce losange du modèle : caractère de la police Wingdings, repris tel quel devant le texte.
  const prefixe = runs.filter((r) => r.includes("Wingdings")).slice(0, 2).join("");
  const avecTexte = runs.filter((r) => aDuTexte(r) && !r.includes("Wingdings"));
  const rPr = (s: Style = {}) => {
    const candidats = avecTexte.map((r) => /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(r)?.[0] ?? "");
    const ok = (x: string) => /<w:b\/>/.test(x) === !!s.gras && /5B9BD5|1189D0/.test(x) === !!s.bleu;
    return candidats.find(ok) ?? candidats.find((x) => /<w:b\/>/.test(x) === !!s.gras) ?? candidats[0] ?? "";
  };
  const contenu = segments.filter((s) => s.texte).map((s) => `<w:r>${s.style?.surligne ? surligner(rPr(s.style)) : rPr(s.style)}<w:t xml:space="preserve">${echapper(s.texte)}</w:t></w:r>`).join("");
  return `<w:p>${pPr}${prefixe}${contenu}</w:p>`;
}

/** Remplace le texte des paragraphes d'une forme (bandeau, titre de rubrique) qui contiennent un marqueur. */
function remplirForme(modele: string, valeurs: Record<string, string>): string {
  let s = modele;
  for (const [k, v] of Object.entries(valeurs)) s = s.split(`{{${k}}}`).join(echapper(v));
  return s;
}

export async function genererDocx(gabarit: Buffer | Uint8Array, cv: CVUnitech): Promise<Buffer> {
  const zip = await JSZip.loadAsync(gabarit);
  const xml = await zip.file("word/document.xml")!.async("string");
  const { debut, blocs: b, fin } = blocsDuCorps(xml);
  const out: string[] = [];
  const annees = cv.annees_experience ? `+ ${Math.round(cv.annees_experience)} ans d’expérience` : "";
  // Le bandeau est une forme posée sur la page : trois lignes vides le séparent de la suite, comme dans le modèle.
  out.push(remplirForme(b[B.bandeau], { TRIGRAMME: cv.trigramme, TITRE: cv.titre.toUpperCase(), ANNEES: annees }), b[B.vide], b[B.vide], b[B.vide]);

  // Adéquation à la mission (ou profil général)
  out.push(remplirForme(b[B.rubriqueAdequation], { SECTION: cv.adequation.section.toUpperCase() }), b[B.videTexte]);
  if (cv.adequation.resume) out.push(paragraphe(b[B.texte], [{ texte: cv.adequation.resume }]), b[B.videApresTexte]);
  for (const p of cv.adequation.points) out.push(paragraphe(b[B.puceLibelle], [{ texte: p.libelle, style: { gras: true } }, { texte: ` : ${p.detail}` }]));

  if (cv.competences_metier.length) {
    out.push(b[B.rubriqueCompetences]);
    for (const d of cv.competences_metier) {
      out.push(paragraphe(b[B.sousTitre], [{ texte: d.domaine, style: { gras: true, bleu: true } }]));
      for (const p of d.points) out.push(paragraphe(b[B.puce], [{ texte: p }]));
      out.push(b[B.videGras]);
    }
  }
  if (cv.outils.length) {
    out.push(b[B.rubriqueOutils]);
    for (const o of cv.outils) out.push(paragraphe(b[B.outil], [{ texte: o.categorie, style: { gras: true, bleu: true } }, { texte: ` : ${o.elements}` }]), b[B.videOutil]);
  }
  if (cv.langues.length) {
    out.push(b[B.rubriqueLangues], b[B.videLangues]);
    for (const l of cv.langues) out.push(paragraphe(b[B.langue], [{ texte: `${l.langue} : ${l.niveau}` }]));
  }
  if (cv.formations.length) {
    out.push(b[B.rubriqueFormation]);
    for (const f of cv.formations) {
      out.push(paragraphe(b[B.formation], [
        ...(f.annee ? [{ texte: f.annee, style: { gras: true, bleu: true } }] : []),
        { texte: `${f.annee ? " : " : ""}${f.intitule}${f.etablissement ? " – " : ""}` },
        ...(f.etablissement ? [{ texte: f.etablissement, style: { gras: true } }] : []),
      ]));
    }
  }
  if (cv.experiences.length) {
    out.push(b[B.rubriqueExperiences], b[B.videExp]);
    // Chaque mission garde toutes ses rubriques ; une information absente du CV devient une note surlignée en jaune « À compléter ».
    const aCompleter = (quoi: string) => ({ texte: `À compléter : ${quoi}`, style: { surligne: true } });
    for (const e of cv.experiences) {
      const periode = e.periode?.trim();
      const duree = periode ? dureeDepuisPeriode(periode) : null;
      out.push(paragraphe(b[B.expTitre], [{ texte: e.entreprise || "Entreprise", style: { gras: true, bleu: true } }, ...(e.poste ? [{ texte: ` – ${e.poste}`, style: { gras: true } }] : [{ texte: " – " }, aCompleter("intitulé du poste")])]));
      out.push(paragraphe(b[B.expDates], periode
        ? [{ texte: `${periode}${duree ? ` (${duree})` : ""}`, style: { italique: true } }]
        : [aCompleter("dates et durée de la mission")]));
      out.push(b[B.expVide]);
      out.push(paragraphe(b[B.expProjet], [{ texte: "Projet / Contexte", style: { gras: true, bleu: true } }, { texte: " : ", style: { gras: true } },
        e.projet?.trim() ? { texte: e.projet.trim() } : aCompleter("contexte du projet, enjeux et rôle du consultant")]), b[B.expVide2]);
      out.push(paragraphe(b[B.expDetail], [{ texte: "Détail des tâches", style: { gras: true, bleu: true } }]));
      const taches = e.missions.filter((m) => m.trim());
      if (taches.length) for (const m of taches) out.push(paragraphe(b[B.expPuce], [{ texte: m }]));
      else out.push(paragraphe(b[B.expPuce], [aCompleter("tâches réalisées pendant la mission")]));
      out.push(b[B.expVide3]);
      out.push(paragraphe(b[B.expEnvironnement], [{ texte: "Environnement technique", style: { gras: true, bleu: true } }, { texte: " : " },
        e.environnement?.trim() ? { texte: e.environnement.trim() } : aCompleter("outils et technologies utilisés")]));
      out.push(b[B.expFin1], b[B.expFin2]);
    }
  }
  out.push(b[B.section]);
  zip.file("word/document.xml", debut + out.join("") + fin);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

const MOIS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  janv: 1, fev: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Durée lisible d'une période « Janvier 2024 – Juin 2026 », « 03/2021 - aujourd'hui », « 2019 – 2021 » : « 2 ans 5 mois ».
 * Null si la période ne se lit pas (la période reste affichée telle quelle).
 */
export function dureeDepuisPeriode(periode: string, aujourdhui = new Date()): string | null {
  const t = periode.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Séparateurs : tiret, « à », « au », « jusqu'à » (accents déjà retirés), suivis d'une date ou de « aujourd'hui ».
  const parties = t.split(/(?:\s*(?:–|—|-|>)\s*|\s+(?:a|au|jusqu'a|jusqu’a)\s+)(?=[a-z]*\.?\s*\d|aujourd|present|actuel|ce jour|en cours)/);
  if (parties.length < 2) return null;
  const lire = (x: string, fin: boolean): [number, number] | null => {
    if (/aujourd|present|actuel|ce jour|en cours/.test(x)) return [aujourdhui.getFullYear(), aujourdhui.getMonth() + 1];
    const a = /(19|20)\d{2}/.exec(x)?.[0];
    if (!a) return null;
    const mNum = /(\d{1,2})\s*\/\s*(19|20)\d{2}/.exec(x)?.[1];
    const mNom = Object.entries(MOIS).find(([k]) => new RegExp(`\\b${k}`).test(x))?.[1];
    return [Number(a), Number(mNum ?? mNom ?? (fin ? 12 : 1))];
  };
  const debut = lire(parties[0], false), fin = lire(parties[parties.length - 1], true);
  if (!debut || !fin) return null;
  const mois = (fin[0] - debut[0]) * 12 + (fin[1] - debut[1]) + 1;
  if (mois <= 0 || mois > 600) return null;
  const ans = Math.floor(mois / 12), reste = mois % 12;
  return [ans ? `${ans} an${ans > 1 ? "s" : ""}` : "", reste ? `${reste} mois` : ""].filter(Boolean).join(" ");
}

/** Noms des fichiers selon la convention Unitech. */
export function nomsFichiers(prenom: string, nom: string, trigramme: string, titre: string, suffixe?: string) {
  const propre = (t: string) => t.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim();
  const fin = `${propre(titre)}${suffixe ? ` - ${propre(suffixe)}` : ""}`;
  return {
    word: `UNITECH SOLUTIONS - CV ${propre(`${prenom} ${nom}`)} - ${fin}.docx`,
    pdf: `UNITECH SOLUTIONS - CV ${propre(trigramme)} - ${fin}.pdf`,
  };
}
