/**
 * String utility functions for fuzzy matching
 */
import { distance } from 'fastest-levenshtein';

/**
 * Calculate fuzzy match score between two strings (0-1)
 * Uses Levenshtein distance
 */
export function fuzzyMatch(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  
  const editDistance = distance(s1, s2);
  const similarity = 1 - (editDistance / maxLength);
  
  return Math.max(0, similarity);
}

/**
 * Normalize string for comparison (remove special chars, lowercase)
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Check if string contains all words from another string
 */
export function containsWords(text: string, searchWords: string): boolean {
  const textWords = normalizeString(text).split(/\s+/);
  const searchWordsList = normalizeString(searchWords).split(/\s+/);
  
  return searchWordsList.every(word => 
    textWords.some(textWord => textWord.includes(word) || word.includes(textWord))
  );
}
