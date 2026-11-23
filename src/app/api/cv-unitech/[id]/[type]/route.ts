import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { ESPACE_ADEQUATIONS } from "@/lib/cv-unitech/service";

/**
 * Téléchargement d'un CV d'adéquation gardé dans l'outil (Word ou PDF), réservé aux personnes connectées.
 * Les CV de base restent dans SharePoint et s'ouvrent là-bas. Chaque téléchargement est noté dans le journal (export).
 */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string; type: string }> }) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const { id, type } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || (type !== "word" && type !== "pdf")) return new NextResponse("Introuvable", { status: 404 });
  // Lu avec les droits de la personne : un compte retiré ne voit rien.
  const { data: g } = await supabase.from("cv_unitech_generes").select("consultant_id, stockage, word_nom, word_chemin, pdf_nom, pdf_chemin").eq("id", id).maybeSingle();
  const chemin = type === "word" ? g?.word_chemin : g?.pdf_chemin;
  if (!g || g.stockage !== "outil" || !chemin) return new NextResponse("Introuvable", { status: 404 });
  const { data: f, error } = await clientSupabaseAdmin().storage.from(ESPACE_ADEQUATIONS).download(chemin as string);
  if (error || !f) return new NextResponse("Fichier introuvable", { status: 404 });
  const nom = ((type === "word" ? g.word_nom : g.pdf_nom) as string | null) ?? `CV.${type === "word" ? "docx" : "pdf"}`;
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: g.consultant_id, details: { cv_adequation: nom } });
  return new NextResponse(Buffer.from(await f.arrayBuffer()), {
    headers: {
      "Content-Type": type === "word" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `${type === "pdf" ? "inline" : "attachment"}; filename="${nom.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
