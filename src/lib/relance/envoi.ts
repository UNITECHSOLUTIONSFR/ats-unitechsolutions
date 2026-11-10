import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BOITE_CANDIDATURES } from "@/lib/emails/boite";
import { graphEnvoyer } from "@/lib/sharepoint";
import { lireTout } from "@/lib/supabase/pages";
import { rendreMessage, versHTML } from "./modele";

/** Nom affiché de l'expéditeur. Les réponses reviennent dans la boîte de l'outil, qui les lit. */
export const EXPEDITEUR = { nom: "Unitech Solutions – Recrutement", adresse: BOITE_CANDIDATURES };
/** Rythme d'envoi : Exchange accepte 30 messages par minute et par boîte ; on reste en dessous. */
export const ENVOIS_PAR_MINUTE = 25;

export interface FiltreCampagne {
  statuts?: string[];                // ex. ["candidat", "consultant"] ; vide = tous sauf inactifs
  fonction?: string;                 // mot cherché dans l'intitulé de poste ou les compétences (ex. « java », « chef de projet »)
  dispoPlusVieilleQueJours?: number; // seulement les disponibilités non mises à jour depuis N jours
  disponibleAvant?: string;          // AAAA-MM-JJ : disponibles (ou bientôt) avant cette date
  exclus?: string[];                 // consultants décochés à la main
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Consultants à contacter : email valide, pas désinscrits, pas inactifs, critères appliqués. */
export async function destinatairesCampagne(supabase: SupabaseClient, filtre: FiltreCampagne) {
  const [tous, competences] = await Promise.all([
    lireTout<{ id: string; prenom: string; nom: string; email: string; statut: string; intitule_poste: string | null; disponibilite: string | null; disponible_le: string | null; disponibilite_maj_le: string | null }>((a, b) =>
      supabase.from("consultants").select("id, prenom, nom, email, statut, intitule_poste, disponibilite, disponible_le, disponibilite_maj_le")
        .not("email", "is", null).eq("ne_plus_contacter", false).neq("statut", "inactif").order("nom").range(a, b)),
    filtre.fonction ? lireTout<{ consultant_id: string; competences: string }>((a, b) => supabase.from("competences_par_consultant").select("consultant_id, competences").range(a, b)) : Promise.resolve([]),
  ]);
  const comp = new Map(competences.map((c) => [c.consultant_id, sansAccents(c.competences)]));
  const mots = filtre.fonction ? sansAccents(filtre.fonction).split(/\s+/).filter(Boolean) : [];
  const limite = filtre.dispoPlusVieilleQueJours ? Date.now() - filtre.dispoPlusVieilleQueJours * 86_400_000 : null;
  const exclus = new Set(filtre.exclus ?? []);
  return tous.filter((c) => {
    if (exclus.has(c.id)) return false;
    if (filtre.statuts?.length && !filtre.statuts.includes(c.statut)) return false;
    if (mots.length) {
      const texte = `${sansAccents(c.intitule_poste ?? "")} ${comp.get(c.id) ?? ""}`;
      if (!mots.every((m) => texte.includes(m))) return false;
    }
    if (limite && c.disponibilite_maj_le && Date.parse(c.disponibilite_maj_le) >= limite) return false;
    if (filtre.disponibleAvant) {
      const immediat = /imm[ée]diat|asap|disponible$/i.test(c.disponibilite ?? "");
      if (!immediat && !(c.disponible_le && c.disponible_le <= filtre.disponibleAvant)) return false;
    }
    return true;
  });
}

/** Prépare une campagne : un envoi « à envoyer » par destinataire. Rien n'est envoyé ici. */
export async function preparerCampagne(supabase: SupabaseClient, p: { objet: string; corps: string; type: "disponibilite" | "libre"; filtre: FiltreCampagne; par: string }) {
  const dest = await destinatairesCampagne(supabase, p.filtre);
  const { data: c, error } = await supabase.from("campagnes_relance")
    .insert({ objet: p.objet, corps: p.corps, type: p.type, filtre: p.filtre, nb_destinataires: dest.length, cree_par: p.par }).select("id").single();
  if (error || !c) throw new Error(error?.message ?? "Campagne non créée");
  for (let i = 0; i < dest.length; i += 500) {
    const { error: e } = await supabase.from("envois_relance").insert(dest.slice(i, i + 500).map((d) => ({ campagne_id: c.id, consultant_id: d.id, email: d.email })));
    if (e) throw new Error(e.message);
  }
  return { id: c.id as string, destinataires: dest.length };
}

/**
 * Envoie le lot suivant d'une campagne lancée (appelé chaque minute par la tâche « relance »).
 * Chaque email est créé en brouillon (pour connaître son identifiant de fil), puis envoyé depuis la boîte de l'outil.
 */
export async function envoyerLot(supabase: SupabaseClient, urlSite: string, limite = ENVOIS_PAR_MINUTE) {
  const { data: campagnes } = await supabase.from("campagnes_relance").select("id, objet, corps").eq("statut", "en_cours");
  const bilan = { envoyes: 0, erreurs: 0, termines: 0 };
  for (const c of campagnes ?? []) {
    const { data: envois } = await supabase.from("envois_relance")
      .select("id, email, jeton_desinscription, consultants(prenom, nom, ne_plus_contacter)")
      .eq("campagne_id", c.id).eq("statut", "a_envoyer").limit(limite - bilan.envoyes);
    if (!envois?.length) {
      await supabase.from("campagnes_relance").update({ statut: "terminee" }).eq("id", c.id);
      bilan.termines++;
      continue;
    }
    for (const e of envois) {
      const personne = e.consultants as unknown as { prenom: string; nom: string; ne_plus_contacter: boolean } | null;
      if (!personne || personne.ne_plus_contacter) {
        await supabase.from("envois_relance").update({ statut: "desinscrit" }).eq("id", e.id);
        continue;
      }
      try {
        const texte = rendreMessage(c.corps, personne, `${urlSite}/desinscription/${e.jeton_desinscription}`);
        const brouillon = await graphEnvoyer<{ id: string; internetMessageId: string; conversationId: string }>("POST", `users/${EXPEDITEUR.adresse}/messages`, {
          subject: c.objet,
          body: { contentType: "HTML", content: versHTML(texte) },
          toRecipients: [{ emailAddress: { address: e.email } }],
          from: { emailAddress: { address: EXPEDITEUR.adresse, name: EXPEDITEUR.nom } },
        });
        await graphEnvoyer("POST", `users/${EXPEDITEUR.adresse}/messages/${brouillon.id}/send`, {});
        await supabase.from("envois_relance").update({
          statut: "envoye", envoye_le: new Date().toISOString(), message_id: brouillon.id,
          internet_message_id: brouillon.internetMessageId, conversation_id: brouillon.conversationId, erreur: null,
        }).eq("id", e.id);
        bilan.envoyes++;
      } catch (err) {
        await supabase.from("envois_relance").update({ statut: "erreur", erreur: (err as Error).message.slice(0, 300) }).eq("id", e.id);
        bilan.erreurs++;
      }
    }
    if (bilan.envoyes >= limite) break;
  }
  return bilan;
}
