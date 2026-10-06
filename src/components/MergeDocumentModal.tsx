import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { GitMerge, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Document } from '../types';
import { Modal, Button } from './ui';
import { countWords, formatNumber } from '../utils/text';
import { MAX_CONTENT_LENGTH } from '../utils/importFile';

export function MergeDocumentModal({ document, onClose }: { document: Document; onClose: () => void }) {
  const { documents, updateDocument, deleteDocument, saveVersion } = useStore();
  const { toast } = useUI();
  const [selectedDocId, setSelectedDocId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const mergeableDocs = documents.filter(d => d.type === document.type && d.id !== document.id);
  const selected = mergeableDocs.find(d => d.id === selectedDocId);
  const separator = document.content.trim() && selected?.content.trim() ? '\n\n* * *\n\n' : '';
  const mergedLength = document.content.length + separator.length + (selected?.content.length || 0);
  const tooLong = mergedLength > MAX_CONTENT_LENGTH;

  const handleMerge = async () => {
    if (!selected || tooLong) return;
    setIsMerging(true);
    await saveVersion(document.id, document.content, `Before merging “${selected.title}”`.slice(0, 200));
    await updateDocument(document.id, {
      content: `${document.content}${separator}${selected.content}`,
      tags: Array.from(new Set([...(document.tags || []), ...(selected.tags || [])])).slice(0, 20),
    });
    await deleteDocument(selected.id);
    toast(`Merged “${selected.title}”`, 'success');
    onClose();
  };

  return (
    <Modal
      title="Merge documents"
      icon={<GitMerge className="w-4 h-4" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleMerge} disabled={!selected || tooLong || isMerging}>
            {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
            Merge
          </Button>
        </>
      }
    >
      <p className="text-sm text-fg-muted leading-relaxed mb-4">
        Append another {document.type} to the end of <strong className="text-fg">{document.title}</strong>. The other document is deleted afterwards; a snapshot of this one is saved first.
      </p>
      {mergeableDocs.length === 0 ? (
        <div className="p-6 rounded-xl bg-sunken text-center text-sm text-fg-subtle">No other {document.type}s to merge.</div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {mergeableDocs.map(d => (
            <button
              key={d.id}
              onClick={() => setSelectedDocId(d.id)}
              className={twMerge(
                'w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-left transition-colors',
                selectedDocId === d.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
              )}
            >
              <span className="text-sm text-fg truncate">{d.title}</span>
              <span className="text-xs text-fg-subtle tabular-nums flex-shrink-0">{formatNumber(countWords(d.content))} words</span>
            </button>
          ))}
        </div>
      )}
      {tooLong && (
        <p className="mt-3 text-xs text-danger">The merged text would exceed the 100,000-character document limit.</p>
      )}
    </Modal>
  );
}
