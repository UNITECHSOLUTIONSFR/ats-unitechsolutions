import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { configSupabase } from "./config";

/** Client Supabase côté serveur, agissant au nom de l'utilisateur connecté (RLS appliquée). */
export const clientSupabaseServeur = cache(async () => {
  const config = configSupabase();
  if (!config) return null;
  const magasin = await cookies();
  return createServerClient(config.url, config.clePublique, {
    cookies: {
      getAll: () => magasin.getAll(),
      setAll: (aEcrire) => {
        try {
          aEcrire.forEach(({ name, value, options }) => magasin.set(name, value, options));
        } catch {
          // Appelé depuis un composant serveur : le proxy se charge de rafraîchir la session.
        }
      },
    },
  });
});

export type Role = "admin" | "recruteur";

export interface UtilisateurConnecte {
  id: string;
  email: string;
  nomAffiche: string | null;
  role: Role;
}

/**
 * Renvoie l'utilisateur connecté s'il est invité ET actif, sinon null.
 * Un compte authentifié mais absent de la table « utilisateurs » n'a aucun accès.
 */
// Une seule vérification par affichage de page (cache), et signature du jeton vérifiée localement (getClaims, clés publiques du projet) :
// plus d'aller-retour vers le serveur d'authentification à chaque page. Un compte désactivé reste bloqué par la table « utilisateurs ».
export const utilisateurConnecte = cache(async (): Promise<UtilisateurConnecte | null> => {
  const supabase = await clientSupabaseServeur();
  if (!supabase) return null;
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: fiche } = await supabase
    .from("utilisateurs")
    .select("id, email, nom_affiche, role, actif")
    .eq("id", id)
    .maybeSingle();
  if (!fiche || !fiche.actif) return null;
  return { id: fiche.id, email: fiche.email, nomAffiche: fiche.nom_affiche, role: fiche.role };
});
