import { after, NextResponse } from "next/server";
import { journaliser } from "@/lib/acces";
import { utilisateurConnecte, clientSupabaseServeur } from "@/lib/supabase/serveur";
import { chargerFiche } from "@/lib/consultants/fiche";

/**
 * Fiche d'un consultant pour le panneau latéral. Simple lecture (GET) : rapide, en parallèle,
 * sans recalculer l'écran comme le ferait une action serveur. Règles d'accès de la base (RLS) appliquées.
 */
export async function GET(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Identifiant invalide", { status: 400 });
  const supabase = await clientSupabaseServeur();
  if (!supabase) return new NextResponse("Non autorisé", { status: 401 });
  // Préchargement au survol : pas de trace dans le journal (seule l'ouverture réelle est une consultation).
  const prechargement = new URL(requete.url).searchParams.has("prechargement");
  // Vérification du compte et lecture de la fiche en même temps : la base (RLS) ne renvoie rien à un compte non autorisé,
  // et la fiche n'est envoyée que si la vérification passe.
  const [utilisateur, fiche] = await Promise.all([utilisateurConnecte(), chargerFiche(supabase, null, id)]);
  if (!utilisateur) return new NextResponse("Non autorisé", { status: 401 });
  // Notes de l'équipe : « moi » connu une fois le compte vérifié.
  if (fiche) fiche.notesEquipe = fiche.notesEquipe.map((n) => ({ ...n, moi: n.auteurId === utilisateur.id }));
  if (fiche && !prechargement) after(() => journaliser(supabase, utilisateur.id, "consultation", id, { ecran: "panneau" }));
  return NextResponse.json(fiche, { headers: { "Cache-Control": "private, no-store" } });
}
