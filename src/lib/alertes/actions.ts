"use server";

import { revalidatePath, updateTag } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";

/** Marque une alerte comme résolue ou ignorée (trace de qui et quand). */
export async function traiterAlerte(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const statut = formData.get("statut") === "ignoree" ? "ignoree" : "resolue";
  await supabase.from("alertes").update({ statut, resolue_par: utilisateur.id, resolue_le: new Date().toISOString() }).eq("id", String(formData.get("id")));
  revalidatePath("/alertes");
  updateTag("accueil");
  revalidatePath("/");
}

/** Traite une alerte (bouton de la ligne) ou toutes les alertes cochées : « resolue:<id> », « ignoree:selection »… */
export async function traiterAlertes(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const [statutDemande, cible] = String(formData.get("action") ?? "").split(":");
  const statut = statutDemande === "ignoree" ? "ignoree" : "resolue";
  const ids = (cible === "selection" ? formData.getAll("ids").map(String) : [cible]).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!ids.length) return;
  await supabase.from("alertes").update({ statut, resolue_par: utilisateur.id, resolue_le: new Date().toISOString() }).in("id", ids);
  revalidatePath("/alertes");
  updateTag("accueil");
  revalidatePath("/");
}

/** Décision 8A : rattache le CV d'une alerte « CV à rattacher » à la fiche choisie, en un clic (« alerte:fiche » ou lien collé). */
export async function rattacherCV(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const [alerteId, choix] = String(formData.get("rattacher") ?? "").split(":");
  const colle = String(formData.get(`fiche_${alerteId}`) ?? "");
  const ficheId = (choix || /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(colle)?.[1] || "").toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(alerteId) || !/^[0-9a-f-]{36}$/i.test(ficheId)) return;
  const { data: a } = await supabase.from("alertes").select("document_id").eq("id", alerteId).eq("type", "cv_a_rattacher").maybeSingle();
  if (!a?.document_id) return;
  await supabase.from("documents").update({ consultant_id: ficheId }).eq("id", a.document_id);
  await supabase.from("alertes").update({ statut: "resolue", consultant_id: ficheId, resolue_par: utilisateur.id, resolue_le: new Date().toISOString() }).eq("id", alerteId);
  await supabase.from("consultants_historique").insert({ consultant_id: ficheId, source: "interface", par: utilisateur.id, modifications: { cv: { avant: null, apres: "CV rattaché depuis « Cas à vérifier »" } } });
  revalidatePath("/alertes");
  updateTag("accueil");
  revalidatePath("/");
}

