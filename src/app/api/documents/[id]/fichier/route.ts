import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { ESPACE_ADEQUATIONS } from "@/lib/cv-unitech/service";
import { cheminCVCollective } from "@/lib/collective/fichier";

/**
 * CV gardé dans l'outil (candidats Collective, décision du 24/11/2026) : ouvert dans le navigateur, réservé aux personnes
 * connectées. Chaque ouverture est notée dans le journal d'accès.
 */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Introuvable", { status: 404 });
  // Lu avec les droits de la personne : un compte retiré ne voit rien.
  const { data: d } = await supabase.from("documents").select("consultant_id, nom_fichier, sharepoint_item_id").eq("id", id).maybeSingle();
  const chemin = d ? cheminCVCollective(String(d.sharepoint_item_id)) : null;
  if (!d || !chemin) return new NextResponse("Introuvable", { status: 404 });
  const { data: f, error } = await clientSupabaseAdmin().storage.from(ESPACE_ADEQUATIONS).download(chemin);
  if (error || !f) return new NextResponse("Fichier introuvable", { status: 404 });
  const nom = (d.nom_fichier as string | null) ?? "CV.pdf";
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "consultation", consultant_id: d.consultant_id, details: { cv: nom } });
  return new NextResponse(Buffer.from(await f.arrayBuffer()), {
    headers: {
      "Content-Type": nom.toLowerCase().endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `inline; filename="${nom.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
