import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format amount as Philippine Peso (for dashboard display)
// Since PHPT:PHP is 1:1, this displays the same value in peso format
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format amount as PHPT (for crypto wallet display)
export function formatPhpt(amount: number): string {
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })} PHPT`;
}
