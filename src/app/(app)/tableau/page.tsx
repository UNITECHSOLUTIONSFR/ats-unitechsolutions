import { redirect } from "next/navigation";

/** Ancienne adresse du tableau de suivi : l'écran unique est désormais « Consultants ». */
export default function AncienTableau() {
  redirect("/consultants");
}
