"use client";

import { useEffect, useState } from "react";
import { clientNavigateur } from "@/lib/supabase/navigateur";

interface Facteur { id: string; friendly_name?: string; status: string; created_at: string }

/** Activer (ou retirer) la double authentification : QR code à scanner, puis code de confirmation. */
export default function Activation() {
  const [facteurs, setFacteurs] = useState<Facteur[] | null>(null);
  const [enrolement, setEnrolement] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = async () => {
    const { data } = await clientNavigateur().auth.mfa.listFactors();
    setFacteurs((data?.totp ?? []) as Facteur[]);
  };
  useEffect(() => {
    let actif = true;
    clientNavigateur().auth.mfa.listFactors().then(({ data }) => { if (actif) setFacteurs((data?.totp ?? []) as Facteur[]); });
    return () => { actif = false; };
  }, []);
  const actifs = (facteurs ?? []).filter((f) => f.status === "verified");

  async function commencer() {
    setMessage(null);
    const supabase = clientNavigateur();
    // Un essai précédent non terminé est retiré avant d'en commencer un nouveau.
    for (const f of (facteurs ?? []).filter((x) => x.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `ATS ${new Date().toLocaleDateString("fr-FR")}` });
    if (error || !data) { setMessage({ ok: false, texte: "Activation impossible pour le moment." }); return; }
    setEnrolement({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function confirmer() {
    if (!enrolement) return;
    const { error } = await clientNavigateur().auth.mfa.challengeAndVerify({ factorId: enrolement.id, code: code.replace(/\s/g, "") });
    if (error) { setMessage({ ok: false, texte: "Code incorrect : réessayez avec le code affiché maintenant." }); return; }
    setEnrolement(null); setCode("");
    setMessage({ ok: true, texte: "Double authentification activée. Elle sera demandée à chaque nouvelle connexion." });
    charger();
  }
  async function retirer(id: string) {
    const { error } = await clientNavigateur().auth.mfa.unenroll({ factorId: id });
    setMessage(error ? { ok: false, texte: "Retrait impossible : reconnectez-vous avec votre code, puis réessayez." } : { ok: true, texte: "Double authentification retirée." });
    charger();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="carte space-y-4 p-6 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-nuit">Votre compte</div>
            <p className="text-slate-500">En plus du lien de connexion, un code à 6 chiffres d&apos;une application (Microsoft Authenticator, Google Authenticator…) est demandé.</p>
          </div>
          {facteurs && <span className={`pastille ${actifs.length ? "pastille-vert" : "pastille-orange"}`}>{actifs.length ? "Activée" : "Non activée"}</span>}
        </div>
        {actifs.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-xl bg-white/70 px-4 py-2 ring-1 ring-white/80">
            <span className="text-nuit">{f.friendly_name ?? "Application d'authentification"} · ajoutée le {new Date(f.created_at).toLocaleDateString("fr-FR")}</span>
            <button type="button" onClick={() => retirer(f.id)} className="text-xs text-slate-400 hover:text-red-700">Retirer</button>
          </div>
        ))}
        {!actifs.length && !enrolement && <button type="button" onClick={commencer} className="bouton-primaire">Activer la double authentification</button>}
        {enrolement && (
          <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR code fourni par Supabase (image SVG) */}
            <img src={enrolement.qr} alt="QR code à scanner" className="h-44 w-44 rounded-xl bg-white p-2 ring-1 ring-slate-200" />
            <div className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-slate-600">
                <li>Ouvrez votre application d&apos;authentification et scannez ce QR code.</li>
                <li>Saisissez le code à 6 chiffres qu&apos;elle affiche.</li>
              </ol>
              <p className="text-xs text-slate-400">Pas de caméra ? Clé à saisir : <span className="font-mono">{enrolement.secret}</span></p>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={7} placeholder="000000" className="champ w-36 text-center tracking-[0.3em]" aria-label="Code" />
                <button type="button" onClick={confirmer} disabled={code.replace(/\s/g, "").length !== 6} className="bouton-primaire">Confirmer</button>
              </div>
            </div>
          </div>
        )}
        {message && <p className={message.ok ? "text-emerald-700" : "text-red-700"}>{message.texte}</p>}
      </div>
      <p className="text-xs text-slate-500">Une fois activée, la double authentification est exigée pour tout l&apos;outil sur ce compte. En cas de perte du téléphone, un autre administrateur peut vous aider (ou contactez le support Supabase).</p>
    </div>
  );
}
