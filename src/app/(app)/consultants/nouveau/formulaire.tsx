"use client";

import { useActionState, useState } from "react";
import { creerConsultant, type EtatCreation } from "@/lib/consultants/actions";
import { calculerTrigramme } from "@/lib/metier/trigramme";

/** Nouvelle fiche : les mêmes colonnes que le fichier Excel de suivi, dans le même ordre, et le CV en pièce jointe. */
export default function Formulaire() {
  const [etat, action, enCours] = useActionState<EtatCreation, FormData>(creerConsultant, {});
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [trigramme, setTrigramme] = useState<string | null>(null); // null = calculé automatiquement
  const [fichier, setFichier] = useState("");
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const trigrammeAuto = calculerTrigramme(prenom, nom);

  return (
    <form action={action} className="carte grid gap-3 p-5 text-sm sm:grid-cols-2">
      <p className="rounded-xl bg-marque-50 px-3 py-2 text-sm text-marque-800 sm:col-span-2">
        Astuce : joignez le CV (en bas) et laissez les champs vides : l&apos;outil les remplit à partir du CV. Ce que vous saisissez reste prioritaire.
      </p>
      <Champ nom="prenom" libelle="Prénoms" valeur={prenom} onChange={setPrenom} />
      <Champ nom="nom" libelle={fichier ? "Nom" : "Nom *"} valeur={nom} onChange={setNom} requis={!fichier} />
      <label className="block">
        <span className="text-zinc-600">Trigramme <span className="text-xs text-slate-400">(calculé, modifiable)</span></span>
        <input name="trigramme" value={trigramme ?? (nom ? trigrammeAuto : "")} placeholder={fichier ? "calculé depuis le CV" : ""} onChange={(e) => setTrigramme(e.target.value.toUpperCase().slice(0, 4))} className="champ mt-1 w-full font-mono" />
      </label>
      <Champ nom="email" libelle="Email" type="email" />
      <Champ nom="telephone" libelle="Téléphone" type="tel" />
      <Champ nom="intitule_poste" libelle="Métier" />
      <Champ nom="experience" libelle="Expérience" placeholder="Ex. 8 ans" />
      <Champ nom="tjm_salaire" libelle="TJM / Salaire" placeholder="Ex. 550 €/j ou 55 k€" />
      <label className="block">
        <span className="text-zinc-600">Statut</span>
        <select name="statut" defaultValue="candidat" className="champ mt-1 w-full">
          <option value="candidat">Candidat</option>
          <option value="consultant">Consultant</option>
          <option value="inactif">Inactif</option>
        </select>
      </label>
      <Champ nom="disponibilite" libelle="Disponibilité" placeholder="Ex. immédiate, 1 mois de préavis" />
      <Champ nom="date_maj" libelle="Date de mise à jour" type="date" defaut={aujourdHui} />
      <Champ nom="localisation" libelle="Localisation" />
      <Champ nom="linkedin" libelle="LinkedIn" type="url" placeholder="https://www.linkedin.com/in/…" />
      <label className="block sm:col-span-2">
        <span className="text-zinc-600">Notes</span>
        <textarea name="notes" rows={3} className="champ mt-1 w-full" />
      </label>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-marque-200 bg-white/60 px-4 py-4 transition hover:border-marque-400 hover:bg-white sm:col-span-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-marque-50 text-lg text-marque-600">📎</span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-nuit">{fichier || "CV (pièce jointe)"}</span>
          <span className="block text-xs text-slate-500">PDF ou Word · 4 Mo maximum · rangé dans SharePoint et analysé (compétences)</span>
        </span>
        <input type="file" name="cv" accept=".pdf,.docx,.doc" className="sr-only" onChange={(e) => setFichier(e.target.files?.[0]?.name ?? "")} />
      </label>
      <div className="sm:col-span-2">
        <button disabled={enCours} className="bouton-primaire">{enCours ? (fichier ? "Création et lecture du CV…" : "Création…") : "Créer la fiche"}</button>
        {etat.erreur && <p className="mt-2 text-red-700">{etat.erreur}</p>}
      </div>
    </form>
  );
}

function Champ({ nom, libelle, type = "text", requis, placeholder, valeur, onChange, defaut }: {
  nom: string; libelle: string; type?: string; requis?: boolean; placeholder?: string; valeur?: string; onChange?: (v: string) => void; defaut?: string;
}) {
  return (
    <label className="block">
      <span className="text-zinc-600">{libelle}</span>
      <input name={nom} type={type} required={requis} placeholder={placeholder} className="champ mt-1 w-full"
        {...(onChange ? { value: valeur ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue: defaut })} />
    </label>
  );
}
