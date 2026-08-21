import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { FileText, Users, BookOpen, File, Plus, Settings, Sun, Moon, ChevronDown, Tag, Upload, Brain, Scissors, Download, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ProjectSettingsModal } from './ProjectSettingsModal';
import { lazy, Suspense } from 'react';

const ExportModal = lazy(() => import('./ExportModal').then(module => ({ default: module.ExportModal })));

export function Sidebar({ onOpenSettings, onCloseSidebar }: { onOpenSettings: () => void, onCloseSidebar?: () => void }) {
  const { 
    projects, activeProjectId, setActiveProjectId, createProject,
    documents, activeDocumentId, setActiveDocumentId, createDocument,
    isDarkMode, toggleDarkMode
  } = useStore();

  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  
  const [isCreatingDoc, setIsCreatingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<'chapter' | 'scene' | 'character' | 'lore' | 'notes'>('chapter');
  
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectTitle.trim()) {
      createProject(newProjectTitle.trim());
      setNewProjectTitle('');
      setIsCreatingProject(false);
    }
  };

  const handleCreateDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDocTitle.trim()) {
      createDocument(newDocTitle.trim(), newDocType);
      setNewDocTitle('');
      setIsCreatingDoc(false);
    }
  };

  const groupedDocs = documents.reduce((acc, doc) => {
    if (!acc[doc.type]) acc[doc.type] = [];
    acc[doc.type].push(doc);
    return acc;
  }, {} as Record<string, typeof documents>);

  const getIcon = (type: string) => {
    switch (type) {
      case 'chapter': return <BookOpen className="w-4 h-4" />;
      case 'scene': return <FileText className="w-4 h-4" />;
      case 'character': return <Users className="w-4 h-4" />;
      case 'lore': return <BookOpen className="w-4 h-4" />;
      case 'snippet': return <Scissors className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  return (
    <div className="w-72 md:w-64 flex-shrink-0 border-r border-[#2D3139] bg-[#0F1218] flex flex-col h-full transition-colors duration-200 relative">
      {onCloseSidebar && (
        <button 
          onClick={onCloseSidebar}
          className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-white bg-[#1A1D26] rounded-full z-10"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="p-4 flex flex-col gap-4 pt-14 md:pt-4">
        {/* Project Selector */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <select 
              value={activeProjectId || ''} 
              onChange={(e) => {
                if (e.target.value === 'new') {
                  setIsCreatingProject(true);
                } else {
                  setActiveProjectId(e.target.value);
                }
              }}
              className="w-full appearance-none bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 pr-8 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all"
            >
              <option value="" disabled>Select Project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
              <option value="new">+ New Project</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
          {activeProjectId && (
            <div className="flex gap-1">
              <button 
                onClick={() => setIsExportModalOpen(true)}
                className="p-2 bg-[#1A1D26] border border-[#2D3139] hover:border-[#D4AF37] rounded text-gray-400 hover:text-[#D4AF37] transition-colors"
                title="Export Manuscript"
              >
                <Download className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setIsProjectSettingsOpen(true)}
                className="p-2 bg-[#1A1D26] border border-[#2D3139] hover:border-[#D4AF37] rounded text-gray-400 hover:text-[#D4AF37] transition-colors"
                title="Project Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {isCreatingProject && (
          <form onSubmit={handleCreateProject} className="flex gap-2">
            <input
              type="text"
              value={newProjectTitle}
              onChange={(e) => setNewProjectTitle(e.target.value)}
              placeholder="Project Title"
              className="flex-1 bg-[#1A1D26] border border-[#2D3139] rounded px-2 py-1 text-sm outline-none focus:border-[#D4AF37] text-gray-200"
              autoFocus
            />
          </form>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {activeProjectId && (
          <>
            <div className="flex items-center justify-between px-2 mb-4 group">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-semibold">Workspace</span>
            </div>
            
            <div className="flex items-center gap-2 px-2 mb-6">
              <button 
                onClick={() => setIsCreatingDoc(!isCreatingDoc)}
                className="flex-1 bg-gradient-to-r from-[#D4AF37] to-[#F3CF55] text-black hover:opacity-90 py-1.5 rounded-md text-xs font-semibold transition-opacity flex justify-center items-center gap-1.5 shadow-md shadow-black/20"
              >
                <Plus className="w-3.5 h-3.5" />
                New
              </button>
              
              <label className="px-3 py-1.5 bg-[#16181F] border border-[#2D3139] hover:border-[#D4AF37] hover:text-[#D4AF37] hover:bg-[#1A1D26] rounded-md text-gray-400 cursor-pointer transition-all shadow-sm flex justify-center items-center" title="Import Document (PDF, HTML, TXT, MD) to this project">
                <Upload className="w-3.5 h-3.5" />
                <input type="file" accept=".txt,.md,.html,.htm,.pdf" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const title = file.name.replace(/\.[^/.]+$/, ""); // strip extension
                    const ext = file.name.split('.').pop()?.toLowerCase();
                    
                    if (ext === 'pdf') {
                      try {
                        const pdfjsLib = await import('pdfjs-dist');
                        // @ts-ignore
                        const pdfWorker = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
                        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

                        const arrayBuffer = await file.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        let text = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                          const page = await pdf.getPage(i);
                          const textContent = await page.getTextContent();
                          text += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
                        }
                        createDocument(title, 'lore', text, ['imported-pdf']);
                      } catch (err) {
                        console.error("PDF Parsing error:", err);
                      }
                    } else {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const content = e.target?.result as string;
                        if (ext === 'html' || ext === 'htm') {
                          const parser = new DOMParser();
                          const htmlDoc = parser.parseFromString(content, 'text/html');
                          const text = htmlDoc.body.innerText || htmlDoc.body.textContent || '';
                          createDocument(title, 'lore', text, ['imported-html']);
                        } else {
                          createDocument(title, 'lore', content, ['imported-txt']);
                        }
                      };
                      reader.readAsText(file);
                    }
                  }
                }} />
              </label>
            </div>

            {isCreatingDoc && (
              <form onSubmit={handleCreateDoc} className="px-2 mb-4 flex flex-col gap-2">
                <select 
                  value={newDocType} 
                  onChange={(e) => setNewDocType(e.target.value as any)}
                  className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-2 py-1 text-sm outline-none text-gray-200"
                >
                  <option value="chapter">Chapter</option>
                  <option value="scene">Scene</option>
                  <option value="character">Character</option>
                  <option value="lore">Lore</option>
                  <option value="notes">Notes</option>
                  <option value="snippet">Snippet</option>
                </select>
                <input
                  type="text"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  placeholder="Document Title"
                  className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-2 py-1 text-sm outline-none focus:border-[#D4AF37] text-gray-200"
                  autoFocus
                />
                <button type="submit" className="hidden" />
              </form>
            )}

            {['chapter', 'scene', 'character', 'lore', 'notes', 'snippet'].map((type) => {
              const docs = groupedDocs[type];
              if (!docs?.length) return null;
              
              return (
                <div key={type} className="mb-4">
                  <div className="px-2 mb-2 text-[10px] uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    {type}s
                  </div>
                  <div className="space-y-0.5">
                    {docs.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() => setActiveDocumentId(doc.id)}
                        className={twMerge(
                          "w-full flex items-center gap-2 px-2 py-2 rounded text-sm text-left transition-colors group relative",
                          activeDocumentId === doc.id 
                            ? "bg-[#1A1D26] text-[#D4AF37] border-l-2 border-[#D4AF37]" 
                            : "text-gray-400 hover:bg-[#1A1D26]"
                        )}
                      >
                        <span className={clsx("opacity-70", activeDocumentId === doc.id && "opacity-100")}>
                          {getIcon(doc.type)}
                        </span>
                        <span className="truncate flex-1 pr-6">{doc.title}</span>
                        {(doc.tags?.includes('imported-pdf') || doc.tags?.includes('imported-html')) && (
                          <div title="Currently in AI Context" className="absolute right-2 opacity-50 hover:opacity-100 text-[#D4AF37]">
                            <Brain className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="p-4 border-t border-[#2D3139] flex items-center justify-between">
        <button 
          onClick={onOpenSettings}
          className="p-2 hover:bg-[#1A1D26] rounded text-gray-500 transition-colors flex items-center gap-2 text-[10px] uppercase tracking-widest"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button 
          onClick={toggleDarkMode}
          className="p-2 hover:bg-[#1A1D26] rounded text-[#D4AF37] transition-colors"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
      
      {isProjectSettingsOpen && (
        <ProjectSettingsModal onClose={() => setIsProjectSettingsOpen(false)} />
      )}
      
      {isExportModalOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50" />}>
          <ExportModal onClose={() => setIsExportModalOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
