import { NextResponse } from "next/server";
import { utilisateurConnecte, clientSupabaseServeur } from "@/lib/supabase/serveur";
import { chargerFiche } from "@/lib/consultants/fiche";

/**
 * Fiche d'un consultant pour le panneau latéral. Simple lecture (GET) : rapide, en parallèle,
 * sans recalculer l'écran comme le ferait une action serveur. Règles d'accès de la base (RLS) appliquées.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Identifiant invalide", { status: 400 });
  // Préchargement au survol : pas de trace dans le journal (seule l'ouverture réelle est une consultation).
  const prechargement = new URL(requete.url).searchParams.has("prechargement");
  const fiche = await chargerFiche(supabase, prechargement ? null : utilisateur.id, id);
  return NextResponse.json(fiche, { headers: { "Cache-Control": "private, no-store" } });
}
