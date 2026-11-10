import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Vérifie « Authorization: Bearer <CRON_SECRET> » en temps constant (pas de devinette caractère par caractère). */
export function autorisationTachesValide(entete: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !entete) return false;
  const a = Buffer.from(entete), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
