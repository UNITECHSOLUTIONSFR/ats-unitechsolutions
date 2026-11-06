import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur } from "@/lib/supabase/serveur";

export async function POST(request: NextRequest) {
  const supabase = await clientSupabaseServeur();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/connexion", request.url), { status: 303 });
}
