import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatDate = (date: Date, separator: string = '.') => {
  return `${date.getFullYear()}${separator}${String(date.getMonth() + 1).padStart(2, '0')}${separator}${String(date.getDate()).padStart(2, '0')}`;
};

// /** CORS proxy helper */
// export const proxyUrl = (url: string) => {
//   return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
// }
