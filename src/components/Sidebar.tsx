import { useMemo, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import {
  BookOpen, FileText, Users, Globe2, StickyNote, Scissors, Plus, Settings, Sun, Moon, ChevronDown, ChevronRight,
  Upload, Download, X, Search, LayoutGrid, MoreHorizontal, Copy, Trash2, Check, FolderPlus, SlidersHorizontal, LogOut, Feather, Command,
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { DOCUMENT_TYPES, DOCUMENT_STATUSES, DocumentType, Document } from '../types';
import { Popover, MenuItem, MenuDivider, inputClass, modKey } from './ui';
import { countWords } from '../utils/text';
import { readImportFile, MAX_CONTENT_LENGTH } from '../utils/importFile';
import { signOut } from '../firebase';

export const TYPE_ICONS: Record<DocumentType, typeof BookOpen> = {
  chapter: BookOpen,
  scene: FileText,
  character: Users,
  lore: Globe2,
  notes: StickyNote,
  snippet: Scissors,
};

export function nextDocumentTitle(type: DocumentType, documents: Document[]) {
  const count = documents.filter(d => d.type === type).length + 1;
  if (type === 'chapter') return `Chapter ${count}`;
  if (type === 'scene') return `Scene ${count}`;
  const label = DOCUMENT_TYPES.find(t => t.id === type)?.label ?? 'Document';
  return `Untitled ${label.toLowerCase()}`;
}

function compactCount(n: number) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenProjectSettings: () => void;
  onOpenExport: () => void;
  onOpenPalette: () => void;
  onCloseSidebar?: () => void;
}

export function Sidebar({ onOpenSettings, onOpenProjectSettings, onOpenExport, onOpenPalette, onCloseSidebar }: SidebarProps) {
  const {
    user, projects, activeProject, activeProjectId, setActiveProjectId, createProject,
    documents, activeDocumentId, setActiveDocumentId, createDocument, duplicateDocument, deleteDocument, reorderDocuments,
    isDarkMode, toggleDarkMode,
  } = useStore();
  const { toast, confirm } = useUI();

  const [filter, setFilter] = useState('');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sidebarCollapsed') || '{}'); } catch { return {}; }
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importTypeRef = useRef<DocumentType>('lore');

  const toggleGroup = (type: string) => {
    const next = { ...collapsed, [type]: !collapsed[type] };
    setCollapsed(next);
    try { localStorage.setItem('sidebarCollapsed', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const wordCounts = useMemo(() => {
    const map: Record<string, number> = {};
    documents.forEach(d => { map[d.id] = countWords(d.content); });
    return map;
  }, [documents]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(d =>
      d.title.toLowerCase().includes(q) ||
      d.tags?.some(t => t.toLowerCase().includes(q)) ||
      d.synopsis?.toLowerCase().includes(q)
    );
  }, [documents, filter]);

  const openDoc = (id: string | null) => {
    setActiveDocumentId(id);
    onCloseSidebar?.();
  };

  const handleCreate = async (type: DocumentType) => {
    if (collapsed[type]) toggleGroup(type);
    await createDocument(nextDocumentTitle(type, documents), type);
    onCloseSidebar?.();
  };

  const handleDelete = async (doc: Document) => {
    const ok = await confirm({
      title: `Delete “${doc.title}”?`,
      message: 'This permanently removes the document and its version history.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      await deleteDocument(doc.id);
      toast('Document deleted', 'success');
    }
  };

  const handleDrop = (targetId: string, type: DocumentType) => {
    if (!dragId || dragId === targetId) return;
    const group = documents.filter(d => d.type === type).map(d => d.id);
    if (!group.includes(dragId)) return;
    const without = group.filter(id => id !== dragId);
    without.splice(without.indexOf(targetId), 0, dragId);
    reorderDocuments(without);
  };

  const startImport = (type: DocumentType) => {
    importTypeRef.current = type;
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsImporting(true);
    try {
      const { title, content, tag } = await readImportFile(file);
      if (!content.trim()) {
        toast('That file appears to be empty.', 'error');
        return;
      }
      const type = importTypeRef.current;
      if (content.length <= MAX_CONTENT_LENGTH) {
        await createDocument(title, type, content, { tags: [tag] });
      } else {
        // Split oversized files on paragraph boundaries.
        const parts: string[] = [];
        let current = '';
        for (const para of content.split(/\n{2,}/)) {
          if ((current + para).length > MAX_CONTENT_LENGTH - 2 && current) {
            parts.push(current);
            current = '';
          }
          current += (current ? '\n\n' : '') + para;
        }
        if (current) parts.push(current);
        for (let i = 0; i < parts.length; i++) {
          await createDocument(`${title} (part ${i + 1})`, type, parts[i].slice(0, MAX_CONTENT_LENGTH), { tags: [tag], activate: i === 0 });
        }
        toast(`Large file split into ${parts.length} documents.`, 'info');
      }
      toast(`Imported “${title}”`, 'success');
    } catch (err: any) {
      console.error('Import failed', err);
      toast(`Import failed: ${err.message || 'unknown error'}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent, close: () => void) => {
    e.preventDefault();
    const title = newProjectTitle.trim();
    if (!title) return;
    await createProject(title.slice(0, 100));
    setNewProjectTitle('');
    close();
  };

  return (
    <aside className="w-[288px] md:w-[272px] flex-shrink-0 h-full flex flex-col border-r border-line bg-surface">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center shadow-soft">
            <Feather className="w-3.5 h-3.5 text-on-accent" />
          </div>
          <span className="font-serif text-[17px] italic text-fg tracking-tight">The Author's Desk</span>
        </div>
        {onCloseSidebar && (
          <button onClick={onCloseSidebar} className="md:hidden p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-hover" aria-label="Close sidebar">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Project switcher */}
      <div className="px-3 pb-2">
        <Popover
          align="left"
          className="w-[264px] md:w-[248px]"
          trigger={({ open, toggle }) => (
            <button
              onClick={toggle}
              className={twMerge(
                'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border transition-all text-left',
                open ? 'border-accent/40 bg-elevated' : 'border-line bg-elevated/60 hover:border-line-strong'
              )}
            >
              <div className="w-7 h-7 rounded-md bg-accent-soft text-accent flex items-center justify-center font-serif text-sm font-semibold flex-shrink-0">
                {(activeProject?.title || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle leading-none mb-1">Project</div>
                <div className="text-sm font-medium text-fg truncate leading-tight">{activeProject?.title || 'No project yet'}</div>
              </div>
              <ChevronDown className={twMerge('w-4 h-4 text-fg-subtle transition-transform', open && 'rotate-180')} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="max-h-56 overflow-y-auto">
                {projects.map(p => (
                  <MenuItem
                    key={p.id}
                    icon={p.id === activeProjectId ? <Check className="w-4 h-4 text-accent" /> : <span className="w-4" />}
                    onClick={() => { setActiveProjectId(p.id); close(); }}
                  >
                    <span className="truncate block">{p.title}</span>
                  </MenuItem>
                ))}
              </div>
              {projects.length > 0 && <MenuDivider />}
              <form onSubmit={(e) => handleCreateProject(e, close)} className="flex items-center gap-1.5 p-1">
                <input
                  value={newProjectTitle}
                  onChange={e => setNewProjectTitle(e.target.value)}
                  placeholder="New project title…"
                  maxLength={100}
                  className={twMerge(inputClass, 'py-1.5 text-[13px]')}
                />
                <button type="submit" disabled={!newProjectTitle.trim()} className="p-2 rounded-lg bg-accent text-on-accent disabled:opacity-40" aria-label="Create project">
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </form>
              {activeProject && (
                <>
                  <MenuDivider />
                  <MenuItem icon={<SlidersHorizontal className="w-4 h-4" />} onClick={() => { close(); onOpenProjectSettings(); }}>Project settings & goals</MenuItem>
                  <MenuItem icon={<Download className="w-4 h-4" />} onClick={() => { close(); onOpenExport(); }}>Export manuscript</MenuItem>
                </>
              )}
            </>
          )}
        </Popover>
      </div>

      {activeProjectId && (
        <>
          {/* Search */}
          <div className="px-3 pb-2 flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle" />
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter documents"
                className="w-full bg-transparent border border-transparent hover:border-line focus:border-line-strong rounded-lg pl-8 pr-7 py-1.5 text-[13px] text-fg placeholder:text-fg-subtle outline-none transition-colors"
              />
              {filter && (
                <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg" aria-label="Clear filter">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={onOpenPalette}
              className="hidden md:flex items-center gap-1 px-2 rounded-lg text-[11px] text-fg-subtle hover:text-fg hover:bg-hover border border-line"
              title={`Command palette (${modKey}K)`}
            >
              <Command className="w-3 h-3" />K
            </button>
          </div>

          {/* Overview link */}
          <div className="px-3">
            <button
              onClick={() => openDoc(null)}
              className={twMerge(
                'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors',
                activeDocumentId === null ? 'bg-accent-soft text-accent font-medium' : 'text-fg-muted hover:bg-hover hover:text-fg'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Overview
            </button>
          </div>
        </>
      )}

      {/* Document tree */}
      <nav className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        {activeProjectId && DOCUMENT_TYPES.map(({ id: type, plural }) => {
          const docs = filtered.filter(d => d.type === type);
          const total = documents.filter(d => d.type === type).length;
          if (type === 'snippet' && total === 0) return null;
          if (filter && docs.length === 0) return null;
          const isCollapsed = collapsed[type] && !filter;
          const Icon = TYPE_ICONS[type];

          return (
            <div key={type} className="mb-3">
              <div className="group flex items-center gap-1 px-1 mb-0.5">
                <button
                  onClick={() => toggleGroup(type)}
                  className="flex-1 flex items-center gap-1.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle hover:text-fg-muted transition-colors"
                >
                  <ChevronRight className={twMerge('w-3 h-3 transition-transform', !isCollapsed && 'rotate-90')} />
                  {plural}
                  <span className="font-normal tracking-normal text-fg-subtle/70">{total || ''}</span>
                </button>
                {type !== 'snippet' && (
                  <button
                    onClick={() => handleCreate(type)}
                    className="p-1 rounded-md text-fg-subtle opacity-60 md:opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-hover transition-all"
                    title={`New ${DOCUMENT_TYPES.find(t => t.id === type)?.label.toLowerCase()}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="space-y-px">
                  {docs.length === 0 && (
                    <button
                      onClick={() => handleCreate(type)}
                      className="w-full text-left pl-7 pr-2 py-1.5 text-[12px] text-fg-subtle hover:text-accent transition-colors italic"
                    >
                      + Add {DOCUMENT_TYPES.find(t => t.id === type)?.label.toLowerCase()}
                    </button>
                  )}
                  {docs.map(doc => {
                    const active = activeDocumentId === doc.id;
                    const status = DOCUMENT_STATUSES.find(s => s.id === doc.status);
                    return (
                      <div
                        key={doc.id}
                        role="button"
                        tabIndex={0}
                        draggable={!filter}
                        onClick={() => openDoc(doc.id)}
                        onKeyDown={e => e.key === 'Enter' && openDoc(doc.id)}
                        onDragStart={() => setDragId(doc.id)}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                        onDragOver={e => {
                          if (!dragId || documents.find(d => d.id === dragId)?.type !== type) return;
                          e.preventDefault();
                          setDropTarget(doc.id);
                        }}
                        onDragLeave={() => setDropTarget(t => (t === doc.id ? null : t))}
                        onDrop={e => { e.preventDefault(); handleDrop(doc.id, type); setDropTarget(null); }}
                        title={doc.synopsis || doc.title}
                        className={twMerge(
                          'group/item relative flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg text-[13px] cursor-pointer select-none transition-colors outline-none',
                          active ? 'bg-elevated text-fg shadow-soft ring-1 ring-line' : 'text-fg-muted hover:bg-hover hover:text-fg',
                          dragId === doc.id && 'opacity-40',
                          dropTarget === doc.id && dragId !== doc.id && 'ring-1 ring-accent/60'
                        )}
                      >
                        {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent" />}
                        <Icon className={twMerge('w-3.5 h-3.5 flex-shrink-0', active ? 'text-accent' : 'text-fg-subtle')} />
                        <span className="truncate flex-1">{doc.title || 'Untitled'}</span>
                        {status && (
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: status.color }} title={status.label} />
                        )}
                        <span className="text-[10px] tabular-nums text-fg-subtle group-hover/item:hidden w-7 text-right">
                          {wordCounts[doc.id] ? compactCount(wordCounts[doc.id]) : ''}
                        </span>
                        <div className="hidden group-hover/item:block" onClick={e => e.stopPropagation()}>
                          <Popover
                            trigger={({ toggle }) => (
                              <button onClick={toggle} className="p-0.5 rounded text-fg-subtle hover:text-fg hover:bg-hover" aria-label="Document actions">
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <MenuItem icon={<Copy className="w-4 h-4" />} onClick={() => { close(); duplicateDocument(doc.id); }}>Duplicate</MenuItem>
                                <MenuItem icon={<Trash2 className="w-4 h-4" />} danger onClick={() => { close(); handleDelete(doc); }}>Delete</MenuItem>
                              </>
                            )}
                          </Popover>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {activeProjectId && (
          <div className="mt-2 px-1">
            <Popover
              align="left"
              side="top"
              trigger={({ toggle }) => (
                <button
                  onClick={toggle}
                  disabled={isImporting}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-line text-[12px] text-fg-subtle hover:text-fg hover:border-line-strong transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isImporting ? 'Importing…' : 'Import file (PDF, TXT, MD, HTML)'}
                </button>
              )}
            >
              {(close) => (
                <>
                  <div className="px-2.5 pt-1 pb-1.5 text-[11px] text-fg-subtle">Import as…</div>
                  {(['chapter', 'lore', 'character', 'notes'] as DocumentType[]).map(t => {
                    const Icon = TYPE_ICONS[t];
                    return (
                      <MenuItem key={t} icon={<Icon className="w-4 h-4" />} onClick={() => { close(); startImport(t); }}>
                        {DOCUMENT_TYPES.find(d => d.id === t)?.label}
                      </MenuItem>
                    );
                  })}
                </>
              )}
            </Popover>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf" className="hidden" onChange={handleImportFile} />
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-line flex items-center gap-1">
        <Popover
          align="left"
          side="top"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex-1 min-w-0 flex items-center gap-2 p-1.5 rounded-lg hover:bg-hover transition-colors text-left">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-7 h-7 rounded-full ring-1 ring-line" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-accent-soft text-accent flex items-center justify-center text-xs font-semibold">
                  {(user?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-[13px] text-fg-muted truncate">{user?.displayName || user?.email}</span>
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2.5 py-2 text-xs text-fg-subtle truncate">{user?.email}</div>
              <MenuDivider />
              <MenuItem icon={<LogOut className="w-4 h-4" />} onClick={() => { close(); signOut(); }}>Sign out</MenuItem>
            </>
          )}
        </Popover>
        <button onClick={onOpenSettings} className="p-2 rounded-lg text-fg-subtle hover:text-fg hover:bg-hover transition-colors" title="AI & app settings" aria-label="Settings">
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={toggleDarkMode} className="p-2 rounded-lg text-fg-subtle hover:text-accent hover:bg-hover transition-colors" title={isDarkMode ? 'Light mode' : 'Dark mode'} aria-label="Toggle theme">
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
