import type { InputHTMLAttributes } from "react";

import { Input } from "../ui/input";

export function PercentInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <Input inputMode="decimal" min="0" max="100" step="0.01" type="number" {...props} />;
}

