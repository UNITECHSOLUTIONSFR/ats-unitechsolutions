import { exigerUtilisateur } from "@/lib/acces";
import Recherche from "./recherche";

export const metadata = { title: "Recherche" };

/** Section « Recherche » : recherche en conversation, filtres et profils en cartes. */
export default async function PageRecherche() {
  await exigerUtilisateur();
  return <Recherche />;
}
