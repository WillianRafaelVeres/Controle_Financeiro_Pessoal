import { Plug } from "lucide-react";

import { EmptyState } from "../components/finance/EmptyState";
import { SectionCard } from "../components/finance/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { Badge } from "../components/ui/badge";

export function IntegracoesPage() {
  return (
    <div className="space-y-2">
      <PageHeader title="Integrações" description="Arquitetura reservada para Open Finance e provedores de cotação, sem chamadas externas na V1." />
      <SectionCard title="Status das integrações">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {["Open Finance", "Brapi", "Alpha Vantage", "CoinGecko"].map((item) => (
            <div key={item} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-slate-100">{item}</span>
                <Badge>Desativado</Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">Nenhuma API externa é chamada sem configuração explícita.</p>
            </div>
          ))}
        </div>
      </SectionCard>
      <EmptyState icon={<Plug className="h-6 w-6" />} title="V1 local" description="A primeira versão controla, visualiza, planeja e confere dados locais." />
    </div>
  );
}
