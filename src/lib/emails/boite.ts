import "server-only";
import { graphGet } from "@/lib/sharepoint";

/** Boîte réservée à l'outil : reçoit en copie (règle Exchange) tout ce qui est envoyé au groupe recrutement@. */
export const BOITE_CANDIDATURES = "ats-candidatures@unitechsolutions.fr";
/** Domaine interne : les emails envoyés par les collaborateurs ne sont jamais traités comme des candidatures. */
export const DOMAINE_INTERNE = "unitechsolutions.fr";

export interface MessageBoite {
  id: string;
  internetMessageId: string;
  subject: string | null;
  receivedDateTime: string;
  hasAttachments: boolean;
  webLink: string;
  conversationId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
}

export interface PieceJointe {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // base64
}

/** Messages reçus depuis une date (les plus anciens d'abord), en lecture seule. */
export async function messagesDepuis(depuis: string, limite: number): Promise<MessageBoite[]> {
  const filtre = encodeURIComponent(`receivedDateTime ge ${depuis}`);
  const champs = "id,internetMessageId,subject,receivedDateTime,hasAttachments,webLink,from,conversationId";
  const r = await graphGet<{ value: MessageBoite[] }>(
    `users/${BOITE_CANDIDATURES}/messages?$filter=${filtre}&$orderby=receivedDateTime asc&$top=${limite}&$select=${champs}`,
  );
  return r.value;
}

/** Pièces jointes de type CV (.docx, .doc, .pdf, 10 Mo au plus), contenu inclus. */
export async function piecesJointesCV(messageId: string): Promise<PieceJointe[]> {
  const r = await graphGet<{ value: (PieceJointe & { "@odata.type": string })[] }>(
    `users/${BOITE_CANDIDATURES}/messages/${messageId}/attachments`,
  );
  return r.value.filter(
    (p) => p["@odata.type"] === "#microsoft.graph.fileAttachment" && /\.(docx|doc|pdf)$/i.test(p.name) && p.size <= 10 * 1024 * 1024,
  );
}

export function estInterne(adresse: string | undefined): boolean {
  return !!adresse && adresse.toLowerCase().endsWith(`@${DOMAINE_INTERNE}`);
}
