import { CreditCard, Landmark, WalletCards } from "lucide-react";

import type { TipoMetodo } from "../../lib/types";
import { Badge } from "../ui/badge";

export function PaymentMethodBadge({ nome, tipo }: { nome: string; tipo: TipoMetodo }) {
  const Icon = tipo === "CARTAO_CREDITO" ? CreditCard : tipo === "BOLETO" ? Landmark : WalletCards;
  return (
    <Badge tone={tipo === "CARTAO_CREDITO" ? "green" : "neutral"} className="gap-1">
      <Icon className="h-3 w-3" />
      {nome}
    </Badge>
  );
}

