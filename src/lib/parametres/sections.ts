/** Sections de l'écran Paramètres (réservé aux administrateurs). */
export interface Section { href: string; titre: string; texte: string; groupe: "Équipe" | "Données" | "Automatisations" | "Conformité" }

export const SECTIONS: Section[] = [
  { href: "/parametres/utilisateurs", titre: "Utilisateurs et droits", texte: "Inviter l'équipe, choisir les rôles, retirer un accès en un clic.", groupe: "Équipe" },
  { href: "/parametres/import", titre: "Import du fichier Excel", texte: "Recharger le fichier de suivi complet (tous les onglets).", groupe: "Données" },
  { href: "/parametres/cv", titre: "CV SharePoint", texte: "CV Word et PDF anonymisés, rattachement manuel à une fiche.", groupe: "Données" },
  { href: "/parametres/analyse-cv", titre: "Analyse des CV", texte: "Lecture des CV par l'IA : compétences, expérience, résumé.", groupe: "Données" },
  { href: "/parametres/emails", titre: "Candidatures email", texte: "Emails reçus sur recrutement@ et ce que l'outil en a fait.", groupe: "Automatisations" },
  { href: "/parametres/synchronisations", titre: "Synchronisations", texte: "Excel, CV et emails : passages automatiques et lancement à la main.", groupe: "Automatisations" },
  { href: "/parametres/couts", titre: "Coûts et réglages", texte: "Dépenses d'IA du mois, plafond, pondérations du matching.", groupe: "Automatisations" },
  { href: "/parametres/rgpd", titre: "RGPD : purge à 24 mois", texte: "Personnes sans contact depuis 24 mois, export et effacement.", groupe: "Conformité" },
];
