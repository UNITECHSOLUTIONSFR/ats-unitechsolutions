import { exigerAdmin } from "@/lib/acces-admin";
import { modifierUtilisateur } from "@/lib/utilisateurs/actions";
import FormulaireAjout from "../formulaire-ajout";

export default async function Utilisateurs() {
  const { utilisateur, supabase } = await exigerAdmin();
  const { data: utilisateurs } = await supabase
    .from("utilisateurs")
    .select("id, email, nom_affiche, role, actif, created_at")
    .order("actif", { ascending: false })
    .order("email");

  return (
    <div className="space-y-4">
      <section className="carte p-5">
        <h2 className="font-semibold">Donner un accès</h2>
        <p className="text-sm text-zinc-500">
          <b>Administrateur</b> : tout, plus les paramètres, les utilisateurs, les imports et les suppressions.{" "}
          <b>Recruteur</b> : consulter, créer et modifier les fiches, matcher les missions.
        </p>
        <FormulaireAjout />
      </section>

      <section className="overflow-x-auto carte">
        <table className="w-full text-sm">
          <thead className="bg-white/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Personne</th><th className="p-3">Rôle</th><th className="p-3">Accès</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {(utilisateurs ?? []).map((u) => {
              const moi = u.id === utilisateur.id;
              return (
                <tr key={u.id} className={`border-t border-white/70 ${u.actif ? "" : "text-zinc-400"}`}>
                  <td className="p-3">
                    <div className="font-medium">{u.nom_affiche ?? u.email}{moi && " (vous)"}</div>
                    <div className="text-xs text-zinc-500">{u.email}</div>
                  </td>
                  <td className="p-3">
                    {moi ? (u.role === "admin" ? "Administrateur" : "Recruteur") : (
                      <form action={modifierUtilisateur} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="action" value="role" />
                        <select name="valeur" defaultValue={u.role} className="champ px-2 py-1 text-xs">
                          <option value="recruteur">Recruteur</option>
                          <option value="admin">Administrateur</option>
                        </select>
                        <button className="bouton-secondaire px-3 py-1 text-xs">OK</button>
                      </form>
                    )}
                  </td>
                  <td className="p-3">{u.actif ? "Actif" : "Retiré"}</td>
                  <td className="p-3 text-right">
                    {!moi && (
                      <form action={modifierUtilisateur}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="action" value="actif" />
                        <input type="hidden" name="valeur" value={String(!u.actif)} />
                        <button className={`rounded-lg px-3 py-1 text-xs ${u.actif ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-green-50 text-green-700 hover:bg-green-100"}`}>
                          {u.actif ? "Retirer l'accès" : "Rétablir l'accès"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
