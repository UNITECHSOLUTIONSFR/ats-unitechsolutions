import { after, NextResponse } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";

/**
 * Suivi de l'activité : une recherche faite dans la barre de l'écran Consultants est notée dans le journal d'accès
 * (appelé une fois la saisie terminée, pas à chaque lettre).
 */
export async function POST(requete: Request) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const { texte } = (await requete.json().catch(() => ({}))) as { texte?: string };
  const t = String(texte ?? "").trim().slice(0, 200);
  if (t.length < 3) return new NextResponse(null, { status: 204 });
  after(async () => { await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "recherche", details: { texte: t, ecran: "consultants" } }); });
  return new NextResponse(null, { status: 204 });
}
