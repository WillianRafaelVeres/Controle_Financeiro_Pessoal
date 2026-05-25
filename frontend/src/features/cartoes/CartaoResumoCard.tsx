import { CreditCard, Save } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { MoneyInput } from "../../components/finance/MoneyInput";
import { SectionCard } from "../../components/finance/SectionCard";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { formatMoney } from "../../lib/formatters";
import type { CartaoResumo } from "../../lib/types";

interface CartaoResumoCardProps {
  cartao: CartaoResumo;
  onInformarLimite?: (cartaoId: string, valor: number) => Promise<void>;
  onPagarFatura?: (cartaoId: string, valor: number) => Promise<void>;
}

export function CartaoResumoCard({ cartao, onInformarLimite, onPagarFatura }: CartaoResumoCardProps) {
  const [limiteUtilizado, setLimiteUtilizado] = useState(String(cartao.limite_utilizado_informado ?? ""));
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [valorPagamento, setValorPagamento] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const diferenca = Number(cartao.diferenca_limite ?? 0);
  const reservado = Number(cartao.reservado_para_pagar ?? 0);
  const valorPagamentoNumber = Number(valorPagamento || 0);
  const limiteConfere = Math.abs(diferenca) < 0.01;
  const pagamentoValido = valorPagamentoNumber > 0 && valorPagamentoNumber <= reservado;

  useEffect(() => {
    setLimiteUtilizado(String(cartao.limite_utilizado_informado ?? ""));
  }, [cartao.limite_utilizado_informado]);

  async function informarLimite(event: FormEvent) {
    event.preventDefault();
    if (!onInformarLimite) return;
    setSalvando(true);
    try {
      await onInformarLimite(cartao.id, Number(limiteUtilizado || 0));
    } finally {
      setSalvando(false);
    }
  }

  function abrirPagamento() {
    setValorPagamento(String(reservado || ""));
    setPagamentoAberto(true);
  }

  async function pagarFatura(event: FormEvent) {
    event.preventDefault();
    if (!onPagarFatura || !pagamentoValido) return;
    setPagando(true);
    try {
      await onPagarFatura(cartao.id, valorPagamentoNumber);
      setPagamentoAberto(false);
      setValorPagamento("");
    } finally {
      setPagando(false);
    }
  }

  return (
    <>
      <SectionCard
        title={cartao.nome}
        description={cartao.instituicao || "Cartão cadastrado"}
        action={<CreditCard className="h-5 w-5 text-brand-600" />}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Metric label="A vista" value={formatMoney(cartao.reservado_para_pagar)} detail="Separado para fatura" tone="green" />
          <Metric label="Parcelado" value={formatMoney(cartao.compromisso_futuro)} detail="Ainda a separar" tone="red" />
        </div>
        <div className="mt-2 grid gap-1 text-[13px] text-slate-400">
          <Line label="A vista + parcelado" value={formatMoney(cartao.limite_utilizado_total)} />
          <Line
            label="Diferenca"
            value={formatMoney(cartao.diferenca_limite)}
            valueClassName={limiteConfere ? "text-brand-400" : "text-amber-300"}
          />
        </div>
        <div className="mt-2 border-t border-slate-800 pt-2">
          <Button variant="secondary" onClick={abrirPagamento} disabled={!onPagarFatura || reservado <= 0}>
            Pagar fatura
          </Button>
        </div>
        <form className="mt-2 grid gap-2 border-t border-slate-800 pt-2" onSubmit={informarLimite}>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Limite utilizado</span>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <MoneyInput value={limiteUtilizado} onChange={(event) => setLimiteUtilizado(event.target.value)} />
              <Button type="submit" size="sm" disabled={!onInformarLimite || salvando || Number(limiteUtilizado || 0) < 0}>
                <Save className="h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </label>
          <p className="text-xs leading-4 text-slate-500">Conferencia: limite utilizado = a vista + parcelado.</p>
        </form>
      </SectionCard>
      <Dialog open={pagamentoAberto} title="Pagar fatura" onClose={() => setPagamentoAberto(false)}>
        <form className="grid gap-3" onSubmit={pagarFatura}>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-medium text-slate-500">Disponivel a vista</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{formatMoney(cartao.reservado_para_pagar)}</p>
          </div>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">Valor pago</span>
            <MoneyInput value={valorPagamento} onChange={(event) => setValorPagamento(event.target.value)} />
          </label>
          {valorPagamentoNumber > reservado && (
            <p className="rounded-md bg-amber-500/15 p-2.5 text-[13px] text-amber-300">
              O pagamento nao pode ser maior que o valor a vista.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPagamentoAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!pagamentoValido || pagando}>
              Confirmar pagamento
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "green" | "red" }) {
  return (
    <div className={tone === "green" ? "rounded-xl bg-brand-500/15 p-3" : "rounded-xl bg-red-500/15 p-3"}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 break-words text-base font-semibold text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs leading-4 text-slate-500">{detail}</p>
    </div>
  );
}

function Line({ label, value, valueClassName = "text-slate-100" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className={`font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}
