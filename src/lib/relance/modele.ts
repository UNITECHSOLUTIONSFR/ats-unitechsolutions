/**
 * Relance des disponibilités : fonctions sans accès réseau (testées automatiquement).
 * - rendu du message personnalisé ;
 * - nettoyage d'une réponse (on ne garde que ce que le consultant a écrit, pas l'email cité) ;
 * - traduction de la lecture IA en mise à jour de la fiche.
 */
import type { ReponseDisponibilite } from "@/lib/ai/schemas";

/**
 * Envoi réel des emails : coupé tant qu'Exchange n'est pas branché (EMAILS_ENVOI_ACTIF absent).
 * Le module Email reste utilisable (destinataires, modèles, préparation) ; seul un administrateur lance un envoi.
 */
export const envoiActif = () => process.env.EMAILS_ENVOI_ACTIF === "1";

/** En dessous de ce niveau de certitude, la réponse n'est pas appliquée et passe en « à vérifier ». */
export const SEUIL_CONFIANCE = 0.6;

export const OBJET_PAR_DEFAUT = "Unitech Solutions – Êtes-vous disponible ?";
export const CORPS_PAR_DEFAUT = `Bonjour {prenom},

Nous mettons à jour notre vivier de consultants et serions ravis de pouvoir vous proposer de nouvelles missions.

Pourriez-vous simplement répondre à cet email en nous indiquant votre disponibilité ?
Par exemple : « disponible immédiatement », « disponible à partir du 15 janvier » ou « en mission jusqu'en mars ».

Merci par avance,
L'équipe recrutement Unitech Solutions`;

export interface Destinataire { prenom: string | null; nom: string | null }

/** Texte final d'un email : variables remplacées et mention de désinscription (obligatoire) ajoutée. */
export function rendreMessage(corps: string, d: Destinataire, lienDesinscription: string): string {
  const prenom = d.prenom && d.prenom !== "—" ? d.prenom : "";
  const texte = corps
    .replaceAll("{prenom}", prenom)
    .replaceAll("{nom}", d.nom ?? "")
    .replace(/Bonjour ,/g, "Bonjour,");
  return `${texte}\n\n—\nVous recevez cet email car votre profil figure dans le vivier de consultants d'Unitech Solutions.\nPour ne plus être contacté : ${lienDesinscription}`;
}

/** Version HTML simple (paragraphes, lien cliquable), échappée. */
export function versHTML(texte: string): string {
  const echappe = texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const liens = echappe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return liens.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("\n");
}

/** Ne garde que le texte écrit par le consultant : coupe à l'email cité et retire les lignes citées « > ». */
export function texteDeLaReponse(corps: string): string {
  const lignes = corps.replace(/\r/g, "").split("\n");
  const fin = lignes.findIndex((l) =>
    /^\s*(De|From)\s*:/i.test(l) || /^\s*-{2,}\s*(Original|Message d'origine)/i.test(l) || /^\s*Le .{5,80}a écrit\s*:?\s*$/i.test(l) || /^\s*On .{5,80}wrote:?\s*$/i.test(l));
  return (fin >= 0 ? lignes.slice(0, fin) : lignes).filter((l) => !/^\s*>/.test(l)).join("\n").trim();
}

export interface MiseAJourDispo {
  /** Champs de la fiche à écrire ; null = rien à appliquer (réponse à vérifier ou hors sujet). */
  fiche: Record<string, unknown> | null;
  statutEnvoi: "repondu" | "a_verifier" | "desinscrit";
  /** Texte de la colonne Disponibilité (tableau et fichier Excel). */
  texte: string | null;
}

const dateFR = (iso: string) => iso.split("-").reverse().join("/");

/** Traduit la lecture de l'IA en mise à jour automatique de la fiche (aucune validation manuelle). */
export function miseAJourDepuisReponse(r: ReponseDisponibilite, maintenant: Date): MiseAJourDispo {
  const iso = maintenant.toISOString();
  const aujourdhui = iso.slice(0, 10);
  if (r.situation === "plus_interesse") {
    return { fiche: { ne_plus_contacter: true, desinscrit_le: iso }, statutEnvoi: "desinscrit", texte: null };
  }
  if (r.situation === "pas_une_reponse" || r.confiance < SEUIL_CONFIANCE) return { fiche: null, statutEnvoi: "a_verifier", texte: null };
  const date = r.disponible_le && /^\d{4}-\d{2}-\d{2}$/.test(r.disponible_le) ? (r.disponible_le < aujourdhui ? aujourdhui : r.disponible_le) : null;
  const texte =
    r.situation === "disponible" || (date && date === aujourdhui) ? "Disponible immédiatement"
    : r.situation === "disponible_a_partir" && date ? `Disponible le ${dateFR(date)}`
    : r.texte_disponibilite?.trim() || (r.situation === "en_mission" ? "En mission" : null);
  if (!texte) return { fiche: null, statutEnvoi: "a_verifier", texte: null };
  return {
    fiche: { disponibilite: texte, disponible_le: r.situation === "en_mission" && !date ? null : date, disponibilite_maj_le: iso, dernier_contact_le: iso },
    statutEnvoi: "repondu",
    texte,
  };
}

export interface CandidatEnvoi { id: string; statut: string; intitule_poste: string | null; disponibilite: string | null; disponible_le: string | null; disponibilite_maj_le: string | null }
export interface CriteresEnvoi { statuts?: string[]; fonction?: string; dispoPlusVieilleQueJours?: number; disponibleAvant?: string; exclus?: string[] }

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Critères du module Email : statut, fonction ou compétence (tous les mots), disponibilité ancienne ou avant une date, exclusions. */
export function filtrerDestinataires<T extends CandidatEnvoi>(liste: T[], competences: Map<string, string>, f: CriteresEnvoi, maintenant: number): T[] {
  const mots = f.fonction ? sansAccents(f.fonction).split(/\s+/).filter(Boolean) : [];
  const limite = f.dispoPlusVieilleQueJours ? maintenant - f.dispoPlusVieilleQueJours * 86_400_000 : null;
  const exclus = new Set(f.exclus ?? []);
  return liste.filter((c) => {
    if (exclus.has(c.id)) return false;
    if (f.statuts?.length && !f.statuts.includes(c.statut)) return false;
    if (mots.length) {
      const texte = `${sansAccents(c.intitule_poste ?? "")} ${sansAccents(competences.get(c.id) ?? "")}`;
      if (!mots.every((m) => texte.includes(m))) return false;
    }
    if (limite && c.disponibilite_maj_le && Date.parse(c.disponibilite_maj_le) >= limite) return false;
    if (f.disponibleAvant) {
      const immediat = /imm[ée]diat|asap|^disponible$/i.test((c.disponibilite ?? "").trim());
      if (!immediat && !(c.disponible_le && c.disponible_le <= f.disponibleAvant)) return false;
    }
    return true;
  });
}
