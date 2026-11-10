import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";

/** Fiches dont le CV contient les mots cherchés (« kafka », « SNCF », « ITIL »…). */
export async function GET(requete: NextRequest) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const q = (requete.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json([]);
  const { data } = await supabase.rpc("rechercher_dans_cv", { p_texte: q });
  return NextResponse.json(((data ?? []) as { consultant_id: string }[]).map((d) => d.consultant_id), { headers: { "Cache-Control": "private, max-age=60" } });
}
