"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase du navigateur (clé publique, session de la personne connectée). */
export function clientNavigateur() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const cle = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
  return createBrowserClient(url, cle);
}
