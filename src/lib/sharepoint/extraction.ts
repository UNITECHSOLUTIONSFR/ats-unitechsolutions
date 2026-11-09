import { createHash } from "node:crypto";
import { SEUIL_TEXTE_EXTRACTIBLE } from "./config";

/** Empreinte SHA-256 du contenu : sert à ne jamais retraiter un fichier inchangé. */
export function empreinteSHA256(contenu: Buffer | Uint8Array): string {
  return createHash("sha256").update(contenu).digest("hex");
}

export interface TexteExtrait {
  texte: string;
  /** false = fichier vide, scanné (image) ou illisible : à lister, pas d'OCR en V1. */
  extractible: boolean;
  erreur?: string;
}

/** Nettoie le texte : espaces multiples, lignes vides répétées, caractères de contrôle. */
export function nettoyerTexte(t: string): string {
  return t
    .replace(/\u0000/g, "")
    .replace(/[\t  ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extraction locale et gratuite du texte : mammoth pour .docx, unpdf (pdf.js) pour .pdf.
 * Les anciens .doc ne sont pas lus (listés comme illisibles).
 */
export async function extraireTexte(contenu: Buffer, nomFichier: string): Promise<TexteExtrait> {
  const ext = nomFichier.toLowerCase().split(".").pop();
  try {
    let brut = "";
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      brut = (await mammoth.extractRawText({ buffer: contenu })).value;
    } else if (ext === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(contenu));
      brut = (await extractText(pdf, { mergePages: true })).text as string;
    } else {
      return { texte: "", extractible: false, erreur: `Format .${ext} non lu` };
    }
    const texte = nettoyerTexte(brut);
    return { texte, extractible: texte.replace(/\s/g, "").length >= SEUIL_TEXTE_EXTRACTIBLE };
  } catch (e) {
    return { texte: "", extractible: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}
