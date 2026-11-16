import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { effacerPersonne } from "@/lib/rgpd/effacement";

// Effacement d'une personne depuis sa fiche (administrateur, confirmation par le trigramme).
// Appelé par la fiche elle-même : la page n'est pas rechargée (elle n'existe plus), la fiche affiche le résultat
// et propose le retour à la liste.
export async function POST(requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  if (utilisateur.role !== "admin") return NextResponse.json({ erreur: "Réservé aux administrateurs." }, { status: 403 });
  const { id } = await params;
  const { confirmation } = (await requete.json().catch(() => ({}))) as { confirmation?: string };
  const { data: c } = await supabase.from("consultants").select("trigramme").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ erreur: "Fiche introuvable (déjà effacée ?)." }, { status: 404 });
  if (String(confirmation ?? "").trim().toUpperCase() !== String(c.trigramme ?? "").toUpperCase()) {
    return NextResponse.json({ erreur: c.trigramme ? `Pour confirmer, saisissez le trigramme ${c.trigramme}.` : "Cette fiche n'a pas de trigramme : laissez la case vide pour confirmer." }, { status: 400 });
  }
  try {
    const fichiers = await effacerPersonne(supabase, id);
    invaliderTableau();
    revalidatePath("/consultants");
    revalidatePath("/");
    return NextResponse.json({ fichiers });
  } catch (e) {
    return NextResponse.json({ erreur: (e as Error).message }, { status: 500 });
  }
}
