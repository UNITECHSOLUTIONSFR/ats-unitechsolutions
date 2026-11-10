import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { utilisateurConnecte, clientSupabaseServeur } from "@/lib/supabase/serveur";
import { champsParEntete } from "@/lib/import/excel";
import { valeurEcran } from "@/lib/tableau/modele";
import { lignesHorsExcel, PREFIXE_HORS_EXCEL, type FicheHorsExcel } from "@/lib/tableau/hors-excel";

/** Export Excel d'un onglet (lignes filtrées ou sélectionnées). Réservé aux administrateurs. */
export async function POST(requete: Request) {
  const utilisateur = await utilisateurConnecte();
  const supabase = await clientSupabaseServeur();
  if (!utilisateur || !supabase || utilisateur.role !== "admin") {
    return new NextResponse("Export réservé aux administrateurs.", { status: 403 });
  }
  const form = await requete.formData();
  const ongletId = String(form.get("onglet") ?? "");
  let ids: string[] = [];
  try {
    ids = JSON.parse(String(form.get("ids") ?? "[]")) as string[];
  } catch {
    return new NextResponse("Demande invalide.", { status: 400 });
  }

  const { data: onglet } = await supabase.from("tableau_onglets").select("nom, entetes, principal").eq("id", ongletId).maybeSingle();
  if (!onglet) return new NextResponse("Onglet introuvable.", { status: 404 });

  // Lignes de l'Excel (copie) et fiches ajoutées hors Excel (lues depuis la fiche), dans l'ordre affiché à l'écran.
  const idsTableau = ids.filter((id) => !id.startsWith(PREFIXE_HORS_EXCEL));
  const idsFiches = ids.filter((id) => id.startsWith(PREFIXE_HORS_EXCEL)).map((id) => id.slice(PREFIXE_HORS_EXCEL.length));
  const lignes: { id: string; consultant_id: string | null; valeurs: Record<string, string> }[] = [];
  for (let i = 0; i < idsTableau.length; i += 300) {
    const { data } = await supabase.from("tableau_lignes").select("id, consultant_id, valeurs").in("id", idsTableau.slice(i, i + 300));
    lignes.push(...(data ?? []));
  }
  for (let i = 0; i < idsFiches.length; i += 300) {
    const { data } = await supabase.from("consultants").select("*").in("id", idsFiches.slice(i, i + 300));
    lignes.push(...lignesHorsExcel((data ?? []) as FicheHorsExcel[], onglet.entetes, 0));
  }
  const ordre = new Map(ids.map((id, i) => [id, i]));
  lignes.sort((a, b) => ordre.get(a.id)! - ordre.get(b.id)!);

  const champs = onglet.principal ? champsParEntete(onglet.entetes, onglet.entetes) : {};
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet(onglet.nom.slice(0, 31));
  feuille.columns = onglet.entetes.map((e: string) => ({ header: e, key: e, width: Math.min(40, Math.max(12, e.length + 4)), style: { numFmt: "@" } }));
  feuille.getRow(1).font = { bold: true };
  feuille.views = [{ state: "frozen", ySplit: 1 }];
  for (const l of lignes) {
    // Tout en texte : le zéro des téléphones ne disparaît plus.
    feuille.addRow(Object.fromEntries(onglet.entetes.map((e: string) => [e, valeurEcran(champs[e], l.valeurs[e])])));
  }
  feuille.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, onglet.entetes.length) } };

  const consultants = [...new Set(lignes.map((l) => l.consultant_id).filter(Boolean))] as string[];
  for (let i = 0; i < consultants.length; i += 500) {
    await supabase.from("journal_acces").insert(
      consultants.slice(i, i + 500).map((id) => ({ utilisateur_id: utilisateur.id, action: "export", consultant_id: id, details: { onglet: onglet.nom } })),
    );
  }
  if (!consultants.length) {
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: null, details: { onglet: onglet.nom, lignes: lignes.length } });
  }

  const contenu = await classeur.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  const nom = `ATS Unitech - ${onglet.nom} - ${date}.xlsx`;
  return new NextResponse(contenu as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(nom)}`,
    },
  });
}
