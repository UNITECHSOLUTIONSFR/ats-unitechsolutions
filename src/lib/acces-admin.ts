import "server-only";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/lib/acces";

/** Réservé aux administrateurs : renvoie à l'accueil sinon. */
export async function exigerAdmin() {
  const r = await exigerUtilisateur();
  if (r.utilisateur.role !== "admin") redirect("/");
  return r;
}
