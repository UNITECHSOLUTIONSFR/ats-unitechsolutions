import { expect, test } from "vitest";
import { normaliserTelephone as n } from "@/lib/metier/telephone";
test("nettoyage", () => {
  expect(n("‭07 83 18 26 36‬").e164).toBe("+33783182636");
  expect(n("‪+33 6 66 77 91 70‬").e164).toBe("+33666779170");
  expect(n("0652383022 / 0758663701").e164).toBe("+33652383022");
  expect(n("X").statut).toBe("vide"); expect(n("/").statut).toBe("vide"); expect(n("Non disponible").statut).toBe("vide");
  expect(n("216 23 214 674").statut).toBe("invalide"); expect(n("Maher").statut).toBe("invalide");
  expect(n("33612345678").e164).toBe("+33612345678"); expect(n("O6 12 34 56 78").e164).toBe("+33612345678");
});
