/** Phrase lisible résumant le rapport d'une tâche (rapport du matin). */
export function resumerRapport(type: string, r: Record<string, unknown> | null): string {
  if (!r) return "—";
  if (r.erreur) return `Erreur : ${String(r.erreur)}`;
  const n = (v: unknown) => Number(v ?? 0);
  if (type === "synchro_excel") {
    const v = (r.versExcel ?? {}) as Record<string, unknown>;
    const ajout = n(v.ajoutees) ? `${n(v.ajoutees)} fiche(s) de l'ATS ajoutée(s) au fichier (ligne ${n(v.premiereLigne)}). ` : "";
    if (r.inchange) return `${ajout}Fichier Excel inchangé.`;
    const f = (r.fiches ?? {}) as Record<string, unknown>;
    return `${ajout}Excel relu : ${n(f.crees)} fiche(s) créée(s), ${n(f.misAJour)} mise(s) à jour, ${n(r.lignesTableau)} lignes dans le tableau.`;
  }
  if (type === "synchro_cv") {
    const s = (r.synchro ?? {}) as Record<string, unknown>;
    return `CV : ${n(s.nouveaux)} nouveau(x), ${n(s.modifies)} modifié(s), ${n(s.supprimes)} retiré(s), ${n(s.associes)} associé(s) à leur PDF, ${n(s.fichesReliees)} relié(s) à une fiche, ${n(s.fichesCreees)} fiche(s) créée(s). ${String(r.resultatsAnalyse ?? "")} ${String(r.envoiAnalyse ?? "")}`.trim();
  }
  if (type === "synchro_emails") {
    return `Emails : ${n(r.lus)} lu(s), ${n(r.candidatures)} candidature(s), ${n(r.ignores)} ignoré(s), coût ${n(r.coutUSD).toFixed(3)} $.`;
  }
  if (type === "sauvegarde_hebdo") return `Sauvegarde déposée dans SharePoint : ${String(r.fichier ?? "")} (${n(r.consultants)} consultants).`;
  return JSON.stringify(r).slice(0, 200);
}
