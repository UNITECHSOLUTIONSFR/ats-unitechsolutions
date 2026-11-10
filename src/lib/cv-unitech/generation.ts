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

interface Style { gras?: boolean; bleu?: boolean; italique?: boolean }

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
  const contenu = segments.filter((s) => s.texte).map((s) => `<w:r>${rPr(s.style)}<w:t xml:space="preserve">${echapper(s.texte)}</w:t></w:r>`).join("");
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
    for (const e of cv.experiences) {
      out.push(paragraphe(b[B.expTitre], [{ texte: e.entreprise, style: { gras: true, bleu: true } }, { texte: ` – ${e.poste}`, style: { gras: true } }]));
      if (e.periode) out.push(paragraphe(b[B.expDates], [{ texte: e.periode, style: { italique: true } }]));
      out.push(b[B.expVide]);
      if (e.projet) out.push(paragraphe(b[B.expProjet], [{ texte: "Projet", style: { gras: true, bleu: true } }, { texte: " : ", style: { gras: true } }, { texte: e.projet }]), b[B.expVide2]);
      if (e.missions.length) {
        out.push(paragraphe(b[B.expDetail], [{ texte: "Détail de la mission", style: { gras: true, bleu: true } }]));
        for (const m of e.missions) out.push(paragraphe(b[B.expPuce], [{ texte: m }]));
        out.push(b[B.expVide3]);
      }
      if (e.environnement) out.push(paragraphe(b[B.expEnvironnement], [{ texte: "Environnement", style: { gras: true, bleu: true } }, { texte: ` : ${e.environnement}` }]));
      out.push(b[B.expFin1], b[B.expFin2]);
    }
  }
  out.push(b[B.section]);
  zip.file("word/document.xml", debut + out.join("") + fin);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
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
