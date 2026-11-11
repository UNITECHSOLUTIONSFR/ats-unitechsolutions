import { exigerUtilisateur } from "@/lib/acces";
import { profilsRecents } from "@/lib/recherche/moteur";
import Recherche from "./recherche";

export const metadata = { title: "Recherche" };

/** Section « Recherche » : dialogue en haut ; dès l'arrivée, filtres et profils récents ; puis classement selon la demande. */
export default async function PageRecherche() {
  const { supabase } = await exigerUtilisateur();
  const recents = await profilsRecents(supabase);
  return <Recherche recents={recents} />;
}
