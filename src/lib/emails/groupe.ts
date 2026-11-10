import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enregistrerUsages } from "@/lib/ai/journal";
import type { UsageIA } from "@/lib/ai";
import { graphGet } from "@/lib/sharepoint";
import type { MessageBoite, PieceJointe } from "./boite";
import { traiterMessage, type BilanEmails } from "./traitement";

/**
 * Reprise ponctuelle de l'historique du groupe recrutement@ (lecture seule, droit Group.Read.All temporaire).
 * Chaque message passe par le même circuit que la boîte ATS : dédoublonnage, expéditeurs internes ignorés, IA seulement pour un CV nouveau.
 */
export const GROUPE_RECRUTEMENT = "recrutement@unitechsolutions.fr";
const ORIGINE = { driveId: `boite:groupe:${GROUPE_RECRUTEMENT}` };
const LIEN_GROUPE = "https://outlook.office.com/mail/group/unitechsolutions.fr/recrutement/inbox";

interface Post {
  id: string;
  receivedDateTime: string;
  hasAttachments: boolean;
  from?: MessageBoite["from"];
  attachments?: (PieceJointe & { "@odata.type": string })[];
}

export async function idGroupeRecrutement(): Promise<string> {
  const g = await graphGet<{ value: { id: string }[] }>(`groups?$filter=${encodeURIComponent(`mail eq '${GROUPE_RECRUTEMENT}'`)}&$select=id`);
  if (!g.value[0]) throw new Error("groupe recrutement introuvable");
  return g.value[0].id;
}

/** Traite les fils donnés, jusqu'à l'échéance ; renvoie les fils non traités pour l'appel suivant. */
export async function traiterFilsGroupe(
  supabase: SupabaseClient, fils: { id: string; topic?: string }[], echeance: number,
): Promise<BilanEmails & { filsRestants: string[] }> {
  const bilan: BilanEmails = { lus: 0, candidatures: 0, dejaConnues: 0, ignores: 0, erreurs: [], coutUSD: 0, restants: false };
  const usages: UsageIA[] = [];
  const gid = await idGroupeRecrutement();
  let i = 0;
  for (; i < fils.length && Date.now() < echeance; i++) {
    const f = fils[i];
    try {
      const posts = await graphGet<{ value: Post[] }>(`groups/${gid}/threads/${f.id}/posts?$select=id,receivedDateTime,hasAttachments,from&$expand=attachments`);
      const cles = posts.value.map((p) => `groupe:${p.id}`);
      const { data: connus } = await supabase.from("emails_entrants").select("message_id").in("message_id", cles);
      const vus = new Set((connus ?? []).map((c) => c.message_id));
      for (const p of posts.value) {
        if (vus.has(`groupe:${p.id}`)) continue;
        const m: MessageBoite = {
          id: p.id, internetMessageId: `groupe:${p.id}`, subject: f.topic ?? null, receivedDateTime: p.receivedDateTime,
          hasAttachments: p.hasAttachments, webLink: LIEN_GROUPE, from: p.from,
        };
        const cvs = (p.attachments ?? []).filter(
          (a) => a["@odata.type"] === "#microsoft.graph.fileAttachment" && /\.(docx|doc|pdf)$/i.test(a.name) && a.size <= 10 * 1024 * 1024,
        );
        await traiterMessage(supabase, m, async () => cvs, ORIGINE, usages, bilan);
      }
    } catch (e) {
      bilan.erreurs.push(`Fil ${f.topic ?? f.id} : ${(e as Error).message.slice(0, 200)}`);
    }
  }
  await enregistrerUsages(usages, ORIGINE.driveId);
  bilan.coutUSD = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
  return { ...bilan, restants: i < fils.length, filsRestants: fils.slice(i).map((f) => f.id) };
}
