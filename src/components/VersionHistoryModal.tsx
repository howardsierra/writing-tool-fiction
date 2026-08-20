import { useState } from 'react';
import { X, Clock, RotateCcw, Save } from 'lucide-react';
import { Document, DocumentVersion } from '../types';
import { useStore } from '../hooks/useStore';
import { clsx } from 'clsx';

interface Props {
  document: Document;
  onClose: () => void;
}

export function VersionHistoryModal({ document, onClose }: Props) {
  const { updateDocument, saveVersion } = useStore();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const versions = [...(document.versions || [])].sort((a, b) => b.timestamp - a.timestamp);
  const selectedVersion = versions.find(v => v.id === selectedVersionId);

  const handleSaveCurrent = async () => {
    setIsSaving(true);
    await saveVersion(document.id, document.content, newLabel || undefined);
    setNewLabel('');
    setIsSaving(false);
  };

  const handleRestore = async () => {
    if (!selectedVersion) return;
    const confirm = window.confirm('Are you sure you want to restore this version? This will overwrite the current content.');
    if (confirm) {
      await updateDocument(document.id, { content: selectedVersion.content });
      onClose();
    }
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0F1218] border border-[#2D3139] rounded shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#2D3139] flex justify-between items-center bg-[#11141B]">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#D4AF37]" />
            Version History: {document.title}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel: Version List */}
          <div className="w-1/3 border-r border-[#2D3139] flex flex-col bg-[#16181F]">
            <div className="p-4 border-b border-[#2D3139] flex flex-col gap-2">
              <span className="text-xs text-gray-400 font-medium">Save Current Snapshot</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Version label (optional)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  className="flex-1 bg-[#1A1D26] border border-[#2D3139] rounded px-2 py-1.5 text-xs text-gray-200 focus:border-[#D4AF37] outline-none"
                />
                <button
                  onClick={handleSaveCurrent}
                  disabled={isSaving}
                  className="p-1.5 bg-[#1A1D26] border border-[#2D3139] rounded hover:border-[#D4AF37] text-gray-300 transition-colors disabled:opacity-50"
                  title="Save snapshot"
                >
                  <Save className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {versions.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  No saved versions yet.
                </div>
              ) : (
                <div className="flex flex-col">
                  {versions.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVersionId(v.id)}
                      className={clsx(
                        "text-left p-4 border-b border-[#2D3139] hover:bg-[#1A1D26] transition-colors",
                        selectedVersionId === v.id && "bg-[#1A1D26] border-l-2 border-l-[#D4AF37]"
                      )}
                    >
                      <div className="text-sm font-medium text-gray-200 truncate">
                        {v.label || formatDate(v.timestamp)}
                      </div>
                      {v.label && (
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(v.timestamp)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Content Preview */}
          <div className="w-2/3 flex flex-col bg-[#0F1218]">
            {selectedVersion ? (
              <>
                <div className="flex-1 p-6 overflow-y-auto">
                  <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap font-serif text-gray-300">
                    {selectedVersion.content}
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-[#2D3139] bg-[#11141B] flex justify-end gap-3">
                  <button
                    onClick={handleRestore}
                    className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-medium rounded hover:bg-[#F3CF55] transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore this version
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                Select a version to preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
