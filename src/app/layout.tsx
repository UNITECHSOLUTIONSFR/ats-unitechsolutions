import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATS Unitech Solution",
  description: "Suivi et matching des consultants",
  robots: { index: false, follow: false },
  applicationName: "Unitech ATS",
  appleWebApp: { capable: true, title: "Unitech ATS", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png", icon: [{ url: "/icone-192.png", sizes: "192x192" }] },
  formatDetection: { telephone: false },
};

/** Téléphones : largeur de l'appareil, encoche et barre système respectées (iPhone, Android), zoom possible. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1a3f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
