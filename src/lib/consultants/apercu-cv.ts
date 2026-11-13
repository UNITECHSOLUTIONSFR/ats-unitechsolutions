import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphEnvoyer } from "@/lib/sharepoint";

export interface ApercuCV {
  /** Lien d'aperçu SharePoint (lecture seule, valable quelques minutes) à afficher dans la fiche. */
  url: string | null;
  /** Lien pour ouvrir le fichier dans SharePoint. */
  ouvrir: string | null;
  nom: string | null;
  /** Texte du CV, si aucun fichier n'est affichable. */
  texte: string | null;
}

/**
 * Aperçu du CV d'un consultant : le CV d'origine rangé dans SharePoint, sinon le CV Unitech, sinon le texte extrait.
 * Le lien est demandé à Microsoft à chaque affichage (il expire vite) ; réservé aux personnes connectées à l'outil.
 */
export async function apercuCV(supabase: SupabaseClient, consultantId: string): Promise<ApercuCV> {
  const [{ data: docs }, { data: unitech }] = await Promise.all([
    supabase.from("documents").select("type, nom_fichier, url_web, sharepoint_drive_id, sharepoint_item_id, texte_extrait")
      .eq("consultant_id", consultantId).eq("supprime_sharepoint", false).in("type", ["word_nominatif", "pdf_anonyme"])
      .order("modifie_sharepoint_le", { ascending: false, nullsFirst: false }),
    supabase.from("cv_unitech_generes").select("drive_id, word_item_id, word_nom, word_url").eq("consultant_id", consultantId)
      .not("word_item_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const fichiers = (docs ?? []).filter((d) => !String(d.sharepoint_drive_id).startsWith("boite:"));
  const candidats = [
    ...fichiers.filter((d) => d.type === "word_nominatif"), ...fichiers.filter((d) => d.type === "pdf_anonyme"),
  ].map((d) => ({ drive: d.sharepoint_drive_id as string, item: d.sharepoint_item_id as string, nom: d.nom_fichier as string, ouvrir: d.url_web as string | null }));
  if (unitech?.drive_id && unitech.word_item_id) candidats.push({ drive: unitech.drive_id, item: unitech.word_item_id, nom: unitech.word_nom, ouvrir: unitech.word_url });
  for (const c of candidats) {
    try {
      const r = await graphEnvoyer<{ getUrl?: string }>("POST", `drives/${c.drive}/items/${c.item}/preview`, {});
      if (r.getUrl) return { url: r.getUrl, ouvrir: c.ouvrir, nom: c.nom, texte: null };
    } catch { /* fichier déplacé ou supprimé : on essaie le suivant */ }
  }
  const texte = (docs ?? []).find((d) => d.texte_extrait)?.texte_extrait ?? null;
  return { url: null, ouvrir: (docs ?? []).find((d) => d.url_web?.includes("sharepoint.com"))?.url_web ?? null, nom: null, texte };
}
