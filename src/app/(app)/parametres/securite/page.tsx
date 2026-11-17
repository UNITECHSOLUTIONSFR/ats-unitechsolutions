import Activation from "./activation";

// Toujours rendue à la demande : le contrôle « administrateur » du menu Paramètres est refait à chaque affichage.
export const dynamic = "force-dynamic";

/** Double authentification de l'administrateur connecté. */
export default function Securite() {
  return <Activation />;
}
