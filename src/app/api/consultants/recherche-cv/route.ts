import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";

/** Fiches dont le CV contient les mots cherchés (« kafka », « SNCF », « ITIL »…), avec l'extrait et l'origine du CV. */
export async function GET(requete: NextRequest) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const q = (requete.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json([]);
  const { data } = await supabase.rpc("rechercher_dans_cv_extraits", { p_texte: q });
  const resultats = ((data ?? []) as { consultant_id: string; extrait: string; source: string }[])
    .map((d) => ({ id: d.consultant_id, extrait: d.extrait, source: d.source }));
  return NextResponse.json(resultats, { headers: { "Cache-Control": "private, max-age=60" } });
}
