import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { X, GitMerge } from 'lucide-react';
import { Document } from '../types';

export function MergeDocumentModal({ document, onClose }: { document: Document, onClose: () => void }) {
  const { documents, updateDocument, deleteDocument } = useStore();
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  // Only show documents of the same type, in the same project, excluding the current document.
  const mergeableDocs = documents.filter(d => 
    d.projectId === document.projectId && 
    d.type === document.type && 
    d.id !== document.id
  );

  const handleMerge = async () => {
    if (!selectedDocId) return;
    const docToMerge = documents.find(d => d.id === selectedDocId);
    if (!docToMerge) return;

    // Merge content
    const separator = document.content.trim() && docToMerge.content.trim() ? '\n\n---\n\n' : '';
    const newContent = `${document.content}${separator}${docToMerge.content}`;
    
    // Merge tags
    const newTags = Array.from(new Set([...(document.tags || []), ...(docToMerge.tags || [])]));

    await updateDocument(document.id, { 
      content: newContent,
      tags: newTags
    });
    await deleteDocument(docToMerge.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#11141B] border border-[#2D3139] rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#2D3139]">
          <h2 className="text-lg font-serif italic text-white flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-[#D4AF37]" />
            Merge Document
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-4 text-sm text-gray-300">
          <p>
            Select another <strong>{document.type}</strong> to merge into <strong>{document.title}</strong>. 
            The selected document will be permanently deleted after its content is appended here.
          </p>
          
          {mergeableDocs.length === 0 ? (
            <div className="p-4 bg-[#1A1D26] rounded text-center text-gray-500">
              No other {document.type}s available to merge.
            </div>
          ) : (
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-white outline-none focus:border-[#D4AF37]"
            >
              <option value="">Select a document to merge...</option>
              {mergeableDocs.map(d => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
        </div>
        
        <div className="p-4 border-t border-[#2D3139] flex justify-end gap-3 bg-[#0A0C10]">
          <button onClick={onClose} className="px-4 py-2 text-xs uppercase tracking-widest text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleMerge}
            disabled={!selectedDocId}
            className="px-4 py-2 bg-[#D4AF37] text-black text-xs uppercase tracking-widest font-bold rounded hover:bg-[#E5C35D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <GitMerge className="w-4 h-4" />
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}
