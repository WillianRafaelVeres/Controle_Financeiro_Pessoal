import { AlertCircle, AlertTriangle, CheckCircle, Lightbulb } from "lucide-react";
import { cn } from "../../lib/utils";

interface Insight {
  tipo: "CRITICO" | "ATENCAO" | "BOM" | "INSIGHT";
  prioridade: number;
  mensagem: string;
  acao?: string;
}

interface InsightsPanelProps {
  insights: Insight[];
  isLoading?: boolean;
  className?: string;
}

export function InsightsPanel({ insights, isLoading = false, className }: InsightsPanelProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-md border border-slate-800 bg-[#111821] p-4", className)}>
        <p className="text-xs text-slate-500">Carregando insights...</p>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className={cn("rounded-md border border-slate-800 bg-[#111821] p-4", className)}>
        <p className="text-xs text-slate-500">Nenhum insight disponível</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 rounded-md border border-slate-800 bg-[#111821] p-4", className)}>
      <h3 className="text-[11px] font-semibold uppercase text-slate-300">Alertas e Insights</h3>

      {insights.map((insight, idx) => {
        let bgColor = "bg-slate-800/50";
        let borderColor = "border-slate-700";
        let textColor = "text-slate-100";
        let icon = null;

        if (insight.tipo === "CRITICO") {
          bgColor = "bg-red-500/10";
          borderColor = "border-red-600/30";
          textColor = "text-red-400";
          icon = <AlertCircle className="h-4 w-4 shrink-0" />;
        } else if (insight.tipo === "ATENCAO") {
          bgColor = "bg-amber-500/10";
          borderColor = "border-amber-600/30";
          textColor = "text-amber-400";
          icon = <AlertTriangle className="h-4 w-4 shrink-0" />;
        } else if (insight.tipo === "BOM") {
          bgColor = "bg-green-500/10";
          borderColor = "border-green-600/30";
          textColor = "text-green-400";
          icon = <CheckCircle className="h-4 w-4 shrink-0" />;
        } else if (insight.tipo === "INSIGHT") {
          bgColor = "bg-blue-500/10";
          borderColor = "border-blue-600/30";
          textColor = "text-blue-400";
          icon = <Lightbulb className="h-4 w-4 shrink-0" />;
        }

        return (
          <div
            key={idx}
            className={cn(
              "rounded border p-3 flex gap-3",
              bgColor,
              borderColor
            )}
          >
            {icon && <div className={cn("mt-0.5", textColor)}>{icon}</div>}
            <p className={cn("text-xs leading-relaxed", textColor)}>
              {insight.mensagem}
            </p>
          </div>
        );
      })}
    </div>
  );
}
