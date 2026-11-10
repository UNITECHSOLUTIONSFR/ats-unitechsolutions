"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { normaliserNomPersonne } from "@/lib/metier/texte";

/**
 * Rattache un CV Word (et son PDF anonymisé) à une fiche consultant, retrouvée par son prénom et son nom
 * ou par son trigramme. Refuse si plusieurs fiches correspondent (il faut alors préciser).
 */
export async function rattacherCV(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const documentId = String(formData.get("document_id"));
  const saisie = String(formData.get("fiche") ?? "").trim();
  if (!saisie) return;
  const mots = saisie.split(/\s+/);
  const { data: candidats } = await supabase.from("consultants").select("id, prenom, nom, trigramme")
    .or(`nom.ilike.%${mots[mots.length - 1].replace(/[%,()]/g, "")}%,trigramme.eq.${saisie.toUpperCase().replace(/[^A-Z]/g, "")}`).limit(50);
  const cle = normaliserNomPersonne(mots.slice(0, -1).join(" "), mots[mots.length - 1]);
  const exacts = (candidats ?? []).filter((c) => normaliserNomPersonne(c.prenom, c.nom) === cle || c.trigramme === saisie.toUpperCase());
  if (exacts.length !== 1) return; // aucune ou plusieurs fiches : rien n'est rattaché
  const consultantId = exacts[0].id;
  const { data: doc } = await supabase.from("documents").select("document_associe_id").eq("id", documentId).maybeSingle();
  await supabase.from("documents").update({ consultant_id: consultantId }).eq("id", documentId);
  if (doc?.document_associe_id) await supabase.from("documents").update({ consultant_id: consultantId }).eq("id", doc.document_associe_id);
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: consultantId, details: { rattachement_cv: documentId } });
  revalidatePath("/parametres/cv");
}
