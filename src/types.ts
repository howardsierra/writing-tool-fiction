export interface Project {
  id: string;
  userId: string;
  title: string;
  customAuthors?: string[];
  createdAt: any;
  updatedAt: any;
}

export type DocumentType = 'chapter' | 'scene' | 'character' | 'lore' | 'notes' | 'snippet';

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

export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', models: ['gemini-3.1-pro-preview', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { id: 'anthropic', name: 'Anthropic Claude', models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['meta-llama/llama-3-70b-instruct', 'mistralai/mixtral-8x7b-instruct'] },
  { id: 'nanogpt', name: 'NanoGPT', models: [] },
  { id: 'nanobanana', name: 'Nano Banana', models: [] },
  { id: 'nanobanana2', name: 'Nano Banana 2', models: [] },
  { id: 'kimi', name: 'Kimi (Moonshot)', models: [] },
  { id: 'mimo', name: 'Mimo AI', models: [] },
  { id: 'custom', name: 'Custom OpenAI-Compatible', models: ['custom'] },
];
