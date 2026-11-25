import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { graphTeleverser } from "@/lib/sharepoint/graph";

describe("dépôt SharePoint d'un gros fichier (plus de 4 Mo)", () => {
  it("envoie le fichier en morceaux de 3,75 Mo, sans jeton sur les morceaux", async () => {
    process.env.MS_CLIENT_SECRET = "essai";
    const appels: { url: string; init?: RequestInit }[] = [];
    const fauxFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "j", expires_in: 3600 }));
      if (url.includes("createUploadSession")) return new Response(JSON.stringify({ uploadUrl: "https://envoi.example/session" }));
      const plage = String((init?.headers as Record<string, string>)["Content-Range"]);
      const fin = Number(plage.split("-")[1].split("/")[0]) + 1, total = Number(plage.split("/")[1]);
      return fin === total ? new Response(JSON.stringify({ id: "x", webUrl: "https://sp/x", name: "cv.pdf" }), { status: 201 }) : new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;
    const contenu = Buffer.alloc(9 * 1024 * 1024, 1);
    const r = await graphTeleverser("drive", "Dossier/cv.pdf", contenu, "application/pdf", fauxFetch);
    expect(r.webUrl).toBe("https://sp/x");
    const morceaux = appels.filter((a) => a.url === "https://envoi.example/session");
    expect(morceaux).toHaveLength(3);
    expect(morceaux.map((m) => (m.init?.headers as Record<string, string>)["Content-Range"])).toEqual([
      "bytes 0-3932159/9437184", "bytes 3932160-7864319/9437184", "bytes 7864320-9437183/9437184"]);
    expect(morceaux.every((m) => !(m.init?.headers as Record<string, string>).Authorization)).toBe(true);
  });
});
