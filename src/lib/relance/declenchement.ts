import "server-only";

/**
 * Fait avancer l'envoi d'une campagne lancée par un administrateur : appelle la tâche « relance » du site,
 * qui envoie quelques lots puis se relance elle-même tant qu'il reste des emails à envoyer.
 * Aucune tâche planifiée : tout part du clic « Lancer l'envoi » dans l'application.
 */
export async function poursuivreEnvoi(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const site = process.env.URL_SITE ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://ats-unitechsolutions.vercel.app");
  if (!secret) return;
  // On n'attend pas la fin (jusqu'à 5 minutes) : quelques secondes suffisent pour que l'appel soit pris en compte.
  await fetch(`${site}/api/cron/relance`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
}
