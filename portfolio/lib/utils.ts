import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/** Pick a single random item from an array */
export function pickRandom<T>(arr: readonly T[]): T;
/** Pick N random items from an array without duplicates */
export function pickRandom<T>(arr: readonly T[], n: number): T[];
export function pickRandom<T>(arr: readonly T[], n?: number): T | T[] {
  if (n === undefined) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (arr.length === 0 || n <= 0) {
    return [];
  }
  const count = Math.min(n, arr.length);
  const copy = [...arr];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy.slice(0, count);
}
