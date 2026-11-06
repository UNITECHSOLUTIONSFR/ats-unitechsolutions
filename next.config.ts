import type { NextConfig } from "next";

// Configuration volontairement simple : toutes les pages sont calculées à la demande
// (outil interne, données toujours à jour), sans mécanisme de cache avancé.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
