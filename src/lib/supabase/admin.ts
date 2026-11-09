import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Client « serveur » avec la clé secrète : contourne la RLS.
 * Réservé aux traitements automatiques et au journal des coûts IA. Jamais côté navigateur.
 */
export function clientSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Configuration Supabase serveur incomplète (SUPABASE_SECRET_KEY).");
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}
