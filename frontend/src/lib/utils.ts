import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function currentMonth() {
  const today = new Date();
  return { ano: today.getFullYear(), mes: today.getMonth() + 1 };
}

export function monthLabel(ano: number, mes: number) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(ano, mes - 1, 1),
  );
}

