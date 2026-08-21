import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { X, Plus, Trash2 } from 'lucide-react';

export function ProjectSettingsModal({ onClose }: { onClose: () => void }) {
  const { projects, activeProjectId, updateProject, documents } = useStore();
  const activeProject = projects.find(p => p.id === activeProjectId);

  const [title, setTitle] = useState(activeProject?.title || '');
  const [customAuthors, setCustomAuthors] = useState<string[]>(activeProject?.customAuthors || []);
  const [newAuthor, setNewAuthor] = useState('');

  useEffect(() => {
    if (activeProject) {
      setTitle(activeProject.title);
      setCustomAuthors(activeProject.customAuthors || []);
    }
  }, [activeProject]);

  if (!activeProject) return null;

  const handleSave = () => {
    updateProject(activeProject.id, { title, customAuthors });
    onClose();
  };

  const addAuthor = () => {
    if (newAuthor.trim()) {
      setCustomAuthors([...customAuthors, newAuthor.trim()]);
      setNewAuthor('');
    }
  };

  const removeAuthor = (index: number) => {
    setCustomAuthors(customAuthors.filter((_, i) => i !== index));
  };

  const handleExport = () => {
    const projectDocs = documents.filter(d => d.projectId === activeProject.id);
    if (projectDocs.length === 0) {
      alert("No documents to export.");
      return;
    }
    
    let exportText = `# ${activeProject.title}\n\n`;
    projectDocs.forEach(doc => {
      exportText += `## ${doc.title} (${doc.type})\n\n`;
      exportText += `${doc.content}\n\n`;
    });

    const blob = new Blob([exportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.title.replace(/\s+/g, '_')}_export.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0F1218] border border-[#2D3139] rounded shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2D3139] flex justify-between items-center bg-[#11141B]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500">Project Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Project Title</label>
            <input 
              type="text" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Custom Authors (Influence Prose)</label>
            <div className="flex flex-col gap-2 p-3 bg-[#11141B] border border-[#2D3139] rounded">
              {customAuthors.map((author, index) => (
                <div key={index} className="flex justify-between items-center bg-[#1A1D26] px-3 py-2 rounded border border-[#2D3139]">
                  <span className="text-sm text-gray-200">{author}</span>
                  <button onClick={() => removeAuthor(index)} className="text-red-400 hover:text-red-300">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {customAuthors.length === 0 && (
                <div className="text-xs text-gray-500 py-2">No authors added.</div>
              )}
              <div className="flex gap-2 mt-2">
                <input 
                  type="text" 
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAuthor()}
                  placeholder="Add an author (e.g. Stephen King)"
                  className="flex-1 bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-[#D4AF37]"
                />
                <button onClick={addAuthor} className="px-3 py-1.5 bg-[#1A1D26] border border-[#2D3139] hover:border-[#D4AF37] rounded text-[#D4AF37] transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-[#2D3139] pt-4 mt-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Data Management</label>
            <button onClick={handleExport} className="w-full py-2 bg-[#1A1D26] border border-[#2D3139] hover:border-[#D4AF37] rounded text-gray-300 hover:text-white transition-colors text-sm">
              Export Project to Markdown
            </button>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#2D3139] flex justify-end gap-3 bg-[#11141B]">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-medium rounded hover:bg-[#F3CF55] transition-colors">Save Settings</button>
        </div>
      </div>
    </div>
  );
}
