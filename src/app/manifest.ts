import type { MetadataRoute } from "next";

/** Installation sur l'écran d'accueil du téléphone (iPhone, Android) : l'outil s'ouvre comme une application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ATS Unitech Solutions",
    short_name: "Unitech ATS",
    description: "Suivi et matching des consultants",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fb",
    theme_color: "#0b1a3f",
    lang: "fr",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-masquable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
