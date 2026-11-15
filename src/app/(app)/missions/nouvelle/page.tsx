import { redirect } from "next/navigation";

// Les missions sont créées et suivies dans Trello, qui fait foi : l'outil les lit toutes les heures (lecture seule).
// L'ancienne saisie d'une mission dans l'outil n'est plus proposée ; l'adresse renvoie vers la liste des missions.
export default function NouvelleMission() {
  redirect("/missions");
}
