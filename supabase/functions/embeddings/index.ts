// Empreintes de sens (embeddings) avec le modèle gratuit intégré à Supabase (gte-small, 384 dimensions).
// Appelée uniquement par le serveur de l'outil (clé secrète) : reçoit des textes, renvoie un vecteur par texte.
// deno-lint-ignore-file no-explicit-any
const session = new (globalThis as any).Supabase.ai.Session("gte-small");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  const { textes } = await req.json().catch(() => ({ textes: [] }));
  if (!Array.isArray(textes) || textes.length > 16) return new Response("Entre 1 et 16 textes", { status: 400 });
  const vecteurs: number[][] = [];
  for (const t of textes) vecteurs.push(await session.run(String(t).slice(0, 2000), { mean_pool: true, normalize: true }));
  return Response.json({ vecteurs });
});
