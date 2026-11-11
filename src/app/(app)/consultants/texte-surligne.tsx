import { Fragment } from "react";

export interface ExtraitCV { extrait: string; source: string }

/** Extrait du CV où le mot cherché apparaît (balisé [[…]] par la base), mot surligné. */
export function TexteSurligne({ texte }: { texte: string }) {
  return <>« {texte.split(/(\[\[.*?\]\])/).map((m, i) => m.startsWith("[[")
    ? <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-nuit">{m.slice(2, -2)}</mark>
    : <Fragment key={i}>{m}</Fragment>)} »</>;
}
