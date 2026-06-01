---
name: investimento-saldo-model
description: Decided model for how national investments affect saldo livre / saldo em contas
metadata:
  type: project
---

National (BRL, non-exterior) investments use a "sai de uma conta de caixa" model (user decision 2026-06-01):

- Aporte/compra **with a source conta_id**: reduce that account's `saldo_atual_informado` (→ saldo em contas ↓) AND create the shadow Lancamento (→ saldo livre ↓). Both drop equally so conciliação stays balanced.
- Resgate/venda **with a destination conta_id**: increase informed balance AND saldo livre by the net amount.
- Aporte/resgate **without conta_id = NEUTRAL**: pure position tracking, no saldo livre / no contas effect.
- Existing positions registered before this (all have conta_id=NULL, ~R$64k) stay neutral. Their auto-created saldo-reducing lançamentos must be deactivated by the sync routine.
- Exterior (USD) stays separate via extrato_dolar — never touches BRL saldo livre/contas. [[investimento-saldo-model]]

Saldo livre = saldo_inicial(contas gasto) + lançamentos − reservado_contas_futuras (uses saldo_inicial, NOT saldo_atual_informado). saldo_em_contas = sum(saldo_atual_informado). They are independent tracks the conciliação compares — so an investment needs BOTH a lançamento and an informed-balance change to keep them aligned.
