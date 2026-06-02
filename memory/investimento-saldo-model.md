---
name: investimento-saldo-model
description: Decided model for how national investments affect saldo livre / saldo em contas
metadata:
  type: project
---

National BRL investments affect the virtual balance independently of `conta_id`
(user decision 2026-06-02):

- Aporte/compra BRL creates or activates a shadow `Lancamento` with type
  `INVESTIMENTO`, reducing `saldo_livre`.
- Resgate/venda BRL creates or activates a shadow `Lancamento` with type
  `AJUSTE`, increasing `saldo_livre` by the net amount.
- `conta_id` is optional metadata for origin/destination. It is not required for
  the virtual balance effect.
- Investment operations do not change `Conta.saldo_atual_informado`; that value
  is the real balance informed manually by the user.
- Startup sync preserves old BRL movements without `conta_id` so legacy
  positions are not migrated in bulk. Editing/saving an old movement applies the
  current virtual-balance rule to that movement.
- Exterior (USD) stays separate via `extrato_dolar` and does not touch BRL saldo
  livre/contas.

`saldo_livre` is calculated from initial spending-account balances plus active
launches minus future-account reservations. `saldo_em_contas` is calculated from
the manually informed current account balances. Reconciliation compares these
independent tracks.
