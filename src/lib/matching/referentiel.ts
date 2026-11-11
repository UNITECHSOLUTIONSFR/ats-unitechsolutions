import { normaliserCompetence } from "@/lib/metier/texte";

export interface CompetenceReferentiel {
  id: string;
  nom_canonique: string;
  synonymes: string[]; // formes normalisées
}

/**
 * Familles de compétences : variantes ramenées à un seul nom (« ASP.NET MVC », « .NET 8 », « dotnet » → « .NET »).
 * Clé = forme réduite (voir cleFamille), valeur = nom affiché.
 */
const FAMILLES: Record<string, string> = {
  ".net": ".NET", "dotnet": ".NET", "asp.net": ".NET", "asp.net core": ".NET", "asp.net mvc": ".NET", "asp.net web api": ".NET",
  "asp.net webforms": ".NET", "asp.net web forms": ".NET", "ado.net": ".NET", ".net framework": ".NET", ".net core": ".NET",
  ".net maui": ".NET", "entity framework": "Entity Framework", "entity framework core": "Entity Framework",
  "vb.net": "VB.NET", "visual basic .net": "VB.NET",
  "c#": "C#", "csharp": "C#", "c sharp": "C#",
  "reactjs": "React", "react.js": "React", "react": "React", "react native": "React Native",
  "vuejs": "Vue.js", "vue.js": "Vue.js", "vue": "Vue.js",
  "angular": "Angular", "angular js": "AngularJS", "angularjs": "AngularJS",
  "nodejs": "Node.js", "node.js": "Node.js", "node": "Node.js",
  "javascript": "JavaScript", "js": "JavaScript", "ecmascript": "JavaScript", "typescript": "TypeScript", "ts": "TypeScript",
  "k8s": "Kubernetes", "kubernetes": "Kubernetes",
  "postgres": "PostgreSQL", "postgresql": "PostgreSQL",
  "sql server": "SQL Server", "ms sql server": "SQL Server", "microsoft sql server": "SQL Server", "mssql": "SQL Server", "ms sql": "SQL Server",
  "sql server management studio": "SQL Server", "ssms": "SQL Server",
  "aws": "AWS", "amazon web services": "AWS", "gcp": "GCP", "google cloud": "GCP", "google cloud platform": "GCP",
  "azure": "Azure", "microsoft azure": "Azure", "ms azure": "Azure",
  "html": "HTML", "html5": "HTML", "css": "CSS", "css3": "CSS",
  "java": "Java", "java se": "Java", "jee": "Java EE", "j2ee": "Java EE", "java ee": "Java EE", "jakarta ee": "Java EE",
  "spring boot": "Spring Boot", "springboot": "Spring Boot", "spring": "Spring",
  "python": "Python", "php": "PHP", "symfony": "Symfony", "laravel": "Laravel",
  "power bi": "Power BI", "powerbi": "Power BI", "ci/cd": "CI/CD", "ci cd": "CI/CD", "cicd": "CI/CD",
  "git": "Git", "docker": "Docker", "jenkins": "Jenkins", "terraform": "Terraform", "ansible": "Ansible",
  "scrum": "Scrum", "agile scrum": "Scrum", "methode scrum": "Scrum", "methodologie scrum": "Scrum",
  "agile": "Agile", "methode agile": "Agile", "methodes agiles": "Agile", "methodologie agile": "Agile",
  "pl/sql": "PL/SQL", "plsql": "PL/SQL", "t-sql": "T-SQL", "tsql": "T-SQL", "transact-sql": "T-SQL",
  "jira": "Jira", "confluence": "Confluence", "linux": "Linux", "windows server": "Windows Server",
  "rest": "API REST", "api rest": "API REST", "rest api": "API REST", "restful": "API REST", "api restful": "API REST", "webservices rest": "API REST", "web services rest": "API REST",
  "soap": "SOAP", "webservices soap": "SOAP", "web services soap": "SOAP",
  "mongodb": "MongoDB", "mongo": "MongoDB", "mysql": "MySQL", "oracle": "Oracle", "oracle database": "Oracle",
  "sap": "SAP", "salesforce": "Salesforce", "servicenow": "ServiceNow", "itil": "ITIL",
  "excel": "Excel", "microsoft excel": "Excel", "ms excel": "Excel",
};

/**
 * Forme réduite d'un nom de compétence : minuscules, sans accents, sans parenthèses ni numéro de version
 * (« Angular 18+ » → « angular », « Java 17 » → « java », « .NET 8 » → « .net », « HTML5 » → « html5 »).
 */
