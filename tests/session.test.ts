import { describe, expect, it } from "vitest";
import { dateConnexion, sessionExpiree } from "@/lib/securite/session";

const J = 86_400_000;
const maintenant = Date.parse("2026-11-16T09:00:00Z"); // un lundi
const amr = (joursAvant: number) => [{ method: "otp", timestamp: Math.floor((maintenant - joursAvant * J) / 1000) }];

describe("durée des sessions", () => {
  it("lit la date de connexion dans le jeton", () => {
    expect(dateConnexion([{ method: "otp", timestamp: 100 }, { method: "totp", timestamp: 200 }])).toBe(100_000);
    expect(dateConnexion(undefined)).toBeNull();
  });
  it("une pause ou un week-end ne déconnecte pas", () => {
    expect(sessionExpiree(amr(3), String(maintenant - 2 * 60_000), maintenant)).toBeNull();
    expect(sessionExpiree(amr(4), String(maintenant - 2.6 * J), maintenant)).toBeNull(); // vendredi soir → lundi matin
  });
  it("au-delà de 3 jours sans activité, ou de 7 jours depuis la connexion, on redemande", () => {
    expect(sessionExpiree(amr(5), String(maintenant - 3.5 * J), maintenant)).toBe("inactivite");
    expect(sessionExpiree(amr(8), String(maintenant - 60_000), maintenant)).toBe("duree");
  });
});
