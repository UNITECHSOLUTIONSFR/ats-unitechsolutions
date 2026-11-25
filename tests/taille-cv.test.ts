import { describe, expect, it } from "vitest";
import { messageCVTropLourd } from "@/lib/consultants/taille-cv";

describe("CV de plus de 4 Mo", () => {
  it("ne dit rien jusqu'à 4 Mo", () => expect(messageCVTropLourd(4 * 1024 * 1024)).toBeNull());
  it("donne la taille et la consigne au-delà", () =>
    expect(messageCVTropLourd(6.2 * 1024 * 1024)).toBe("Ce CV fait 6,2 Mo : 4 Mo maximum. Compressez-le (par exemple « Enregistrer en PDF réduit » ou un site de compression PDF), puis ajoutez-le de nouveau."));
});
