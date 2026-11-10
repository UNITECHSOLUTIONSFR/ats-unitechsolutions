/**
 * Lit toutes les lignes d'une requête par pages de 1 000 (limite de Supabase), plusieurs pages à la fois.
 * `page(debut, fin)` construit la requête d'une page.
 */
export async function lireTout<T>(
  page: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  enParallele = 5,
): Promise<T[]> {
  const res: T[] = [];
  for (let bloc = 0; ; bloc += enParallele) {
    const pages = await Promise.all(
      Array.from({ length: enParallele }, (_, i) => page((bloc + i) * 1000, (bloc + i) * 1000 + 999)),
    );
    for (const p of pages) res.push(...(p.data ?? []));
    if (pages.some((p) => !p.data || p.data.length < 1000)) return res;
  }
}
