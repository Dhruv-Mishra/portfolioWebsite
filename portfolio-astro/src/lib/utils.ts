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
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
