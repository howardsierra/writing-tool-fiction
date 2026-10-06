import JSZip from 'jszip';
import { DocumentStatus, DocumentType, DocumentVersion } from '../types';

export interface ImportedDoc {
  title: string;
  type: DocumentType;
  content: string;
  tags?: string[];
  synopsis?: string;
  status?: DocumentStatus;
  versions?: DocumentVersion[];
}

export interface ImportedProject {
  title: string;
  customAuthors?: string[];
  wordGoal?: number;
  dailyGoal?: number;
  documents: ImportedDoc[];
  /** Human-readable description of the detected format. */
  format: string;
}

const TYPES: DocumentType[] = ['chapter', 'scene', 'character', 'lore', 'notes', 'snippet'];
const STATUSES: DocumentStatus[] = ['outline', 'draft', 'revised', 'final'];

const asType = (value: unknown, fallback: DocumentType = 'notes'): DocumentType => {
  const v = String(value || '').toLowerCase().trim();
  if (TYPES.includes(v as DocumentType)) return v as DocumentType;
  if (v === 'note') return 'notes';
  if (v === 'chapters') return 'chapter';
  if (v === 'scenes') return 'scene';
  if (v === 'characters') return 'character';
  if (v === 'snippets') return 'snippet';
  return fallback;
};

/** Maps a folder name like "chapter" or "Characters" to a type, or null if it isn't one. */
const folderType = (name: string): DocumentType | null => {
  const t = asType(name, 'notes');
  return t === 'notes' && !/^notes?$/i.test(name.trim()) ? null : t;
};

const fileBaseName = (name: string) => name.split('/').pop()!.replace(/\.[^/.]+$/, '');

/** Reads any supported export: JSON backup, Markdown (old or new) or a .zip of Markdown files. */
export async function parseProjectFile(file: File): Promise<ImportedProject> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return parseJson(await file.text());
  if (ext === 'zip') return parseZip(file);
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return parseMarkdown(await file.text(), file.name);
  throw new Error('Unsupported file. Choose a .json backup, a .md export or a .zip archive.');
}

/* ---------- JSON backup (this app) ---------- */

export function parseJson(text: string): ImportedProject {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This JSON file could not be read.');
  }
  if (!data || !Array.isArray(data.documents)) throw new Error('This JSON file is not a project backup.');
  return {
    title: String(data.project?.title || 'Imported project'),
    customAuthors: Array.isArray(data.project?.customAuthors) ? data.project.customAuthors.map(String) : undefined,
    wordGoal: Number(data.project?.wordGoal) || undefined,
    dailyGoal: Number(data.project?.dailyGoal) || undefined,
    format: 'Full backup (.json)',
    documents: data.documents
      .filter((d: any) => d && (d.title || d.content))
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((d: any) => ({
        title: String(d.title || 'Untitled'),
        type: asType(d.type),
        content: String(d.content || ''),
        tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
        synopsis: d.synopsis ? String(d.synopsis) : undefined,
        status: STATUSES.includes(d.status) ? d.status : undefined,
        versions: Array.isArray(d.versions)
          ? d.versions
              .filter((v: any) => v && typeof v.content === 'string')
              .map((v: any) => ({
                id: String(v.id || crypto.randomUUID()),
                timestamp: Number(v.timestamp) || Date.now(),
                content: v.content,
                ...(v.label ? { label: String(v.label) } : {}),
              }))
          : undefined,
      })),
  };
}

/* ---------- Markdown ---------- */

const TYPED_HEADING = /^## (.+?) \((chapter|scene|character|lore|notes|snippet)\)[ \t]*$/gm;

/**
 * Supports:
 * - the original app's "Export Project to Markdown": `# Project` then `## Title (type)` sections
 * - this app's compiled manuscript: `# Project`, optional `*by Author*`, then `## Title` sections
 * - any other Markdown/text file, imported as a single chapter
 */
export function parseMarkdown(raw: string, filename: string): ImportedProject {
  const text = raw.replace(/\r\n/g, '\n');
  const titleMatch = text.match(/^# (.+)$/m);
  const fallbackTitle = fileBaseName(filename).replace(/_export$/, '').replace(/_/g, ' ');
  const title = titleMatch?.[1].trim() || fallbackTitle;

  const typed = [...text.matchAll(TYPED_HEADING)];
  if (typed.length) {
    const documents = typed.map((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < typed.length ? typed[i + 1].index! : text.length;
      return { title: m[1].trim(), type: m[2] as DocumentType, content: text.slice(start, end).trim() };
    });
    return { title, documents, format: 'Markdown export (original app)' };
  }

  const plain = [...text.matchAll(/^## (.+)$/gm)];
  if (plain.length && titleMatch) {
    const documents = plain.map((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < plain.length ? plain[i + 1].index! : text.length;
      return { title: m[1].trim(), type: 'chapter' as DocumentType, content: text.slice(start, end).trim() };
    });
    return { title, documents, format: 'Markdown manuscript' };
  }

  const body = titleMatch ? text.replace(/^# .+\n*/m, '') : text;
  return {
    title,
    documents: [{ title: title || 'Chapter 1', type: 'chapter', content: body.trim() }],
    format: 'Single Markdown/text file',
  };
}

/* ---------- Zip of Markdown files ---------- */

/**
 * Supports the original app's archive (`type/Title.md`, raw content) and this app's
 * "All documents" archive (`type/001 Title.md` with a heading, synopsis and tags).
 */
export async function parseZip(file: Blob & { name?: string }): Promise<ImportedProject> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter(f =>
    !f.dir && !f.name.startsWith('__MACOSX/') && !f.name.split('/').pop()!.startsWith('.') && /\.(md|markdown|txt)$/i.test(f.name)
  );
  if (!entries.length) throw new Error('No Markdown files were found in this archive.');

  const items = await Promise.all(entries.map(async entry => {
    const parts = entry.name.split('/');
    // The type folder may be nested inside a top-level project folder.
    const type = parts.slice(0, -1).reverse().map(folderType).find(Boolean) || 'chapter';
    let name = fileBaseName(entry.name);
    const numbered = name.match(/^(\d{1,4}) (.+)$/);
    const sortKey = numbered ? Number(numbered[1]) : Number.MAX_SAFE_INTEGER;
    if (numbered) name = numbered[2];

    let content = (await entry.async('string')).replace(/\r\n/g, '\n');
    let title = name;
    let synopsis: string | undefined;
    let tags: string[] | undefined;
    if (numbered) {
      // This app's archive starts each file with "# Title", then optional "> synopsis" and "Tags: …".
      const heading = content.match(/^# (.+)\n+/);
      if (heading) {
        title = heading[1].trim();
        content = content.slice(heading[0].length);
      }
      const syn = content.match(/^> (.+)\n+/);
      if (syn) {
        synopsis = syn[1].trim();
        content = content.slice(syn[0].length);
      }
      const tagLine = content.match(/^Tags: (.+)\n+/);
      if (tagLine) {
        tags = tagLine[1].split(',').map(t => t.trim()).filter(Boolean);
        content = content.slice(tagLine[0].length);
      }
    }
    return { sortKey, name: entry.name, doc: { title, type, content: content.trim(), synopsis, tags } as ImportedDoc };
  }));

  items.sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const baseName = fileBaseName(file.name || 'Imported project').replace(/ - all documents$/, '').replace(/_/g, ' ');
  return {
    title: baseName,
    documents: items.map(i => i.doc),
    format: items.some(i => i.sortKey !== Number.MAX_SAFE_INTEGER) ? 'Markdown archive (.zip)' : 'Markdown archive (original app)',
  };
}
