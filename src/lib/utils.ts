import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFolderForFilename(filename: string): 'Head' | 'Floor' | 'Corner' | 'Closeup' | 'Tag' {
  const nameLower = filename.toLowerCase();
  if (nameLower.includes("(1)")) return 'Head';
  if (nameLower.includes("(2)")) return 'Floor';
  if (nameLower.includes("(3)")) return 'Corner';
  if (nameLower.includes("(4)")) return 'Closeup';
  return 'Tag';
}
