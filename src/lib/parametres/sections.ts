/** Sections de l'écran Paramètres (réservé aux administrateurs). */
export interface Section { href: string; titre: string; texte: string; groupe: "Équipe" | "Données" | "Automatisations" | "Conformité"; icone: string }

/** Couleur de chaque thème (pastille d'icône et liseré). */
export const COULEURS: Record<Section["groupe"], { fond: string; texte: string; liseré: string }> = {
  "Équipe": { fond: "from-marque-500 to-marque-700", texte: "text-marque-600", liseré: "bg-marque-500" },
  "Données": { fond: "from-sky-400 to-cyan-600", texte: "text-sky-600", liseré: "bg-sky-500" },
  "Automatisations": { fond: "from-violet-400 to-indigo-600", texte: "text-violet-600", liseré: "bg-violet-500" },
  "Conformité": { fond: "from-emerald-400 to-teal-600", texte: "text-emerald-600", liseré: "bg-emerald-500" },
};

export const SECTIONS: Section[] = [
  { href: "/parametres/utilisateurs", titre: "Utilisateurs et droits", texte: "Inviter l'équipe, choisir les rôles, retirer un accès en un clic.", groupe: "Équipe", icone: "👥" },
  { href: "/parametres/securite", titre: "Double authentification", texte: "Protéger votre compte administrateur avec un code à 6 chiffres.", groupe: "Équipe", icone: "🔐" },
  { href: "/parametres/import", titre: "Import du fichier Excel", texte: "Recharger le fichier de suivi complet (tous les onglets).", groupe: "Données", icone: "📥" },
  { href: "/parametres/cv", titre: "CV SharePoint", texte: "CV Word et PDF anonymisés, rattachement manuel à une fiche.", groupe: "Données", icone: "📄" },
  { href: "/parametres/analyse-cv", titre: "Analyse des CV", texte: "Lecture des CV par l'IA : compétences, expérience, résumé.", groupe: "Données", icone: "✨" },
  { href: "/parametres/emails", titre: "Candidatures email", texte: "Emails reçus sur recrutement@ et ce que l'outil en a fait.", groupe: "Automatisations", icone: "✉️" },
  { href: "/parametres/sante", titre: "Bilan de santé", texte: "Tout tourne-t-il ? Derniers passages, erreurs, coûts, cas à vérifier.", groupe: "Automatisations", icone: "🩺" },
  { href: "/parametres/synchronisations", titre: "Synchronisations", texte: "Excel, CV et emails : passages automatiques et lancement à la main.", groupe: "Automatisations", icone: "🔄" },
  { href: "/parametres/couts", titre: "Coûts et réglages", texte: "Dépenses d'IA du mois, plafond, pondérations du matching.", groupe: "Automatisations", icone: "💶" },
  { href: "/parametres/rgpd", titre: "RGPD : purge à 24 mois", texte: "Personnes sans contact depuis 24 mois, export et effacement.", groupe: "Conformité", icone: "🛡️" },
  { href: "/parametres/journal", titre: "Journal d'accès", texte: "Qui a consulté, modifié, exporté ou supprimé quelle fiche, et quand.", groupe: "Conformité", icone: "📜" },
];
