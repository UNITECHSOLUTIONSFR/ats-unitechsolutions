/**
 * Inventaire du dossier des CV (LECTURE SEULE) : un sous-dossier par métier,
 * nombre de .docx / .pdf / autres. Les noms de fichiers (données personnelles) sont écrits
 * dans le fichier passé en argument, jamais dans Git.
 * Usage : npx tsx scripts/inventaire-sharepoint.ts <sortie.json>
 */
import { writeFileSync } from "node:fs";
import { listerFichiersCV, trouverBibliotheque } from "../src/lib/sharepoint/graph";

async function main() {
  const sortie = process.argv[2];
  if (!sortie) throw new Error("Indiquer le fichier de sortie.");
  const driveId = await trouverBibliotheque();
  const fichiers = await listerFichiersCV(driveId);
  const parMetier = new Map<string, { docx: number; pdf: number; doc: number; autres: number }>();
  for (const f of fichiers) {
    const m = f.metier ?? "(racine)";
    const c = parMetier.get(m) ?? { docx: 0, pdf: 0, doc: 0, autres: 0 };
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext === "docx") c.docx++; else if (ext === "pdf") c.pdf++; else if (ext === "doc") c.doc++; else c.autres++;
    parMetier.set(m, c);
  }
  writeFileSync(sortie, JSON.stringify({ driveId, fichiers }, null, 1));
  console.table([...parMetier].sort().map(([metier, c]) => ({ metier, ...c })));
  console.log(`Total : ${fichiers.length} fichiers`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
