import { AIConfig, Document, Project, DOCUMENT_TYPES } from '../types';

interface GenerateOptions {
  systemPrompt: string;
  prompt: string;
  temperature?: number;
  signal?: AbortSignal;
}

/** Sends a single generation request through the backend using the user's AI settings. */
export async function generateText(aiConfig: AIConfig, { systemPrompt, prompt, temperature, signal }: GenerateOptions): Promise<string> {
  const activeEndpoint = aiConfig.provider === 'custom'
    ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)
    : undefined;

  if (aiConfig.provider === 'custom' && !activeEndpoint?.url) {
    throw new Error('No custom endpoint configured. Add one in Settings.');
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      provider: aiConfig.provider,
      model: aiConfig.model,
      temperature: temperature ?? aiConfig.temperature,
      systemPrompt,
      prompt,
      customEndpoint: activeEndpoint?.url,
      customApiKey: aiConfig.provider === 'custom' ? activeEndpoint?.apiKey : aiConfig.apiKeys?.[aiConfig.provider],
    }),
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`The server returned an unexpected response (${res.status}).`);
  }
  if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status}).`);
  return (data.text || '').trim();
}

/** Builds the shared "writing partner" system prompt with project context. */
export function buildStoryContext({
  aiConfig,
  project,
  activeDoc,
  documents,
}: {
  aiConfig: AIConfig;
  project?: Project;
  activeDoc: Document;
  documents: Document[];
}): string {
  const typeLabel = DOCUMENT_TYPES.find(t => t.id === activeDoc.type)?.label.toLowerCase() || activeDoc.type;
  let prompt = `You are an expert fiction editor and co-writer helping an author with their novel${project ? ` "${project.title}"` : ''}. ` +
    `Match the author's voice, tense, point of view and style. Never add commentary, preambles or explanations around prose unless the author asks a question.`;

  if (project?.customAuthors?.length) {
    prompt += `\n\nStyle influences: let the prose draw on the craft of ${project.customAuthors.join(', ')}.`;
  }
  if (aiConfig.customPrompt?.trim()) {
    prompt += `\n\nAuthor's standing instructions: ${aiConfig.customPrompt.trim()}`;
  }

  prompt += `\n\nThe author is working on the ${typeLabel} "${activeDoc.title}".`;
  if (activeDoc.synopsis?.trim()) prompt += `\nSynopsis: ${activeDoc.synopsis.trim()}`;

  if (activeDoc.content.trim()) {
    const limit = aiConfig.fullContext ? Infinity : 12000;
    const content = activeDoc.content.length > limit
      ? '…' + activeDoc.content.slice(-limit)
      : activeDoc.content;
    prompt += `\n\n--- CURRENT DOCUMENT ---\n${content}\n--- END CURRENT DOCUMENT ---`;
  }

  // Reference material first (characters & lore), then the rest of the manuscript.
  const others = documents.filter(d => d.id !== activeDoc.id && d.type !== 'snippet');
  const priority = (d: Document) => (d.type === 'character' || d.type === 'lore' ? 0 : d.type === 'notes' ? 2 : 1);
  others.sort((a, b) => priority(a) - priority(b));

  if (others.length) {
    const perDocLimit = aiConfig.fullContext ? Infinity : 4000;
    let budget = aiConfig.fullContext ? Infinity : 40000;
    let section = '';
    for (const doc of others) {
      if (budget <= 0) break;
      const body = doc.content.trim();
      if (!body && !doc.synopsis) continue;
      const excerpt = body.length > perDocLimit ? body.slice(0, perDocLimit) + '…' : body;
      const entry = `\n[${doc.type.toUpperCase()}: ${doc.title}]${doc.synopsis ? `\nSynopsis: ${doc.synopsis}` : ''}\n${excerpt}\n`;
      section += entry;
      budget -= entry.length;
    }
    if (section) {
      prompt += `\n\n--- PROJECT REFERENCE ---${section}--- END PROJECT REFERENCE ---`;
    }
  }

  return prompt;
}

export type QuickActionId = 'continue' | 'rewrite' | 'expand' | 'tighten' | 'sensory' | 'dialogue' | 'brainstorm' | 'critique';

