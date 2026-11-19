import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { champsParEntete, type ChampFiche } from "@/lib/import/excel";
import { formaterTelephone } from "@/lib/metier/telephone";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { graphEnvoyer, graphGet, graphTeleverser } from "@/lib/sharepoint";

/**
 * Une modification faite dans l'outil (fiche ou tableau) est répercutée partout (décision du 17/11/2026) :
 * - la ligne du tableau Consultants (copie de l'Excel) ;
 * - le fichier Excel de suivi d'origine : les cases sont écrites la nuit, EN REMPLAÇANT la valeur de l'Excel
 *   (sans cela, la relecture de l'Excel remettrait l'ancienne valeur) ;
 * - les fichiers SharePoint quand le nom ou le trigramme change (noms des CV, CV Unitech) ;
 * - le matching (empreinte de sens et classements recalculés automatiquement quand la fiche change).
 */

/** Valeur d'un champ de la fiche telle qu'elle s'écrit dans une case de l'Excel. */
export function valeurPourCase(champ: ChampFiche, f: Record<string, unknown>): string | undefined {
  const t = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  switch (champ) {
    case "prenom": return t(f.prenom === "—" ? "" : f.prenom);
    case "nom": return t(f.nom);
    case "nom_complet": return `${f.prenom === "—" ? "" : t(f.prenom)} ${t(f.nom)}`.trim();
    case "trigramme": return t(f.trigramme);
    case "email": return t(f.email);
    case "email_2": return t(f.email_2);
    case "telephone": return formaterTelephone(f.telephone_e164 as string | null) || t(f.telephone_brut);
    case "disponibilite": {
      const d = f.disponible_le as string | null;
      return d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : t(f.disponibilite);
    }
    case "intitule_poste": return t(f.intitule_poste);
    case "localisation": return t(f.localisation);
    case "notes": return t(f.notes);
    case "experience": return t(f.experience);
    case "tjm_salaire": return t(f.tjm_salaire);
    case "linkedin": return t(f.linkedin);
    case "cv_lien": return t(f.cv_lien);
    case "commentaire_email": return t(f.commentaire_email);
    default: return undefined; // statut, date de mise à jour : gérés par l'Excel lui-même
  }
}

/** Ajoute des cases à écrire dans l'Excel cette nuit, en remplaçant la valeur actuelle de l'Excel. */
export async function noterPourExcel(supabase: SupabaseClient, consultantId: string, cellules: Record<string, string>): Promise<void> {
  if (!Object.keys(cellules).length) return;
  const { data } = await supabase.from("consultants").select("excel_maj_en_attente").eq("id", consultantId).maybeSingle();
  const attente = ((data?.excel_maj_en_attente ?? {}) as { cellules?: Record<string, string>; ecraser?: string[] });
  await supabase.from("consultants").update({
    excel_maj_en_attente: {
      ...attente,
      cellules: { ...(attente.cellules ?? {}), ...cellules },
      ecraser: [...new Set([...(attente.ecraser ?? []), ...Object.keys(cellules)])],
    },
  }).eq("id", consultantId);
}

/**
 * Fiche modifiée : ligne du tableau mise à jour (colonnes de la fiche + colonnes libres), cases notées pour l'Excel.
 * `libres` : colonnes du tableau sans champ dédié (saisies sur la fiche).
 */
export async function repercuterFiche(supabase: SupabaseClient, consultantId: string, fiche: Record<string, unknown>, champsModifies: string[], libres: Record<string, string>): Promise<void> {
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes").eq("principal", true).maybeSingle();
  if (!onglet) return;
  const entetes = onglet.entetes as string[];
  const champs = champsParEntete(entetes, entetes);
  // Cases concernées : colonnes liées à un champ modifié (le nom complet suit le prénom et le nom), et colonnes libres modifiées.
  const cellules: Record<string, string> = {};
  for (const [entete, champ] of Object.entries(champs)) {
    const lie = champ === "nom_complet" ? champsModifies.includes("prenom") || champsModifies.includes("nom") : champ === "disponibilite"
      ? champsModifies.includes("disponibilite") || champsModifies.includes("disponible_le") : champ === "telephone" ? champsModifies.includes("telephone_e164") : champsModifies.includes(champ);
    if (!lie) continue;
    const v = valeurPourCase(champ, fiche);
    if (v !== undefined) cellules[entete] = v;
  }
  for (const [entete, v] of Object.entries(libres)) if (entetes.includes(entete)) cellules[entete] = v;
  if (!Object.keys(cellules).length) return;

  const { data: lignes } = await supabase.from("tableau_lignes").select("id, valeurs").eq("onglet_id", onglet.id).eq("consultant_id", consultantId);
  if (lignes?.length) {
    // Ligne de l'Excel : copie mise à jour tout de suite, et l'Excel d'origine cette nuit.
    for (const l of lignes) {
      const valeurs = { ...(l.valeurs as Record<string, string>) };
      for (const [e, v] of Object.entries(cellules)) { if (v) valeurs[e] = v; else delete valeurs[e]; }
      await supabase.from("tableau_lignes").update({ valeurs }).eq("id", l.id);
    }
    await noterPourExcel(supabase, consultantId, cellules);
  } else if (Object.keys(libres).length) {
    // Fiche pas encore dans l'Excel (elle y sera ajoutée entière la nuit) : colonnes libres gardées sur la fiche.
    const { data: f } = await supabase.from("consultants").select("colonnes_tableau").eq("id", consultantId).maybeSingle();
    const colonnes = { ...((f?.colonnes_tableau as Record<string, string> | null) ?? {}) };
    for (const [e, v] of Object.entries(libres)) { if (v) colonnes[e] = v; else delete colonnes[e]; }
    await supabase.from("consultants").update({ colonnes_tableau: colonnes }).eq("id", consultantId);
  }
}

