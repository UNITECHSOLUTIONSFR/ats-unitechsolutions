import type { NextConfig } from "next";

// Configuration volontairement simple : toutes les pages sont calculées à la demande
// (outil interne, données toujours à jour), sans mécanisme de cache avancé.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
