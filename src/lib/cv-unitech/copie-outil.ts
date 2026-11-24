import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphGet, telechargerFichier } from "@/lib/sharepoint";
import { ESPACE_ADEQUATIONS } from "./service";

/**
 * Décision 6B (24/11/2026) : des CV d'adéquation déposés dans SharePoint avant la règle « un seul CV par consultant » sont
 * copiés dans l'outil (téléchargeables depuis la fiche) ET laissés dans SharePoint (rien n'y est supprimé ni modifié).
 */
export async function copierAdequationsDansOutil(supabase: SupabaseClient, ids: string[]): Promise<string[]> {
  const rapport: string[] = [];
  const { data } = await supabase.from("cv_unitech_generes").select("id, consultant_id, drive_id, word_item_id, word_nom, pdf_url, pdf_nom, stockage").in("id", ids);
  for (const g of data ?? []) {
    if (g.stockage === "outil") { rapport.push(`${g.word_nom} : déjà dans l'outil`); continue; }
    try {
      const word = await telechargerFichier(g.drive_id as string, g.word_item_id as string);
      const cheminWord = `${g.consultant_id}/${g.id}.docx`;
      const espace = supabase.storage.from(ESPACE_ADEQUATIONS);
      const e1 = await espace.upload(cheminWord, word, { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: true });
      if (e1.error) throw new Error(e1.error.message);
      const maj: Record<string, unknown> = { stockage: "outil", word_chemin: cheminWord, word_url: `/api/cv-unitech/${g.id}/word` };
      if (g.pdf_url) {
        try {
          // PDF retrouvé par son lien SharePoint (lecture seule).
          const jeton = Buffer.from(g.pdf_url as string).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
          const pdf = await graphGet<Buffer>(`shares/u!${jeton}/driveItem/content`, { brut: true });
          const cheminPdf = `${g.consultant_id}/${g.id}.pdf`;
          const e2 = await espace.upload(cheminPdf, pdf, { contentType: "application/pdf", upsert: true });
          if (!e2.error) Object.assign(maj, { pdf_chemin: cheminPdf, pdf_url: `/api/cv-unitech/${g.id}/pdf` });
        } catch (e) { rapport.push(`${g.pdf_nom} : PDF non copié (${(e as Error).message.slice(0, 80)})`); }
      }
      await supabase.from("cv_unitech_generes").update(maj).eq("id", g.id);
      rapport.push(`${g.word_nom} : copié dans l'outil (laissé dans SharePoint)`);
    } catch (e) { rapport.push(`${g.word_nom} : échec (${(e as Error).message.slice(0, 120)})`); }
  }
  return rapport;
}
