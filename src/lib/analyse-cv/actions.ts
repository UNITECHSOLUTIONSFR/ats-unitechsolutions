"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { collecterAnalyse, envoyerAnalyse, type EtatAnalyse } from "./coeur";

export type { EtatAnalyse };

export async function lancerAnalyse(): Promise<EtatAnalyse> {
  const { supabase } = await exigerAdmin();
  const r = await envoyerAnalyse(supabase);
  revalidatePath("/parametres/analyse-cv");
  return r;
}

export async function recupererResultats(): Promise<EtatAnalyse> {
  const { supabase } = await exigerAdmin();
  const r = await collecterAnalyse(supabase);
  revalidatePath("/parametres/analyse-cv");
  return r;
}
