import { redirect } from "next/navigation";

/** Ancienne adresse : l'écran des CV SharePoint est désormais dans Paramètres (réservé aux administrateurs). */
export default function AncienneAdresseCV() {
  redirect("/parametres/cv");
}
