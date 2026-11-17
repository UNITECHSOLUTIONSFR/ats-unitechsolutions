/* Tests de bout en bout « comme un utilisateur » (Playwright) : chaque écran s'ouvre sans erreur, et les boutons
 * sans effet extérieur sont cliqués. Les boutons qui envoient un email, écrivent dans l'Excel d'origine, génèrent un
 * CV par l'IA ou suppriment des données réelles ne sont PAS déclenchés.
 * Une fiche « TEST E2E » est créée, modifiée puis effacée (droit à l'effacement).
 * Usage : node scripts/e2e.cjs <adresse du site> <admin|recruteur> [dossier des captures]
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] ?? "http://localhost:3100";
const ROLE = process.argv[3] ?? "admin";
const CAPTURES = process.argv[4];
const resultats = [];
const ok = (nom, detail = "") => { resultats.push({ ok: true, nom, detail }); console.log(`  ✓ ${nom}${detail ? ` — ${detail}` : ""}`); };
const ko = (nom, detail = "") => { resultats.push({ ok: false, nom, detail }); console.log(`  ✗ ${nom} — ${detail}`); };

(async () => {
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({ viewport: { width: 1400, height: 900 } });
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500 && r.url().startsWith(BASE)) erreurs.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`); });
  const etape = async (nom, f) => {
    const avant = erreurs.length;
    try { const d = await f(); if (erreurs.length > avant) ko(nom, erreurs.slice(avant).join(" | ").slice(0, 300)); else ok(nom, d ?? ""); }
    catch (e) { ko(nom, String(e.message ?? e).split("\n")[0].slice(0, 300)); }
  };
  const ouvrir = async (url) => {
    const t = Date.now();
    const r = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 90_000 });
    if (!r || r.status() >= 400) throw new Error(`statut ${r?.status()}`);
    if (await page.locator("text=/Application error|Erreur inattendue|This page could not be found/i").count()) throw new Error("page d'erreur affichée");
    return `${Date.now() - t} ms`;
  };
  const capture = async (nom) => { if (CAPTURES) await page.screenshot({ path: `${CAPTURES}/e2e-${ROLE}-${nom}.png` }); };

  console.log(`\n== Rôle : ${ROLE}`);
  const ECRANS = ["/", "/recherche", "/consultants", "/missions", "/missions?statut=chez_client&vue=toutes", "/alertes", "/emails", "/aide", "/statistiques", "/tableau", "/cv", "/consultants/nouveau"];
  const ADMIN = ["/parametres", "/parametres/activite", "/parametres/analyse-cv", "/parametres/couts", "/parametres/cv", "/parametres/echeances", "/parametres/emails", "/parametres/import", "/parametres/journal", "/parametres/rgpd", "/parametres/sante", "/parametres/securite", "/parametres/synchronisations", "/parametres/trello", "/parametres/utilisateurs"];
  for (const e of ECRANS) await etape(`Écran ${e}`, () => ouvrir(e));
  for (const e of ADMIN) {
    if (ROLE === "admin") await etape(`Écran ${e}`, () => ouvrir(e));
    else await etape(`Écran ${e} refusé au recruteur`, async () => {
      await page.goto(BASE + e, { waitUntil: "networkidle" });
      const refuse = !page.url().includes(e) || (await page.locator("text=/réservé|administrateur|non autorisé/i").count()) > 0;
      if (!refuse) throw new Error("écran administrateur accessible à un recruteur");
    });
  }

  // Consultants : recherche, filtre de colonne, tri, page suivante, sélection, fiche en panneau.
  await etape("Consultants : recherche « java »", async () => {
    await ouvrir("/consultants");
    await page.fill("input[placeholder^='Rechercher']", "java");
    await page.waitForResponse((r) => r.url().includes("/api/consultants/page"), { timeout: 20_000 });
    await page.waitForTimeout(400);
    return (await page.locator("h1 + p").first().innerText()).split("·")[0];
  });
  await etape("Consultants : filtre de colonne (Nom) et OK", async () => {
    await page.locator("thead th button").nth(1).click();
    await page.locator("text=Trier A → Z").waitFor({ timeout: 15_000 });
    await page.locator(".verre button:has-text('OK')").click();
  });
  await etape("Consultants : tri Z → A", async () => {
    await page.locator("thead th button").nth(0).click();
    await page.locator("text=Trier Z → A").click();
    await page.waitForResponse((r) => r.url().includes("/api/consultants/page"));
  });
  await etape("Consultants : panneau Filtres (disponibles maintenant)", async () => {
    await page.click("button:has-text('Filtres')");
    await page.click("text=Disponibles maintenant");
    await page.waitForResponse((r) => r.url().includes("/api/consultants/page"));
    await page.keyboard.press("Escape");
    await page.click("text=Tout effacer");
  });
  await etape("Consultants : page suivante", async () => {
    await page.click("text=Suivante →");
    await page.waitForResponse((r) => r.url().includes("/api/consultants/page"));
    return await page.locator("text=/Page \\d+ sur/").innerText();
  });
  await etape("Consultants : sélection de 2 lignes et barre d'actions", async () => {
    const cases = page.locator("tbody input[type=checkbox]");
    await cases.nth(0).check(); await cases.nth(1).check();
    await page.locator("text=2 ligne(s) sélectionnée(s)").waitFor();
    await page.click("button:has-text('Modifier une colonne')");
    await page.click("button:has-text('Annuler')");
    await page.click("text=Tout désélectionner");
  });
  await etape("Consultants : fiche dans le panneau", async () => {
    await page.locator("tbody tr td:nth-child(3)").first().click();
    await page.waitForTimeout(1500);
    await capture("panneau-fiche");
  });

  // Fiche consultant complète, missions, recherche.
  let ficheUrl = "";
  await etape("Fiche consultant (écran complet)", async () => {
    await ouvrir("/consultants");
    const lien = await page.locator("tbody a[href^='/consultants/'], tbody button[title='Ouvrir la fiche']").count();
    await page.goto(BASE + "/missions?vue=toutes", { waitUntil: "networkidle" });
    const m = await page.locator("a[href^='/missions/']").first().getAttribute("href");
    await ouvrir(m);
    ficheUrl = await page.locator("article a[href^='/consultants/']").first().getAttribute("href");
    const t = await ouvrir(ficheUrl.split("?")[0]);
    await capture("fiche");
    return `${t} (${lien} liens dans le tableau)`;
  });
  await etape("Fiche : enregistrer sans changement (aucune écriture)", async () => {
    await page.click("form button:has-text('Enregistrer')");
    await page.waitForLoadState("networkidle");
  });
  await etape("Missions : liste, onglets, vue « toutes »", async () => {
    await ouvrir("/missions");
    await page.click("text=Chez le client");
    await page.waitForLoadState("networkidle");
  });
  await etape("Mission : classement, profils suivants, bouton Recalculer", async () => {
    await page.goto(BASE + "/missions?vue=toutes", { waitUntil: "networkidle" });
    const m = await page.locator("a[href^='/missions/']").first().getAttribute("href");
    const t = await ouvrir(m);
    await capture("mission");
    if (await page.locator("text=Voir les profils suivants").count()) { await page.click("text=Voir les profils suivants"); await page.waitForLoadState("networkidle"); }
    await page.click("button:has-text('Recalculer')");
    await page.locator("text=Recalcul lancé").waitFor({ timeout: 15_000 });
    return t;
  });
  await etape("Recherche : phrase libre", async () => {
    await ouvrir("/recherche");
    const champ = page.locator("textarea, input[type=search], input[placeholder]").first();
    await champ.fill("chef de projet SAP à Paris");
    await champ.press("Enter");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
  });

  // Parcours complet sur une fiche de test : création, modification de toutes les cases, effacement.
  if (ROLE === "admin") {
    let idTest = "";
    await etape("Création d'une fiche TEST E2E", async () => {
      await ouvrir("/consultants/nouveau");
      await page.fill("input[name=prenom]", "Testeur");
      await page.fill("input[name=nom]", "E2E-A-EFFACER");
      await page.fill("input[name=email]", `e2e-${Date.now()}@tests.invalid`);
      await page.fill("input[name=intitule_poste]", "Testeur QA");
      await page.click("button:has-text('Créer la fiche')");
      await page.waitForURL(/\/consultants\/[0-9a-f-]{36}/, { timeout: 60_000 });
      idTest = page.url().match(/consultants\/([0-9a-f-]{36})/)[1];
      await page.waitForLoadState("networkidle");
      return idTest;
    });
    await etape("Fiche TEST : modification de toutes les cases", async () => {
      await page.fill("input[name=trigramme]", "TEE");
      await page.fill("input[name=telephone]", "0600000000");
      await page.fill("input[name=localisation]", "Paris");
      await page.fill("input[name=experience]", "5 ans");
      await page.fill("input[name=linkedin]", "https://linkedin.com/in/test");
      await page.fill("input[name=annees_experience]", "5");
      await page.selectOption("select[name=seniorite]", "confirme");
      await page.fill("textarea[name=resume]", "Profil de test automatique.");
      await page.fill("textarea[name=competences]", "Selenium, Jira");
      await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.click("form button:has-text('Enregistrer')")]);
      await page.waitForLoadState("networkidle");
      await page.reload({ waitUntil: "networkidle" });
      const tri = await page.locator("input[name=trigramme]").inputValue();
      const comps = await page.locator("textarea[name=competences]").inputValue();
      if (tri !== "TEE" || !/Selenium/i.test(comps)) throw new Error(`valeurs non enregistrées (trigramme=${tri}, compétences=${comps})`);
      await capture("fiche-test-modifiee");
      return `trigramme ${tri}, compétences : ${comps}`;
    });
    await etape("Fiche TEST : effacement (droit à l'effacement)", async () => {
      const r = await page.evaluate(async (id) => (await fetch(`/api/consultants/${id}/effacer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "TEE" }) })).status, idTest);
      if (r !== 200) throw new Error(`effacement refusé (statut ${r})`);
    });
  }

  await navigateur.close();
  const echecs = resultats.filter((r) => !r.ok);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} étapes réussies (${ROLE})`);
  process.exit(echecs.length ? 1 : 0);
})();
