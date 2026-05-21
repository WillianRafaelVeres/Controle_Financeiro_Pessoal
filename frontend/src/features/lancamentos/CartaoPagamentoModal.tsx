import { CreditCard } from "lucide-react";
import { useEffect, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { formatMoney } from "../../lib/formatters";

interface CartaoPagamentoModalProps {
  open: boolean;
  valorTotal: number;
  initialCartaoId?: string;
  onClose: () => void;
  onConfirm: (payload: {
    cartao_id: string;
    valor_separado_agora: number;
  }) => void;
}

export function CartaoPagamentoModal({ open, valorTotal, initialCartaoId, onClose, onConfirm }: CartaoPagamentoModalProps) {
  const [separado, setSeparado] = useState("");
  const [futuro, setFuturo] = useState("");
  const valorSeparado = Number(separado || 0);
  const valorFuturo = Number(futuro || 0);
  const totalInformado = valorSeparado + valorFuturo;
  const diferenca = valorTotal - totalInformado;
  const valoresValidos = valorSeparado >= 0 && valorFuturo >= 0;
  const totalConfere = Math.abs(diferenca) < 0.01;

  useEffect(() => {
    if (!open) return;
    setSeparado(String(valorTotal || ""));
    setFuturo("0");
  }, [open, valorTotal]);

  function confirm() {
    if (!initialCartaoId || !valoresValidos || !totalConfere) return;
    onConfirm({
      cartao_id: initialCartaoId,
      valor_separado_agora: valorSeparado,
    });
    setSeparado("");
    setFuturo("");
  }

  return (
    <Dialog open={open} title="Compra no cartao" onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-300">
            <CreditCard className="h-4 w-4 text-brand-600" />
            Valor total da compra
          </div>
          <div className="mt-1 text-xl font-semibold text-slate-100">{formatMoney(valorTotal)}</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Separar agora</span>
            <MoneyInput value={separado} onChange={(event) => setSeparado(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Pagamento futuro</span>
            <MoneyInput value={futuro} onChange={(event) => setFuturo(event.target.value)} />
          </label>
        </div>
        <div className={totalConfere ? "rounded-md bg-brand-500/15 p-2.5 text-[13px] text-brand-400" : "rounded-md bg-amber-500/15 p-2.5 text-[13px] text-amber-300"}>
          {totalConfere
            ? `Total confere: ${formatMoney(totalInformado)}.`
            : `A soma precisa fechar ${formatMoney(valorTotal)}. Diferenca: ${formatMoney(Math.abs(diferenca))}.`}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!initialCartaoId || !valoresValidos || !totalConfere} onClick={confirm}>
            Confirmar compra
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
