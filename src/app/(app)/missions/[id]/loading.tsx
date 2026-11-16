import { AttentePage } from "../../attente";

export default function Chargement() {
  return <AttentePage messages={["Je relis la mission…", "Je compare la mission avec vos consultants…", "L'IA lit les meilleurs profils…", "Je classe les profils, presque prêt…"]}
    sousTitre="Quelques secondes la première fois ; ensuite, la mission s'ouvre instantanément." />;
}
