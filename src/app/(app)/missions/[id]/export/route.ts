import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { classementMission } from "@/lib/matching/classement";
import { formaterTelephone } from "@/lib/metier/telephone";

const SUIVI: Record<string, string> = { propose: "Proposé", appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Refusé" };

/** Export Excel du classement d'une mission (administrateurs). L'export est journalisé. */
export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase || utilisateur.role !== "admin") return new NextResponse("Réservé aux administrateurs.", { status: 403 });
  const { id } = await params;
  const { data: mission } = await supabase.from("missions").select("intitule, client").eq("id", id).maybeSingle();
  if (!mission) return new NextResponse("Mission introuvable.", { status: 404 });
  const [classement, { data: props }] = await Promise.all([
    classementMission(supabase, id, 200),
    supabase.from("propositions").select("consultant_id, statut").eq("mission_id", id),
  ]);
  const suivi = new Map((props ?? []).map((p) => [p.consultant_id, p.statut as string]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Classement");
  ws.columns = [
    { header: "Rang", width: 6 }, { header: "Prénom", width: 16 }, { header: "Nom", width: 18 }, { header: "Trigramme", width: 10 },
    { header: "Poste", width: 32 }, { header: "Score /100", width: 10 }, { header: "Disponibilité", width: 20 }, { header: "Téléphone", width: 16 },
    { header: "Email", width: 30 }, { header: "Suivi", width: 16 }, { header: "Pourquoi ce score", width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  classement.forEach((c, i) => ws.addRow([
    i + 1, c.prenom, c.nom, c.trigramme, c.intitule_poste ?? "", Math.round(c.resultat.score),
    c.disponible_le ? new Date(c.disponible_le).toLocaleDateString("fr-FR") : c.disponibilite ?? "",
    formaterTelephone(c.telephone_e164), c.email ?? "", SUIVI[suivi.get(c.consultant_id) ?? ""] ?? "",
    c.resultat.raisons.map((r) => r.texte).join(" · "),
  ]));
  ws.getColumn(8).numFmt = "@";
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: null, details: { mission: id, lignes: classement.length } });
  const nom = `classement-${(mission.intitule ?? "mission").replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60)}.xlsx`;
  return new NextResponse(Buffer.from(await wb.xlsx.writeBuffer()), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${encodeURIComponent(nom)}"` },
  });
}