export function cleFamille(nom: string): string {
  let n = normaliserCompetence(nom).replace(/\([^)]*\)/g, " ");
  n = n.replace(/\b(version|v)\s*\d+(\.\d+)*\+?/g, " ").replace(/(^|\s)\d+(\.\d+|\.x)*\+?(?=\s|$)/g, " ");
  n = n.replace(/\s+/g, " ").replace(/^[\s\-–:;,]+|[\s\-–:;,]+$/g, "").trim();
  return n;
}

/** Nom de famille d'une compétence (« ASP.NET MVC » → « .NET »), ou null si elle n'appartient à aucune famille connue. */
export function familleDe(nom: string): string | null {
  const c = cleFamille(nom);
  return FAMILLES[c] ?? FAMILLES[c.replace(/[\s\-_]/g, "")] ?? null;
}

/**
 * Découpe un nom qui regroupe plusieurs compétences : « C# / .NET » → [« C# », « .NET »] ;
 * « Webservices REST et JSON » → [« Webservices REST », « JSON »]. Les sigles « CI/CD », « PL/SQL » restent entiers.
 */
export function decouperCompetence(nom: string): string[] {
  // Les parenthèses (« Firewalls (Palo Alto, Fortinet) ») ne sont pas découpées : elles précisent la compétence.
  if (/[()]/.test(nom)) return [nom.trim()];
  const parties = nom.split(/\s+\/\s+|\s*,\s*|\s*;\s*|\s+et\s+(?=[A-Z0-9.])|\s+&\s+/).map((p) => p.trim()).filter((p) => p.length > 0);
  return parties.length > 1 ? parties : [nom.trim()];
}

/**
 * Index « forme normalisée -> compétence » pour ramener « ReactJS », « react.js », « React »
 * à la même compétence, sans IA.
 */
export function indexerReferentiel(referentiel: CompetenceReferentiel[]): Map<string, CompetenceReferentiel> {
  const index = new Map<string, CompetenceReferentiel>();
  for (const c of referentiel) {
    index.set(normaliserCompetence(c.nom_canonique), c);
    for (const s of c.synonymes) index.set(normaliserCompetence(s), c);
  }
  // Familles et formes réduites : une variante retrouve la compétence principale.
  for (const c of referentiel) {
    const famille = familleDe(c.nom_canonique);
    if (famille && normaliserCompetence(famille) === normaliserCompetence(c.nom_canonique)) index.set(`famille:${normaliserCompetence(famille)}`, c);
    const cle = cleFamille(c.nom_canonique);
    if (!index.has(`cle:${cle}`)) index.set(`cle:${cle}`, c);
  }
  return index;
}

/** Retrouve une compétence du référentiel (nom exact, synonyme, famille, puis forme sans version), ou null si elle est nouvelle. */
export function resoudreCompetence(nom: string, index: Map<string, CompetenceReferentiel>): CompetenceReferentiel | null {
  const n = normaliserCompetence(nom);
  const famille = familleDe(nom);
  return (famille ? index.get(`famille:${normaliserCompetence(famille)}`) ?? index.get(normaliserCompetence(famille)) : undefined)
    ?? index.get(n) ?? index.get(n.replace(/[\s.\-_]/g, "")) ?? index.get(`cle:${cleFamille(nom)}`) ?? null;
}

/** Nom à enregistrer pour une nouvelle compétence : celui de sa famille, sinon le nom sans numéro de version. */
export function nomPourNouvelle(nom: string): string {
  const famille = familleDe(nom);
  if (famille) return famille;
  const sansVersion = nom.replace(/\([^)]*\)/g, " ").replace(/\b(version|v)\s*\d+(\.\d+)*\+?/gi, " ").replace(/(^|\s)\d+(\.\d+|\.x)*\+?(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  return sansVersion || nom.trim();
}

/** Familles de compétences citées dans un texte court (intitulé de mission) : « Développeur .NET / Angular » → [« .NET », « Angular »]. */
export function famillesDansTexte(texte: string): string[] {
  const mots = normaliserCompetence(texte).split(/[\s/,;()–\-|]+/).filter(Boolean);
  const trouvees = new Set<string>();
  for (let i = 0; i < mots.length; i++) {
    for (const n of [2, 1]) {
      const f = FAMILLES[mots.slice(i, i + n).join(" ")];
      if (f && !["Agile", "Scrum", "Excel", "Git", "Linux", "API REST"].includes(f)) trouvees.add(f);
    }
  }
  return [...trouvees];
}
