import { exigerAdmin } from "@/lib/acces-admin";
import FilParametres from "./fil";

export default async function LayoutParametres({ children }: { children: React.ReactNode }) {
  await exigerAdmin();
  // Le module Email a sa propre entrée dans le menu ; il reste listé ici pour le fil d'Ariane.
  return (
    <div className="space-y-6">
      <FilParametres extra={[]} />
      {children}
    </div>
  );
}
