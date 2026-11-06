/**
 * Adresses et clé publique de Supabase (variables d'environnement Vercel).
 * La clé « publishable » est faite pour le navigateur ; la clé secrète n'est jamais lue ici.
 */
export function configSupabase(): { url: string; clePublique: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clePublique = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clePublique) return null;
  return { url, clePublique };
}
