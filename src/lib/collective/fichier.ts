/** Chemin du CV d'un candidat Collective dans l'espace privé de l'outil (null si le document n'en est pas un). */
export function cheminCVCollective(identifiant: string): string | null {
  const m = /^collective-cv:([A-Za-z0-9]+)$/.exec(identifiant);
  return m ? `collective/${m[1]}.pdf` : null;
}