export const QUICK_ACTIONS: { id: QuickActionId; label: string; needsSelection?: boolean; hint: string }[] = [
  { id: 'continue', label: 'Continue', hint: 'Write what comes next from the cursor' },
  { id: 'rewrite', label: 'Rewrite', needsSelection: true, hint: 'Polish the selected passage' },
  { id: 'expand', label: 'Expand', needsSelection: true, hint: 'Deepen the selected passage' },
  { id: 'tighten', label: 'Tighten', needsSelection: true, hint: 'Cut flab from the selection' },
  { id: 'sensory', label: 'Add senses', needsSelection: true, hint: 'Layer in sensory detail' },
  { id: 'dialogue', label: 'Sharpen dialogue', needsSelection: true, hint: 'Make dialogue more natural' },
  { id: 'brainstorm', label: 'What next?', hint: 'Ideas for where the story could go' },
  { id: 'critique', label: 'Critique', hint: 'Editorial feedback on the passage' },
];

/**
 * Turns a quick action (or free-form instruction) into a user prompt.
 * Returns whether the result is prose meant to be inserted into the manuscript.
 */
export function buildActionPrompt({
  action,
  instruction,
  selection,
  textBeforeCursor,
}: {
  action: QuickActionId | null;
  instruction: string;
  selection: string;
  textBeforeCursor: string;
}): { prompt: string; isProse: boolean } {
  const extra = instruction.trim() ? `\n\nAdditional direction from the author: ${instruction.trim()}` : '';
  const passage = selection.trim();
  const tail = textBeforeCursor.slice(-3000);

  switch (action) {
    case 'continue':
      return {
        isProse: true,
        prompt: `Continue the story seamlessly from exactly where this text leaves off. Write roughly 250–400 words. Output only the new prose, with no heading or recap.\n\nTEXT SO FAR:\n${tail || '(the document is empty — write a compelling opening)'}${extra}`,
      };
    case 'rewrite':
      return { isProse: true, prompt: `Rewrite this passage to make the prose stronger and more vivid while keeping its meaning, events and voice. Output only the rewritten passage.\n\nPASSAGE:\n${passage}${extra}` };
    case 'expand':
      return { isProse: true, prompt: `Expand this passage to about twice its length, deepening interiority, setting and beats without changing what happens. Output only the expanded passage.\n\nPASSAGE:\n${passage}${extra}` };
    case 'tighten':
      return { isProse: true, prompt: `Tighten this passage: cut redundancy, filter words and weak verbs, keeping every story beat. Output only the revised passage.\n\nPASSAGE:\n${passage}${extra}` };
    case 'sensory':
      return { isProse: true, prompt: `Revise this passage to weave in concrete sensory detail (sound, smell, touch, taste, light) without slowing the pace. Output only the revised passage.\n\nPASSAGE:\n${passage}${extra}` };
    case 'dialogue':
      return { isProse: true, prompt: `Revise the dialogue in this passage so each character sounds distinct and natural, with subtext and purposeful beats. Output only the revised passage.\n\nPASSAGE:\n${passage}${extra}` };
    case 'brainstorm':
      return { isProse: false, prompt: `Suggest 5 distinct, specific directions the story could take next from this point, each with a one-sentence hook and why it would raise the stakes. Use a numbered list.\n\nRECENT TEXT:\n${passage || tail}${extra}` };
    case 'critique':
      return { isProse: false, prompt: `Give concise, candid editorial feedback on this passage: what works, what doesn't, and 3 concrete suggestions. Use short headed sections.\n\nPASSAGE:\n${passage || tail}${extra}` };
    default: {
      const ref = passage ? `\n\nSELECTED PASSAGE (for reference):\n${passage}` : '';
      return { isProse: false, prompt: `${instruction.trim()}${ref}` };
    }
  }
}

/** Pulls the first JSON array out of a model response, tolerating code fences and chatter. */
export function parseJsonArray<T = any>(text: string): T[] {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
  }
  throw new Error('The AI response was not a valid list. Try again.');
}
