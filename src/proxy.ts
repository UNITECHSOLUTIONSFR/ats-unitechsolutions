import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { configSupabase } from "@/lib/supabase/config";

/** Pages accessibles sans être connecté. */
// /api/cron/ : tâches planifiées, protégées par CRON_SECRET (pas de session utilisateur).
const PAGES_PUBLIQUES = ["/connexion", "/auth/", "/api/cron/"];

/**
 * Exécuté avant chaque page : rafraîchit la session Supabase et renvoie vers
 * la page de connexion toute personne non connectée.
 * (Contrôle « optimiste » : la vraie protection des données est la RLS de la base.)
 */
export async function proxy(request: NextRequest) {
  const config = configSupabase();
  if (!config) return NextResponse.next(); // configuration pas encore saisie dans Vercel

  let reponse = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.clePublique, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (aEcrire) => {
        aEcrire.forEach(({ name, value }) => request.cookies.set(name, value));
        reponse = NextResponse.next({ request });
        aEcrire.forEach(({ name, value, options }) => reponse.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const chemin = request.nextUrl.pathname;
  const publique = PAGES_PUBLIQUES.some((p) => chemin === p || chemin.startsWith(p));
  if (!data.user && !publique) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return reponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
