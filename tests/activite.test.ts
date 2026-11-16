import { describe, expect, it } from "vitest";
import { debutJourParis, jourParis } from "@/lib/activite/stats";

describe("Activité : journées à l'heure de Paris", () => {
  it("minuit à Paris en hiver (UTC+1) et en été (UTC+2)", () => {
    expect(debutJourParis(new Date("2026-11-16T10:00:00Z")).toISOString()).toBe("2026-11-15T23:00:00.000Z");
    expect(debutJourParis(new Date("2026-07-01T10:00:00Z")).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(jourParis("2026-11-15T23:30:00Z")).toBe("2026-11-16");
  });
});
