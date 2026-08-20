export function countSyllables(word: string): number {
  word = word.toLowerCase().trim();
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

export function calculateFleschKincaid(text: string): { score: number; label: string } {
  if (!text || text.trim().length === 0) return { score: 0, label: '' };
  
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  const wordCount = words.length;
  const sentenceCount = sentences.length || 1;
  
  let syllableCount = 0;
  for (const word of words) {
    syllableCount += countSyllables(word);
  }
  
  const score = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  
  let label = '';
  if (clampedScore >= 90) label = 'Very Easy';
  else if (clampedScore >= 80) label = 'Easy';
  else if (clampedScore >= 70) label = 'Fairly Easy';
  else if (clampedScore >= 60) label = 'Standard';
  else if (clampedScore >= 50) label = 'Fairly Difficult';
  else if (clampedScore >= 30) label = 'Difficult';
  else label = 'Very Difficult';

  return { score: clampedScore, label };
}
