import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formaterTelephone } from "@/lib/metier/telephone";
import { graphTeleverser, trouverBibliotheque } from "@/lib/sharepoint";
import { lireTout } from "@/lib/supabase/pages";

/** Dossier SharePoint des sauvegardes (une par semaine, rien n'est jamais supprimé). */
export const DOSSIER_SAUVEGARDES = "General/0 - Recrutement/Sauvegardes ATS";

/**
 * Sauvegarde hebdomadaire lisible : un fichier Excel complet (consultants, missions, propositions, notes)
 * déposé dans SharePoint, en plus des sauvegardes quotidiennes de Supabase.
 */
export async function sauvegarderDansSharePoint(supabase: SupabaseClient) {
  const [consultants, missions, propositions, notes] = await Promise.all([
    lireTout<Record<string, unknown>>((a, b) => supabase.from("consultants").select("id, prenom, nom, trigramme, email, email_2, telephone_e164, telephone_brut, intitule_poste, localisation, disponibilite, disponible_le, disponibilite_maj_le, statut, source, experience, tjm_salaire, linkedin, notes, created_at, updated_at").order("nom").range(a, b)),
    lireTout<Record<string, unknown>>((a, b) => supabase.from("missions").select("id, intitule, client, statut, localisation, date_debut, annees_min, seniorite, created_at").order("created_at").range(a, b)),
    lireTout<Record<string, unknown>>((a, b) => supabase.from("propositions").select("mission_id, consultant_id, statut, score, created_at, updated_at").range(a, b)),
    lireTout<Record<string, unknown>>((a, b) => supabase.from("notes_consultant").select("consultant_id, texte, created_at").range(a, b)),
  ]);
  const wb = new ExcelJS.Workbook();
  const feuille = (nom: string, lignes: Record<string, unknown>[], texte: string[] = []) => {
    const ws = wb.addWorksheet(nom);
    const cles = lignes.length ? Object.keys(lignes[0]) : [];
    ws.columns = cles.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(10, k.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    for (const l of lignes) ws.addRow(Object.fromEntries(cles.map((k) => [k, k === "telephone_e164" ? formaterTelephone(l[k] as string) : l[k] ?? ""])));
    for (const k of texte) if (cles.includes(k)) ws.getColumn(k).numFmt = "@";
  };
  feuille("Consultants", consultants, ["telephone_e164", "telephone_brut"]);
  feuille("Missions", missions);
  feuille("Propositions", propositions);
  feuille("Notes", notes);

  const nom = `ATS-sauvegarde-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const fichier = await graphTeleverser(await trouverBibliotheque(), `${DOSSIER_SAUVEGARDES}/${nom}`, Buffer.from(await wb.xlsx.writeBuffer()),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return { fichier: nom, lien: fichier.webUrl, consultants: consultants.length, missions: missions.length };
}
