import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { configSupabase } from "@/lib/supabase/config";
import { COOKIE_ACTIVITE, sessionExpiree } from "@/lib/securite/session";

/** Pages accessibles sans être connecté. */
// /api/cron/ : tâches planifiées, protégées par CRON_SECRET (pas de session utilisateur).
// /mot-de-passe : ouverte depuis le lien « mot de passe oublié » (la session arrive avec le lien) ; sans session, rien n'y est modifiable.
const PAGES_PUBLIQUES = ["/connexion", "/desinscription/", "/auth/", "/api/cron/", "/manifest.webmanifest", "/mot-de-passe"];

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

  // getClaims : rafraîchit la session si besoin et vérifie la signature du jeton sans appel réseau.
  const { data } = await supabase.auth.getClaims();
  const chemin = request.nextUrl.pathname;
  const publique = PAGES_PUBLIQUES.some((p) => chemin === p || chemin.startsWith(p));
  if (!data?.claims && !publique) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const maintenant = Date.now();
  const activite = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 30 * 86_400 };
  // Nouvelle connexion (retour du lien magique) : le compteur d'inactivité repart de zéro.
  if (chemin.startsWith("/auth/")) {
    reponse.cookies.set(COOKIE_ACTIVITE, String(maintenant), activite);
    return reponse;
  }
  if (data?.claims) {
    // Au-delà de 7 jours depuis la connexion ou de 3 jours sans activité : déconnexion, puis lien (et code) redemandés.
    const raison = sessionExpiree(data.claims.amr, request.cookies.get(COOKIE_ACTIVITE)?.value, maintenant);
    if (raison) {
      const url = request.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = `?session=${raison}`;
      const sortie = NextResponse.redirect(url);
      for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-") || c.name === COOKIE_ACTIVITE) sortie.cookies.delete(c.name);
      return sortie;
    }
    reponse.cookies.set(COOKIE_ACTIVITE, String(maintenant), activite);
  }
  return reponse;
}

export const config = {
  // Fichiers publics (logo, images) exclus : ils doivent s'afficher sur la page de connexion.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
