import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateTag } from "next/cache";
import { extraireExigencesMission, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { resoudreCompetences } from "@/lib/matching/competences";
import { extraireTexte } from "@/lib/sharepoint/extraction";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { telechargerPieceJointe, trelloGet, type CarteTrello, type ListeTrello } from "./client";
import { cleIntitule, lireColonne, lireTitre, lireTJM, rapprocher, sansTJM, TABLEAU_TRELLO } from "./regles";

/** Ce qui est fait (ou, en simulation, serait fait) pour une carte : sert à l'aperçu avant la première lecture réelle. */
export interface PlanCarte {
  carte: string; colonne: string; statut: string; recruteur: string | null; client: string | null; intitule: string; tjm: string | null;
  action: "creer" | "relier" | "mettre_a_jour" | "inchangee"; missionReliee?: string; pieceJointe: string | null; analyseIA: boolean; url: string;
}

export interface BilanTrello {
  plan?: PlanCarte[];
  cartesLues: number; creees: number; reliees: number; misesAJour: number; analysees: number; aAnalyserPlusTard: number;
  fermees: number; ignorees: number; erreurs: string[]; coutUSD: number;
}

/** Nombre de cartes analysées par l'IA à chaque passage (le reste suit au passage suivant, une heure après). */
const ANALYSES_PAR_PASSAGE = 25;

type MissionExistante = {
  id: string; intitule: string; statut: string; trello_carte_id: string | null; trello_empreinte: string | null;
  trello_colonne: string | null; trello_recruteur: string | null; client: string | null; tjm: string | null;
};

/**
 * Lit le tableau Trello des missions (lecture seule) et met les missions de l'outil à jour :
 * une carte = une mission (reconnue par son identifiant, même si elle change de colonne : jamais de doublon) ;
 * statut et recruteur tirés de la colonne ; compétences tirées de la description et de la pièce jointe, lues ensemble
 * par l'IA une seule fois tant que le texte ne change pas ; TJM retiré du texte lu par l'IA et gardé à part (interne).
 * Une mission déjà créée dans l'outil avec le même intitulé est reliée à sa carte (son suivi est conservé).
 */
export async function synchroniserTrello(supabase: SupabaseClient, options: { simulation?: boolean } = {}): Promise<BilanTrello> {
  const simulation = !!options.simulation;
  const plan: PlanCarte[] = [];
  const bilan: BilanTrello = { cartesLues: 0, creees: 0, reliees: 0, misesAJour: 0, analysees: 0, aAnalyserPlusTard: 0, fermees: 0, ignorees: 0, erreurs: [], coutUSD: 0 };
  const [listes, cartes] = await Promise.all([
    trelloGet<ListeTrello[]>(`/boards/${TABLEAU_TRELLO}/lists?filter=all&fields=name,closed`),
    trelloGet<CarteTrello[]>(`/boards/${TABLEAU_TRELLO}/cards/all?fields=name,desc,idList,closed,shortUrl,dateLastActivity&attachments=true&attachment_fields=name,mimeType,bytes,isUpload,date`),
  ]);
  const nomListe = new Map(listes.map((l) => [l.id, l.name]));

  const { data: existantes } = await supabase.from("missions").select("id, intitule, statut, trello_carte_id, trello_empreinte, trello_colonne, trello_recruteur, client, tjm");
  const parCarte = new Map<string, MissionExistante>();
  const sansCarte = new Map<string, MissionExistante>();
  for (const m of (existantes ?? []) as MissionExistante[]) {
    if (m.trello_carte_id) parCarte.set(m.trello_carte_id, m);
    else sansCarte.set(cleIntitule(m.intitule), m);
  }
  const { data: personnes } = await supabase.from("utilisateurs").select("id, nom_affiche, email").eq("actif", true);
  const responsable = (recruteur: string | null) => {
    if (!recruteur) return null;
    const cible = normaliserNomPersonne("", recruteur.replace(/^M\.\s*/, ""));
    return (personnes ?? []).find((p) => normaliserNomPersonne("", `${p.nom_affiche ?? ""} ${p.email ?? ""}`).includes(cible))?.id ?? null;
  };

  // Une nouvelle mission n'entre dans l'outil QUE par « Missions en cours » ; une carte déjà connue est suivie dans toutes les colonnes.
  const nouvellesPossibles = cartes.filter((c) => !c.closed && !parCarte.has(c.id) && lireColonne(nomListe.get(c.idList) ?? "")?.aRepartir);
  const liens = rapprocher([...sansCarte.values()], nouvellesPossibles);
  const parId = new Map([...sansCarte.values()].map((m) => [m.id, m]));

  const vues = new Set<string>();
  const aAnalyser: { carte: CarteTrello; missionId: string; texte: string; empreinte: string; titre: ReturnType<typeof lireTitre>; dejaRelieeAvecExigences: boolean }[] = [];

  for (const carte of cartes) {
    const colonne = carte.closed ? { statut: "fermee" as const, recruteur: null, aRepartir: false } : lireColonne(nomListe.get(carte.idList) ?? "");
    const existante = parCarte.get(carte.id);
    if (!colonne) { if (!existante) bilan.ignorees++; continue; } // colonne ignorée (ex. Sourcing Kefi) : rien ne change
    if (!existante && !colonne.aRepartir) { bilan.ignorees++; continue; } // carte jamais passée par « Missions en cours » : pas importée
    vues.add(carte.id);
    bilan.cartesLues++;
    const titre = lireTitre(carte.name);
    const nomColonne = carte.closed ? "Archivée dans Trello" : (nomListe.get(carte.idList) ?? null);
    const champs = {
      statut: colonne.statut, trello_colonne: nomColonne, trello_recruteur: colonne.recruteur, trello_url: carte.shortUrl,
      trello_lu_le: new Date().toISOString(), tjm: lireTJM(carte.desc), intitule: titre.intitule || carte.name,
      ...(titre.client ? { client: titre.client } : {}),
      ...(colonne.recruteur ? { responsable_id: responsable(colonne.recruteur) } : {}),
    };

    try {
      let missionId = existante?.id;
      let relieeAvecExigences = false;
      let action: PlanCarte["action"] = "inchangee";
      let missionReliee: string | undefined;
      if (!missionId) {
        // Mission déjà créée dans l'outil avec le même intitulé : reliée (suivi des candidats et exigences conservés).
        const lieeSouple = liens.get(carte.id);
        const homonyme = sansCarte.get(cleIntitule(titre.intitule)) ?? sansCarte.get(cleIntitule(carte.name)) ?? (lieeSouple ? parId.get(lieeSouple) : undefined);
        if (homonyme) {
          const { error } = simulation ? { error: null } : await supabase.from("missions").update({ trello_carte_id: carte.id, ...champs }).eq("id", homonyme.id);
          if (error) throw new Error(error.message);
          sansCarte.delete(cleIntitule(homonyme.intitule));
          missionId = homonyme.id;
          relieeAvecExigences = true;
          bilan.reliees++;
          action = "relier"; missionReliee = homonyme.intitule;
        } else {
          if (simulation) missionId = `simulation:${carte.id}`;
          else {
            const { data, error } = await supabase.from("missions")
              .insert({ trello_carte_id: carte.id, texte_besoin: sansTJM(carte.desc) || carte.name, ...champs }).select("id").single();
            if (error || !data) throw new Error(error?.message ?? "mission non créée");
            missionId = data.id;
          }
          bilan.creees++;
          action = "creer";
        }
      } else if (existante && (existante.statut !== champs.statut || existante.trello_colonne !== champs.trello_colonne || existante.tjm !== champs.tjm
        || existante.intitule !== champs.intitule || (titre.client && existante.client !== titre.client))) {
        if (!simulation) {
          const { error } = await supabase.from("missions").update(champs).eq("id", missionId);
          if (error) throw new Error(error.message);
          if (existante.statut !== champs.statut) revalidateTag(`classement:${missionId}`, { expire: 0 });
        }
        bilan.misesAJour++;
        action = "mettre_a_jour";
      }

      // Texte lu par l'IA : description + pièce jointe (fiche de poste), sans les lignes de TJM.
      const piece = (carte.attachments ?? []).filter((a) => a.isUpload && /\.(pdf|docx)$/i.test(a.name) && (a.bytes ?? 0) <= 4 * 1024 * 1024)
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const signature = `${carte.name}\n${carte.desc}\n${piece ? `${piece.id}:${piece.date}` : ""}`;
      const empreinte = createHash("sha256").update(signature).digest("hex");
      const aLire = (existante?.trello_empreinte ?? null) !== empreinte && colonne.statut !== "fermee";
      plan.push({
        carte: carte.name, colonne: nomColonne ?? "", statut: colonne.statut, recruteur: colonne.recruteur, client: titre.client, intitule: champs.intitule,
        tjm: champs.tjm, action, missionReliee, pieceJointe: piece?.name ?? null, analyseIA: aLire, url: carte.shortUrl,
      });
      if (aLire && !simulation) {
        let texte = carte.desc;
        if (piece) {
          const contenu = await telechargerPieceJointe(carte.id, piece.id, piece.name);
          const extrait = contenu ? await extraireTexte(contenu, piece.name) : null;
          if (extrait?.extractible) texte = `${texte}\n\n${extrait.texte}`;
        }
        aAnalyser.push({ carte, missionId: missionId!, texte: sansTJM(`${carte.name}\n\n${texte}`).slice(0, 30_000), empreinte, titre, dejaRelieeAvecExigences: relieeAvecExigences });
      }
    } catch (e) {
      bilan.erreurs.push(`« ${carte.name.slice(0, 60)} » : ${(e as Error).message}`);
    }
  }

  // Simulation (aperçu) : rien n'est écrit, aucune lecture par l'IA.
  if (simulation) return { ...bilan, plan, analysees: 0, aAnalyserPlusTard: plan.filter((p) => p.analyseIA).length };

  // Cartes supprimées de Trello : la mission est fermée (elle reste consultable).
  for (const [id, m] of parCarte) {
    if (vues.has(id) || m.statut === "fermee") continue;
    const carteExiste = cartes.some((c) => c.id === id);
    if (carteExiste) continue; // carte dans une colonne ignorée
    await supabase.from("missions").update({ statut: "fermee", trello_colonne: "Supprimée de Trello" }).eq("id", m.id);
    bilan.fermees++;
  }

  // Lecture par l'IA (compétences, localisation, expérience), par petits groupes.
  const usages: UsageIA[] = [];
  const lot = aAnalyser.slice(0, ANALYSES_PAR_PASSAGE);
  bilan.aAnalyserPlusTard = aAnalyser.length - lot.length;
  for (let i = 0; i < lot.length; i += 4) {
    await Promise.all(lot.slice(i, i + 4).map(async (a) => {
      try {
        // Mission reliée qui a déjà ses exigences (réglées à la main) : on les garde, on note seulement l'empreinte.
        if (a.dejaRelieeAvecExigences) {
          const { count } = await supabase.from("mission_competences").select("competence_id", { count: "exact", head: true }).eq("mission_id", a.missionId);
          if (count) { await supabase.from("missions").update({ trello_empreinte: a.empreinte }).eq("id", a.missionId); return; }
        }
        const r = await extraireExigencesMission(a.texte);
        usages.push(...r.usages);
        const ex = r.donnees;
        const competences = ex.competences.filter((c) => c.nom.trim());
        const correspondance = await resoudreCompetences(supabase, competences.map((c) => c.nom));
        const lignes = new Map<string, { obligatoire: boolean; importance: number; annees_min: number | null }>();
        for (const c of competences) for (const id of correspondance.get(c.nom) ?? []) {
          const deja = lignes.get(id); // une compétence n'apparaît qu'une fois, même citée dans la description et la pièce jointe
          lignes.set(id, {
            obligatoire: c.obligatoire || !!deja?.obligatoire,
            importance: Math.min(3, Math.max(1, Math.max(c.importance, deja?.importance ?? 1))),
            annees_min: c.annees_min ?? deja?.annees_min ?? null,
          });
        }
        await supabase.from("mission_competences").delete().eq("mission_id", a.missionId);
        if (lignes.size) await supabase.from("mission_competences").insert([...lignes].map(([competence_id, v]) => ({ mission_id: a.missionId, competence_id, ...v })));
        await supabase.from("missions").update({
          texte_besoin: a.texte, exigences: { ...ex, competences }, modele: r.modele, prompt_version: r.promptVersion,
          localisation: ex.localisation, annees_min: ex.annees_min && ex.annees_min > 0 ? ex.annees_min : null, seniorite: ex.seniorite,
          date_debut: /^\d{4}-\d{2}-\d{2}$/.test(ex.date_debut ?? "") ? ex.date_debut : null,
          ...(a.titre.client ? {} : ex.client ? { client: ex.client } : {}),
          trello_empreinte: a.empreinte,
        }).eq("id", a.missionId);
        revalidateTag(`classement:${a.missionId}`, { expire: 0 });
        bilan.analysees++;
      } catch (e) {
        usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
        bilan.erreurs.push(`Analyse de « ${a.carte.name.slice(0, 60)} » : ${(e as Error).message}`);
      }
    }));
  }
  bilan.coutUSD = Math.round(usages.reduce((t, u) => t + u.cout_estime_usd, 0) * 1000) / 1000;
  await enregistrerUsages(usages, "mission:trello").catch(() => {});
  for (const t of ["accueil", "classements"]) revalidateTag(t, "max");
  return bilan;
}
