/**
 * Références SharePoint du projet (non secrètes).
 * Le secret de l'application Entra est lu dans la variable d'environnement MS_CLIENT_SECRET, jamais ici.
 */
export const SHAREPOINT = {
  tenantId: "8198d0ba-4442-4cab-9367-0177ac7c53e8",
  clientId: "598431b6-1f0a-4744-ac75-391f3cf3b369",
  siteId:
    "unitechsolutions578.sharepoint.com,756ac4dc-8c49-4a55-b473-7d4a3a0136a4,8cb5cc74-d24f-4e43-8117-e5405752db48",
  /** Bibliothèque « Documents partagés » (nom interne Graph : « Documents » ou « Documents partagés »). */
  nomsBibliotheque: ["Documents partagés", "Documents", "Shared Documents"],
  /** Dossier racine des CV, un sous-dossier par métier. */
  dossierCV: "General/0 - Recrutement/Consultant/CV Consultants",
  /** Fichier Excel de suivi (Excel Online), synchronisé chaque nuit pendant la transition. */
  fichierSuivi: "General/0 - Recrutement/0 - Sourcing général/Sourcing_General_par_metier.xlsx",
} as const;

/** Texte envoyé à l'IA : tronqué à 30 000 caractères (règle de coût du brief). */
export const LONGUEUR_MAX_TEXTE_IA = 30_000;
/** En dessous de ce nombre de caractères utiles, le fichier est considéré comme scanné / illisible. */
export const SEUIL_TEXTE_EXTRACTIBLE = 200;
