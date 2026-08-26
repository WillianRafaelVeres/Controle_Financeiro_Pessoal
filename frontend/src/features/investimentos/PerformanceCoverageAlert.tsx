import { AlertTriangle, Info } from "lucide-react";

interface PerformanceCoverageAlertProps {
  cobertura?: {
    completa: boolean;
    avisos: string[];
  };
}

export function PerformanceCoverageAlert({ cobertura }: PerformanceCoverageAlertProps) {
  if (!cobertura || (cobertura.completa && (!cobertura.avisos || cobertura.avisos.length === 0))) {
    return null;
  }

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="space-y-1">
        <p className="font-semibold text-amber-300">Aviso sobre cobertura histórica de dados:</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {cobertura.avisos.map((aviso, idx) => (
            <li key={idx}>{aviso}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
