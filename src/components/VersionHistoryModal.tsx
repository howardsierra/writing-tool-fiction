import { useMemo, useState } from 'react';
import { Clock, RotateCcw, Camera, Trash2, ArrowLeft } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Document } from '../types';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { Modal, Button, inputClass } from './ui';
import { countWords, formatNumber } from '../utils/text';

interface Props {
  document: Document;
  onClose: () => void;
}

/** Word-level diff (LCS) between two texts, capped for performance. */
function diffWords(a: string, b: string): { type: 'same' | 'add' | 'del'; text: string }[] {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  if (A.length * B.length > 2_500_000) return [{ type: 'same', text: b }];
  const n = A.length, m = B.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: 'same' | 'add' | 'del'; text: string }[] = [];
  const push = (type: 'same' | 'add' | 'del', text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('same', A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', A[i]); i++; }
    else { push('add', B[j]); j++; }
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('add', B[j++]);
  return out;
}

export function VersionHistoryModal({ document, onClose }: Props) {
  const { updateDocument, saveVersion, deleteVersion } = useStore();
  const { toast, confirm } = useUI();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  const versions = [...(document.versions || [])].sort((a, b) => b.timestamp - a.timestamp);
  const selectedVersion = versions.find(v => v.id === selectedVersionId);

  const diff = useMemo(
    () => (selectedVersion && showDiff ? diffWords(selectedVersion.content, document.content) : null),
    [selectedVersion, showDiff, document.content]
  );

  const handleSaveCurrent = async () => {
    setIsSaving(true);
    await saveVersion(document.id, document.content, newLabel.trim() || undefined);
    setNewLabel('');
    setIsSaving(false);
    toast('Snapshot saved', 'success');
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    const ok = await confirm({
      title: 'Restore this version?',
      message: 'Your current text will be saved as a snapshot first, so you can always come back to it.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    await saveVersion(document.id, document.content, 'Before restore');
    await updateDocument(document.id, { content: selectedVersion.content });
    toast('Version restored', 'success');
    onClose();
  };

  const handleDelete = async (id: string) => {
    await deleteVersion(document.id, id);
    if (selectedVersionId === id) setSelectedVersionId(null);
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const currentWords = countWords(document.content);

  return (
    <Modal title={`Version history · ${document.title}`} icon={<Clock className="w-4 h-4" />} onClose={onClose} size="xl" bodyClassName="p-0 flex flex-col md:flex-row min-h-[60vh]">
      {/* List */}
      <div className={twMerge('md:w-80 md:border-r border-line flex flex-col bg-surface/50', selectedVersion && 'hidden md:flex')}>
        <div className="p-4 border-b border-line space-y-2">
          <div className="text-xs font-medium text-fg-muted">Save a snapshot of the current text</div>
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveCurrent()}
              placeholder="Label (optional)"
              className={twMerge(inputClass, 'py-1.5')}
            />
            <Button variant="primary" size="sm" onClick={handleSaveCurrent} disabled={isSaving} aria-label="Save snapshot">
              <Camera className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {versions.length === 0 ? (
            <div className="p-6 text-center text-sm text-fg-subtle leading-relaxed">
              No snapshots yet.<br />Press <span className="text-fg-muted">Ctrl/⌘ S</span> while writing to save one.
            </div>
          ) : versions.map(v => {
            const words = countWords(v.content);
            const delta = currentWords - words;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedVersionId(v.id)}
                onKeyDown={e => e.key === 'Enter' && setSelectedVersionId(v.id)}
                className={twMerge(
                  'group relative p-3 rounded-lg cursor-pointer transition-colors',
                  selectedVersionId === v.id ? 'bg-accent-soft' : 'hover:bg-hover'
                )}
              >
                <div className="text-sm font-medium text-fg truncate pr-6">{v.label || formatDate(v.timestamp)}</div>
                <div className="text-xs text-fg-subtle mt-0.5 flex gap-2">
                  {v.label && <span>{formatDate(v.timestamp)}</span>}
                  <span className="tabular-nums">{formatNumber(words)} words</span>
                  {delta !== 0 && <span className={delta > 0 ? 'text-success' : 'text-danger'}>{delta > 0 ? `+${delta}` : delta} since</span>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(v.id); }}
                  className="absolute top-3 right-2 p-1 rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-danger transition-opacity"
                  aria-label="Delete snapshot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div className={twMerge('flex-1 flex flex-col min-w-0', !selectedVersion && 'hidden md:flex')}>
        {selectedVersion ? (
          <>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-line">
              <button onClick={() => setSelectedVersionId(null)} className="md:hidden p-1 -ml-1 text-fg-muted" aria-label="Back">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1 p-0.5 rounded-lg bg-sunken text-xs">
                <button onClick={() => setShowDiff(true)} className={twMerge('px-2.5 py-1 rounded-md', showDiff ? 'bg-elevated text-fg shadow-soft' : 'text-fg-muted')}>Changes since</button>
                <button onClick={() => setShowDiff(false)} className={twMerge('px-2.5 py-1 rounded-md', !showDiff ? 'bg-elevated text-fg shadow-soft' : 'text-fg-muted')}>Snapshot text</button>
              </div>
              {showDiff && (
                <div className="hidden sm:flex items-center gap-3 ml-auto text-[11px] text-fg-subtle">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-success/30" /> added since</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-danger/30" /> removed since</span>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="font-serif text-[16px] leading-relaxed text-fg whitespace-pre-wrap max-w-2xl">
                {diff
                  ? diff.map((part, i) =>
                      part.type === 'same' ? <span key={i}>{part.text}</span>
                        : part.type === 'add' ? <span key={i} className="bg-success/20 rounded-sm">{part.text}</span>
                          : <span key={i} className="bg-danger/20 line-through decoration-danger/60 rounded-sm">{part.text}</span>)
                  : selectedVersion.content}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-line bg-surface/60 flex justify-end">
              <Button variant="primary" onClick={handleRestore}>
                <RotateCcw className="w-4 h-4" />
                Restore this version
              </Button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-fg-subtle p-8 text-center">
            <Clock className="w-8 h-8 opacity-40" />
            Select a snapshot to compare it with your current text.
          </div>
        )}
      </div>
    </Modal>
  );
}
