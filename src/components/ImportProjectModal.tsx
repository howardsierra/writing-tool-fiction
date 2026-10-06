import { useRef, useState } from 'react';
import { Upload, Loader2, FolderInput, AlertCircle, FileText, ArrowLeft } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { DOCUMENT_TYPES, DocumentType } from '../types';
import { parseProjectFile, ImportedProject } from '../utils/importProject';
import { countWords, formatNumber } from '../utils/text';
import { Modal, Button, Field, inputClass } from './ui';
import { TYPE_ICONS } from './Sidebar';

export function ImportProjectModal({ onClose }: { onClose: () => void }) {
  const { importProject } = useStore();
  const { toast } = useUI();
  const [parsed, setParsed] = useState<ImportedProject | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setIsReading(true);
    try {
      const result = await parseProjectFile(file);
      if (!result.documents.length) throw new Error('No documents were found in this file.');
      setParsed(result);
      setFileName(file.name);
    } catch (err: any) {
      setError(err.message || 'This file could not be read.');
    } finally {
      setIsReading(false);
    }
  };

  const setType = (index: number, type: DocumentType) =>
    setParsed(p => p && { ...p, documents: p.documents.map((d, i) => (i === index ? { ...d, type } : d)) });

  const handleImport = async () => {
    if (!parsed) return;
    setProgress({ done: 0, total: parsed.documents.length });
    const id = await importProject(parsed, (done, total) => setProgress({ done, total }));
    setProgress(null);
    if (id) {
      toast(`Imported “${parsed.title}” with ${parsed.documents.length} documents`, 'success');
      onClose();
    }
  };

  const totalWords = parsed?.documents.reduce((sum, d) => sum + countWords(d.content), 0) || 0;
  const counts = parsed
    ? DOCUMENT_TYPES.map(t => ({ ...t, count: parsed.documents.filter(d => d.type === t.id).length })).filter(t => t.count)
    : [];

  return (
    <Modal
      title="Import project"
      icon={<FolderInput className="w-4 h-4" />}
      onClose={progress ? () => {} : onClose}
      size="lg"
      footer={parsed ? (
        <>
          <Button variant="ghost" onClick={() => { setParsed(null); setError(''); }} disabled={!!progress}>
            <ArrowLeft className="w-4 h-4" /> Choose another file
          </Button>
          <Button variant="primary" onClick={handleImport} disabled={!!progress || !parsed.title.trim()}>
            {progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderInput className="w-4 h-4" />}
            {progress ? `Importing… ${progress.done}/${progress.total}` : `Import ${parsed.documents.length} documents`}
          </Button>
        </>
      ) : undefined}
    >
      {!parsed ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted leading-relaxed">
            Bring in a project exported from this app or from the original AI Studio version. It’s added as a <strong className="text-fg">new project</strong>, so nothing you already have is changed.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); readFile(e.dataTransfer.files?.[0]); }}
            disabled={isReading}
            className={twMerge(
              'w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center gap-2 transition-colors',
              isDragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong bg-surface'
            )}
          >
            {isReading ? <Loader2 className="w-6 h-6 text-accent animate-spin" /> : <Upload className="w-6 h-6 text-fg-subtle" />}
            <span className="text-sm text-fg">{isReading ? 'Reading file…' : 'Drop your export here, or click to choose'}</span>
            <span className="text-xs text-fg-subtle">.json backup · .md export · .zip archive</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.md,.markdown,.txt,.zip"
            className="hidden"
            onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }}
          />
          <ul className="text-xs text-fg-subtle space-y-1 leading-relaxed">
            <li>• <span className="text-fg-muted">Original app:</span> “Export Project to Markdown” (.md) or “Markdown Archive” (.zip)</li>
            <li>• <span className="text-fg-muted">This app:</span> Full backup (.json) restores everything, including version history and goals</li>
          </ul>
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-danger-soft text-danger text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <FileText className="w-3.5 h-3.5" />
            <span className="truncate">{fileName}</span>
            <span>·</span>
            <span>{parsed.format}</span>
          </div>

          <Field label="Project title">
            <input
              value={parsed.title}
              maxLength={100}
              onChange={e => setParsed({ ...parsed, title: e.target.value })}
              className={inputClass}
            />
          </Field>

          <div className="flex flex-wrap gap-1.5">
            {counts.map(t => (
              <span key={t.id} className="px-2 py-1 rounded-md bg-hover text-xs text-fg-muted">
                {t.count} {t.count === 1 ? t.label.toLowerCase() : t.plural.toLowerCase()}
              </span>
            ))}
            <span className="px-2 py-1 rounded-md bg-accent-soft text-xs text-accent">{formatNumber(totalWords)} words</span>
          </div>

          <div>
            <div className="text-xs font-medium text-fg-muted mb-2">Documents <span className="text-fg-subtle font-normal">— check the types look right</span></div>
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {parsed.documents.map((d, i) => {
                const Icon = TYPE_ICONS[d.type];
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2">
                    <Icon className="w-3.5 h-3.5 text-fg-subtle flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-sm text-fg truncate">{d.title || 'Untitled'}</span>
                    <span className="text-[11px] text-fg-subtle tabular-nums flex-shrink-0">{formatNumber(countWords(d.content))}</span>
                    <select
                      value={d.type}
                      onChange={e => setType(i, e.target.value as DocumentType)}
                      disabled={!!progress}
                      className="flex-shrink-0 bg-surface border border-line rounded-md px-1.5 py-1 text-xs text-fg-muted outline-none focus:border-accent"
                    >
                      {DOCUMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
