import { assignerMission } from "@/lib/missions/actions";
import type { Responsable } from "@/lib/missions/responsables";

/** Responsable d'une mission : liste de choix pour un administrateur, simple mention pour les autres. */
export default function ChoixResponsable({ missionId, responsableId, responsables, estAdmin, compact }: {
  missionId: string; responsableId: string | null; responsables: Responsable[]; estAdmin: boolean; compact?: boolean;
}) {
  const nom = responsables.find((r) => r.id === responsableId)?.nom;
  if (!estAdmin) {
    return nom
      ? <span className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">{nom}</span>
      : <span className="pastille pastille-orange">À assigner</span>;
  }
  return (
    <form action={assignerMission} className={`flex items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ${responsableId ? "ring-white/80" : "ring-amber-200"}`}>
      <input type="hidden" name="mission_id" value={missionId} />
      <select name="responsable_id" defaultValue={responsableId ?? ""} aria-label="Responsable de la mission"
        className={`rounded-full bg-transparent px-2 py-1 text-xs font-semibold outline-none ${responsableId ? "text-nuit" : "text-amber-700"} ${compact ? "max-w-40" : ""}`}>
        <option value="">À assigner</option>
        {responsables.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
      </select>
      <button className="rounded-full bg-nuit px-3 py-1 text-xs font-semibold text-white hover:bg-marque-700">OK</button>
    </form>
  );
}
