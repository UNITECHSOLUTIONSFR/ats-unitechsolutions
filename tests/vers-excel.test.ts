import { describe, expect, it } from "vitest";
import { lettreColonne } from "@/lib/sync/vers-excel";

describe("synchronisation ATS → Excel", () => {
  it.each([[1, "A"], [15, "O"], [26, "Z"], [27, "AA"], [52, "AZ"]])("colonne %i → %s", (n, l) => expect(lettreColonne(n)).toBe(l));
});