const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Nom ou trigramme changé : fichiers SharePoint renommés (CV Word « Prénom Nom », PDF anonymisé « TRI », CV Unitech),
 * et le trigramme remplacé dans le CV Unitech (Word), dont le PDF est refait. Lancé après la réponse (quelques secondes).
 */
export async function renommerFichiers(consultantId: string, avant: { prenom: string; nom: string; trigramme: string }, apres: { prenom: string; nom: string; trigramme: string }): Promise<string[]> {
  const supabase = clientSupabaseAdmin();
  const journal: string[] = [];
  const nomAvant = `${avant.prenom === "—" ? "" : avant.prenom} ${avant.nom}`.trim(), nomApres = `${apres.prenom === "—" ? "" : apres.prenom} ${apres.nom}`.trim();
  const remplacer = (fichier: string) => {
    let n = fichier;
    if (nomAvant && nomAvant !== nomApres) n = n.replace(new RegExp(`(CV )${echapper(nomAvant)}( - )`, "i"), `$1${nomApres}$2`);
    if (avant.trigramme && avant.trigramme !== apres.trigramme) n = n.replace(new RegExp(`(CV )${echapper(avant.trigramme)}( - )`), `$1${apres.trigramme}$2`);
    return n;
  };
  const renommer = async (drive: string, item: string, ancien: string): Promise<{ name: string; webUrl: string } | null> => {
    const nouveau = remplacer(ancien);
    if (nouveau === ancien) return null;
    try {
      const r = await graphEnvoyer<{ name: string; webUrl: string }>("PATCH", `drives/${drive}/items/${item}`, { name: nouveau });
      journal.push(`${ancien} → ${r.name}`);
      return r;
    } catch (e) {
      journal.push(`${ancien} : renommage impossible (${(e as Error).message.slice(0, 80)})`);
      return null;
    }
  };

  // CV et PDF anonymisés rangés dans SharePoint (pas les pièces jointes d'emails encore dans la messagerie).
  const { data: docs } = await supabase.from("documents").select("id, nom_fichier, sharepoint_drive_id, sharepoint_item_id").eq("consultant_id", consultantId).eq("supprime_sharepoint", false);
  for (const d of docs ?? []) {
    if (String(d.sharepoint_drive_id).startsWith("boite:")) continue;
    const r = await renommer(d.sharepoint_drive_id, d.sharepoint_item_id, d.nom_fichier);
    if (r) await supabase.from("documents").update({ nom_fichier: r.name, url_web: r.webUrl }).eq("id", d.id);
  }

  // CV Unitech : fichiers renommés ; trigramme remplacé dans le Word, puis PDF refait à partir du Word.
  const { data: generes } = await supabase.from("cv_unitech_generes").select("id, drive_id, word_item_id, word_nom, pdf_nom, pdf_genere_le, dossier").eq("consultant_id", consultantId).not("word_item_id", "is", null);
  for (const g of generes ?? []) {
    const r = await renommer(g.drive_id, g.word_item_id, g.word_nom);
    if (r) await supabase.from("cv_unitech_generes").update({ word_nom: r.name, word_url: r.webUrl }).eq("id", g.id);
    if (g.pdf_nom && remplacer(g.pdf_nom) !== g.pdf_nom) {
      // PDF Unitech déjà produit : retrouvé par son chemin et renommé.
      try {
        const chemin = `${g.dossier}/${g.pdf_nom}`.split("/").map(encodeURIComponent).join("/");
        const pdf = await graphGet<{ id: string }>(`drives/${g.drive_id}/root:/${chemin}?$select=id`);
        const r2 = await renommer(g.drive_id, pdf.id, g.pdf_nom);
        if (r2) await supabase.from("cv_unitech_generes").update({ pdf_nom: r2.name, pdf_nom_prevu: r2.name, pdf_url: r2.webUrl }).eq("id", g.id);
      } catch {
        await supabase.from("cv_unitech_generes").update({ pdf_nom: remplacer(g.pdf_nom), pdf_nom_prevu: remplacer(g.pdf_nom) }).eq("id", g.id);
      }
    }
    if (avant.trigramme && avant.trigramme !== apres.trigramme) {
      try {
        const { default: JSZip } = await import("jszip");
        const contenu = await graphGet<Buffer>(`drives/${g.drive_id}/items/${g.word_item_id}/content`, { brut: true });
        const zip = await JSZip.loadAsync(contenu);
        const xml = await zip.file("word/document.xml")?.async("string");
        if (xml && new RegExp(`\\b${echapper(avant.trigramme)}\\b`).test(xml)) {
          zip.file("word/document.xml", xml.replace(new RegExp(`\\b${echapper(avant.trigramme)}\\b`, "g"), apres.trigramme));
          const nouveau = await zip.generateAsync({ type: "nodebuffer" });
          const { data: ligne } = await supabase.from("cv_unitech_generes").select("word_nom").eq("id", g.id).single();
          await graphTeleverser(g.drive_id, `${g.dossier}/${ligne!.word_nom}`, nouveau, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fetch, "replace");
          if (g.pdf_genere_le) {
            const { genererPDFUnitech } = await import("@/lib/cv-unitech/service");
            await genererPDFUnitech(supabase, g.id);
          }
          journal.push(`CV Unitech : trigramme ${avant.trigramme} → ${apres.trigramme}`);
        }
      } catch (e) {
        journal.push(`CV Unitech : mise à jour du trigramme impossible (${(e as Error).message.slice(0, 80)})`);
      }
    }
  }
  return journal;
}
