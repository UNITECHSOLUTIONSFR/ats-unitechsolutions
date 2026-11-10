import { NextResponse, type NextRequest } from "next/server";
import { utilisateurConnecte, clientSupabaseServeur } from "@/lib/supabase/serveur";
import { donneesPersonne } from "@/lib/rgpd/effacement";

/** Droit d'accès : export de toutes les données d'une personne (administrateurs). L'export est journalisé. */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const utilisateur = await utilisateurConnecte();
  const supabase = await clientSupabaseServeur();
  if (!utilisateur || !supabase || utilisateur.role !== "admin") return new NextResponse("Réservé aux administrateurs.", { status: 403 });
  const { id } = await params;
  const donnees = await donneesPersonne(supabase, id);
  if (!donnees.fiche) return new NextResponse("Fiche introuvable.", { status: 404 });
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: id, details: { rgpd: "droit d'accès" } });
  return new NextResponse(JSON.stringify(donnees, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="donnees-${id}.json"` },
  });
}
