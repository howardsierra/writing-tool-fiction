export interface Project {
  id: string;
  userId: string;
  title: string;
  customAuthors?: string[];
  /** Target length of the finished manuscript, in words. */
  wordGoal?: number;
  /** Words the author aims to write per day. */
  dailyGoal?: number;
  createdAt: any;
  updatedAt: any;
}

export type DocumentType = 'chapter' | 'scene' | 'character' | 'lore' | 'notes' | 'snippet';

export type DocumentStatus = 'outline' | 'draft' | 'revised' | 'final';

export interface DocumentVersion {
  id: string;
  timestamp: number;
  content: string;
  label?: string;
}

export interface Document {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  content: string;
  type: DocumentType;
  tags: string[];
  imageUrl?: string;
  versions?: DocumentVersion[];
  /** Position within its type group. Lower comes first. */
  order?: number;
  status?: DocumentStatus;
  /** One- or two-line summary, used on the corkboard and as AI context. */
  synopsis?: string;
  createdAt: any;
  updatedAt: any;
}

export interface CustomEndpoint {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
  model: string;
}

export interface AIConfig {
  provider: string;
  model: string;
  temperature: number;
  customPrompt?: string;
  customEndpoints?: CustomEndpoint[];
  activeCustomEndpointId?: string;
  apiKeys?: Record<string, string>;
  fullContext?: boolean;
}

export type EditorFont = 'serif' | 'sans' | 'mono';
export type EditorWidth = 'narrow' | 'medium' | 'wide';

export interface EditorPrefs {
  font: EditorFont;
  fontSize: number;
  lineHeight: number;
  width: EditorWidth;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  font: 'serif',
  fontSize: 20,
  lineHeight: 1.75,
  width: 'medium',
};

export const DOCUMENT_TYPES: { id: DocumentType; label: string; plural: string }[] = [
  { id: 'chapter', label: 'Chapter', plural: 'Chapters' },
  { id: 'scene', label: 'Scene', plural: 'Scenes' },
  { id: 'character', label: 'Character', plural: 'Characters' },
  { id: 'lore', label: 'Lore', plural: 'World & Lore' },
  { id: 'notes', label: 'Note', plural: 'Notes' },
  { id: 'snippet', label: 'Snippet', plural: 'Snippets' },
];

export const DOCUMENT_STATUSES: { id: DocumentStatus; label: string; color: string }[] = [
  { id: 'outline', label: 'Outline', color: '#8b8fa3' },
  { id: 'draft', label: 'Draft', color: '#d9a23a' },
  { id: 'revised', label: 'Revised', color: '#5b9bd5' },
  { id: 'final', label: 'Final', color: '#5fb57a' },
];

export const MANUSCRIPT_TYPES: DocumentType[] = ['chapter', 'scene'];

export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', models: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'] },
  { id: 'anthropic', name: 'Anthropic Claude', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['meta-llama/llama-3-70b-instruct', 'mistralai/mixtral-8x7b-instruct'] },
  { id: 'nanogpt', name: 'NanoGPT', models: [] },
  { id: 'nanobanana', name: 'Nano Banana', models: [] },
  { id: 'nanobanana2', name: 'Nano Banana 2', models: [] },
  { id: 'kimi', name: 'Kimi (Moonshot)', models: [] },
  { id: 'mimo', name: 'Mimo AI', models: [] },
  { id: 'custom', name: 'Custom OpenAI-Compatible', models: ['custom'] },
];
