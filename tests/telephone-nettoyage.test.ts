import { expect, test } from "vitest";
import { normaliserTelephone as n } from "@/lib/metier/telephone";
test("nettoyage", () => {
  expect(n("‭07 83 18 26 36‬").e164).toBe("+33783182636");
  expect(n("‪+33 6 66 77 91 70‬").e164).toBe("+33666779170");
  expect(n("0652383022 / 0758663701").e164).toBe("+33652383022");
  expect(n("X").statut).toBe("vide"); expect(n("/").statut).toBe("vide"); expect(n("Non disponible").statut).toBe("vide");
  expect(n("216 23 214 674").e164).toBe("+21623214674"); expect(n("+212 654-967564").e164).toBe("+212654967564");
  expect(n("+1 954-233-0254").e164).toBe("+19542330254"); expect(n("Maher").statut).toBe("invalide");
  expect(n("06 33 43 49 17 35").statut).toBe("invalide");
  expect(n("00221775670993").e164).toBe("+221775670993"); expect(n("(+237) 698518809").e164).toBe("+237698518809");
  expect(n("33612345678").e164).toBe("+33612345678"); expect(n("O6 12 34 56 78").e164).toBe("+33612345678");
});
