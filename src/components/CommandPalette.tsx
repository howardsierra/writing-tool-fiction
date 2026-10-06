import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, LayoutGrid, Settings, Download, Sun, Moon, SlidersHorizontal, Plus, FolderOpen, FolderInput, CornerDownLeft } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useStore } from '../hooks/useStore';
import { DOCUMENT_TYPES, DocumentType } from '../types';
import { TYPE_ICONS, nextDocumentTitle } from './Sidebar';
import { toMillis } from '../utils/text';

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Simple fuzzy score: contiguous match beats subsequence; -1 when no match. */
function score(text: string, q: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return 100 - idx;
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti === -1) return -1;
    ti++;
  }
  return 10;
}

export function CommandPalette({
  onClose,
  onOpenSettings,
  onOpenExport,
  onOpenImport,
  onOpenProjectSettings,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
  onOpenProjectSettings: () => void;
}) {
  const { documents, projects, activeProjectId, setActiveProjectId, setActiveDocumentId, createDocument, isDarkMode, toggleDarkMode } = useStore();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const docs: Command[] = documents.map(d => {
      const Icon = TYPE_ICONS[d.type];
      return {
        id: `doc-${d.id}`,
        group: 'Documents',
        label: d.title || 'Untitled',
        hint: DOCUMENT_TYPES.find(t => t.id === d.type)?.label,
        icon: <Icon className="w-4 h-4" />,
        run: () => setActiveDocumentId(d.id),
      };
    });
    const create: Command[] = activeProjectId
      ? (['chapter', 'scene', 'character', 'lore', 'notes'] as DocumentType[]).map(type => ({
          id: `new-${type}`,
          group: 'Create',
          label: `New ${DOCUMENT_TYPES.find(t => t.id === type)!.label.toLowerCase()}`,
          icon: <Plus className="w-4 h-4" />,
          run: () => { createDocument(nextDocumentTitle(type, documents), type); },
        }))
      : [];
    const actions: Command[] = [
      ...(activeProjectId ? [
        { id: 'overview', group: 'Go to', label: 'Project overview', icon: <LayoutGrid className="w-4 h-4" />, run: () => setActiveDocumentId(null) },
        { id: 'export', group: 'Actions', label: 'Export manuscript…', icon: <Download className="w-4 h-4" />, run: onOpenExport },
        { id: 'project-settings', group: 'Actions', label: 'Project settings & goals…', icon: <SlidersHorizontal className="w-4 h-4" />, run: onOpenProjectSettings },
      ] : []),
      { id: 'import', group: 'Actions', label: 'Import project…', icon: <FolderInput className="w-4 h-4" />, run: onOpenImport },
      { id: 'settings', group: 'Actions', label: 'AI & app settings…', icon: <Settings className="w-4 h-4" />, run: onOpenSettings },
      { id: 'theme', group: 'Actions', label: isDarkMode ? 'Switch to light theme' : 'Switch to dark theme', icon: isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />, run: toggleDarkMode },
      ...projects.filter(p => p.id !== activeProjectId).map(p => ({
        id: `project-${p.id}`, group: 'Switch project', label: p.title, icon: <FolderOpen className="w-4 h-4" />, run: () => setActiveProjectId(p.id),
      })),
    ];
    return [...docs, ...create, ...actions];
  }, [documents, projects, activeProjectId, isDarkMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show the most recently edited documents first.
      const recent = [...documents]
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt))
        .slice(0, 6)
        .map(d => ({ ...commands.find(c => c.id === `doc-${d.id}`)!, group: 'Recent' }));
      return [...recent, ...commands.filter(c => c.group !== 'Documents')];
    }
    return commands
      .map(c => ({ c, s: score(c.label, q) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map(x => x.c);
  }, [commands, query, documents]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const execute = (cmd?: Command) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); execute(results[index]); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let lastGroup = '';

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-line bg-elevated shadow-float overflow-hidden animate-pop-in"
      >
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="w-4 h-4 text-fg-subtle" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a document or run a command…"
            className="flex-1 bg-transparent py-4 text-[15px] text-fg placeholder:text-fg-subtle outline-none"
          />
          <kbd className="text-[10px] text-fg-subtle border border-line rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <div className="py-10 text-center text-sm text-fg-subtle">No matches</div>}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {header && <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fg-subtle">{header}</div>}
                <button
                  data-index={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => execute(cmd)}
                  className={twMerge(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors',
                    i === index ? 'bg-accent-soft text-fg' : 'text-fg-muted'
                  )}
                >
                  <span className={i === index ? 'text-accent' : 'text-fg-subtle'}>{cmd.icon}</span>
                  <span className="flex-1 truncate">{cmd.label}</span>
                  {cmd.hint && <span className="text-xs text-fg-subtle">{cmd.hint}</span>}
                  {i === index && <CornerDownLeft className="w-3.5 h-3.5 text-fg-subtle" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
