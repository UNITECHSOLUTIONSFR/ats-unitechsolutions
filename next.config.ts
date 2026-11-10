import type { NextConfig } from "next";

// Configuration volontairement simple : toutes les pages sont calculées à la demande
// (outil interne, données toujours à jour), sans mécanisme de cache avancé.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // En-têtes de sécurité sur toutes les pages : pas d'affichage dans un cadre d'un autre site, HTTPS imposé,
  // pas de devinette du type de fichier, adresse de la page non transmise aux sites externes, caméra/micro/position coupés.
  async headers() {
    return [{
      source: "/:chemin*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      ],
    }];
  },
  // Import du fichier Excel de suivi : jusqu'à 4 Mo (limite d'une requête sur Vercel : 4,5 Mo).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
