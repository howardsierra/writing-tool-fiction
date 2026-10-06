import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback, useDeferredValue, lazy, Suspense } from 'react';
import { useStore, typeLabel } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { recordWords, useWritingStats } from '../hooks/useWritingStats';
import {
  Search, Eye, PenLine, Maximize2, Minimize2, Clock, MoreHorizontal, Menu, Image as ImageIcon, Sparkles, Scissors,
  GitMerge, Copy, Trash2, Download, Type, X, Activity, Cloud, CloudOff, Loader2, AlertCircle, RefreshCw, Hash, Camera,
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { Document, DocumentType, DOCUMENT_TYPES, DOCUMENT_STATUSES, EditorPrefs, MANUSCRIPT_TYPES } from '../types';
import { calculateFleschKincaid } from '../utils/readability';
import { countWords, readingMinutes, formatNumber, downloadBlob, safeFilename } from '../utils/text';
import { compressImage } from '../utils/image';
import { IconButton, Popover, MenuItem, MenuDivider, ProgressRing, modKey } from './ui';
import { FindReplaceBar, FindOptions, findMatches } from './FindReplaceBar';
import { AIComposer, EditorBridge } from './AIComposer';
import { TYPE_ICONS } from './Sidebar';

const ImageGenerationModal = lazy(() => import('./ImageGenerationModal').then(m => ({ default: m.ImageGenerationModal })));
const VersionHistoryModal = lazy(() => import('./VersionHistoryModal').then(m => ({ default: m.VersionHistoryModal })));
const LoreExtractionModal = lazy(() => import('./LoreExtractionModal').then(m => ({ default: m.LoreExtractionModal })));
const MergeDocumentModal = lazy(() => import('./MergeDocumentModal').then(m => ({ default: m.MergeDocumentModal })));

const SAVE_DELAY = 800;
const FONT_FAMILIES: Record<EditorPrefs['font'], string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
};
const PAGE_WIDTHS: Record<EditorPrefs['width'], number> = { narrow: 600, medium: 720, wide: 900 };

type ModalName = 'image' | 'history' | 'extract' | 'merge' | null;

export function Editor({
  document: activeDoc,
  onOpenSidebar,
  isFocusMode,
  onToggleFocusMode,
}: {
  document: Document;
  onOpenSidebar?: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}) {
  const {
    documents, activeProject, activeProjectId, updateDocument, deleteDocument, duplicateDocument, createDocument,
    saveVersion, saveStatus, lastCreatedId, editorPrefs, setEditorPrefs, aiConfig,
  } = useStore();
  const { toast, confirm } = useUI();
  const stats = useWritingStats(activeProjectId);

  const [content, setContent] = useState(activeDoc.content);
  const [title, setTitle] = useState(activeDoc.title);
  const [synopsis, setSynopsis] = useState(activeDoc.synopsis || '');
  const [newTag, setNewTag] = useState('');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [composerFocus, setComposerFocus] = useState(0);

  const [showFind, setShowFind] = useState(false);
  const [findOptions, setFindOptions] = useState<FindOptions>({ query: '', replace: '', matchCase: false, wholeWord: false });
  const [matchIndex, setMatchIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const synopsisRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<Partial<Document> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordCountRef = useRef(countWords(activeDoc.content));
  const programmaticEditRef = useRef(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const updateRef = useRef(updateDocument);
  updateRef.current = updateDocument;

  /* ---------- Saving ---------- */

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const updates = pendingRef.current;
    pendingRef.current = null;
    if (updates) updateRef.current(activeDoc.id, updates);
  }, [activeDoc.id]);

  const scheduleSave = useCallback((updates: Partial<Document>) => {
    pendingRef.current = { ...(pendingRef.current || {}), ...updates };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Flush on unmount (switching documents) and when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pendingRef.current) {
        flush();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      flush();
    };
  }, [flush]);

  // Accept remote changes (another tab/device, version restore, merges) when we have nothing pending.
  useEffect(() => {
    if (pendingRef.current?.content !== undefined) return;
    if (activeDoc.content !== contentRef.current) {
      setContent(activeDoc.content);
      wordCountRef.current = countWords(activeDoc.content);
    }
  }, [activeDoc.content]);

  useEffect(() => {
    if (pendingRef.current?.title === undefined && activeDoc.title !== title && document.activeElement !== titleRef.current) {
      setTitle(activeDoc.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoc.title]);

  useEffect(() => {
    if (pendingRef.current?.synopsis === undefined && document.activeElement !== synopsisRef.current) {
      setSynopsis(activeDoc.synopsis || '');
    }
  }, [activeDoc.synopsis]);

  // Focus the title of a freshly created document.
  useEffect(() => {
    if (lastCreatedId === activeDoc.id && !activeDoc.content) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Content editing ---------- */

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    const words = countWords(newContent);
    if (!programmaticEditRef.current && activeProjectId) {
      recordWords(activeProjectId, words - wordCountRef.current);
    }
    wordCountRef.current = words;
    scheduleSave({ content: newContent });
  };

  /** Applies an edit through the textarea so native undo (Ctrl+Z) keeps working. */
  const applyEdit = useCallback((start: number, end: number, text: string) => {
    const ta = textareaRef.current;
    programmaticEditRef.current = true;
    let applied = false;
    if (ta && !isPreviewMode) {
      ta.focus();
      ta.setSelectionRange(start, end);
      try {
        applied = document.execCommand('insertText', false, text);
      } catch {
        applied = false;
      }
    }
    if (!applied) {
      const current = contentRef.current;
      handleContentChange(current.slice(0, start) + text + current.slice(end));
    }
    programmaticEditRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewMode]);

  const bridge: EditorBridge = useMemo(() => ({
    getSelection: () => {
      const ta = textareaRef.current;
      const start = ta ? ta.selectionStart : contentRef.current.length;
      const end = ta ? ta.selectionEnd : contentRef.current.length;
      return { start, end, text: contentRef.current.slice(start, end) };
    },
    getContent: () => contentRef.current,
    applyEdit,
  }), [applyEdit]);

  const handleTitleChange = (value: string) => {
    const clean = value.replace(/\n/g, ' ').slice(0, 200);
    setTitle(clean);
    scheduleSave({ title: clean });
  };

  const handleSynopsisChange = (value: string) => {
    const clean = value.slice(0, 2000);
    setSynopsis(clean);
    scheduleSave({ synopsis: clean });
  };

  const tags = activeDoc.tags || [];
  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '').slice(0, 50);
    if (!tag || tags.includes(tag)) return;
    if (tags.length >= 20) {
      toast('Documents can have up to 20 tags.', 'info');
      return;
    }
    updateDocument(activeDoc.id, { tags: [...tags, tag] });
  };
  const removeTag = (tag: string) => updateDocument(activeDoc.id, { tags: tags.filter(t => t !== tag) });

  /* ---------- Layout: auto-growing textareas ---------- */

  const fitTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const scroller = scrollRef.current;
    const top = scroller?.scrollTop ?? 0;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
    if (scroller) scroller.scrollTop = top;
  };

  useLayoutEffect(() => {
    fitTextarea(textareaRef.current);
  }, [content, editorPrefs, isPreviewMode]);

  useLayoutEffect(() => {
    fitTextarea(titleRef.current);
    fitTextarea(synopsisRef.current);
  }, [title, synopsis]);

  useEffect(() => {
    const onResize = () => {
      fitTextarea(textareaRef.current);
      fitTextarea(titleRef.current);
      fitTextarea(synopsisRef.current);
    };
    window.addEventListener('resize', onResize);
    // Fonts load asynchronously and change line wrapping.
    document.fonts?.ready.then(onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /** Keeps the caret visible above the AI composer when typing near the bottom. */
  const keepCaretVisible = () => {
    const ta = textareaRef.current;
    const scroller = scrollRef.current;
    if (!ta || !scroller) return;
    if (ta.selectionEnd >= ta.value.length - 1) {
      const bottom = ta.offsetTop + ta.offsetHeight;
      const visibleBottom = scroller.scrollTop + scroller.clientHeight - 180;
      if (bottom > visibleBottom) scroller.scrollTop = bottom - scroller.clientHeight + 180;
    }
  };

  /* ---------- Find & replace ---------- */

  const matches = useMemo(
    () => (showFind ? findMatches(content, findOptions) : []),
    [showFind, content, findOptions]
  );
  const currentMatch = matches.length ? Math.min(matchIndex, matches.length - 1) : -1;

  useEffect(() => setMatchIndex(0), [findOptions.query, findOptions.matchCase, findOptions.wholeWord]);

  useEffect(() => {
    if (currentMatch < 0 || !showFind) return;
    const m = matches[currentMatch];
    textareaRef.current?.setSelectionRange(m.start, m.end);
    requestAnimationFrame(() => {
      const mark = overlayRef.current?.querySelector('mark[data-current="true"]') as HTMLElement | null;
      const scroller = scrollRef.current;
      if (!mark || !scroller) return;
      const markTop = mark.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      if (markTop < scroller.scrollTop + 80 || markTop > scroller.scrollTop + scroller.clientHeight - 200) {
        scroller.scrollTo({ top: markTop - scroller.clientHeight / 3, behavior: 'smooth' });
      }
    });
  }, [currentMatch, matches, showFind]);

  const replaceCurrent = () => {
    if (currentMatch < 0) return;
    const m = matches[currentMatch];
    applyEdit(m.start, m.end, findOptions.replace);
  };

  const replaceAll = () => {
    if (!matches.length) return;
    let result = '';
    let last = 0;
    for (const m of matches) {
      result += content.slice(last, m.start) + findOptions.replace;
      last = m.end;
    }
    result += content.slice(last);
    const count = matches.length;
    applyEdit(0, content.length, result);
    toast(`Replaced ${count} occurrence${count === 1 ? '' : 's'}`, 'success');
  };

  const closeFind = () => {
    setShowFind(false);
    textareaRef.current?.focus();
  };

  /* ---------- Actions ---------- */

  const handleSnapshot = async () => {
    flush();
    await saveVersion(activeDoc.id, contentRef.current, `Snapshot · ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
    toast('Snapshot saved to version history', 'success');
  };

  const handleSaveSnippet = async () => {
    const { text } = bridge.getSelection();
    if (!text.trim()) {
      toast('Highlight some text first to save it as a snippet.', 'info');
      return;
    }
    const firstWords = text.trim().split(/\s+/).slice(0, 6).join(' ');
    await createDocument(`${firstWords}…`.slice(0, 200), 'snippet', text, { activate: false, tags: [activeDoc.title.slice(0, 50)] });
    toast('Snippet saved', 'success');
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete “${activeDoc.title}”?`,
      message: 'This permanently removes the document and its version history.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) {
      pendingRef.current = null;
      await deleteDocument(activeDoc.id);
      toast('Document deleted', 'success');
    }
  };

  const handleDownload = () => {
    flush();
    const body = `# ${title}\n\n${synopsis ? `> ${synopsis}\n\n` : ''}${contentRef.current}`;
    downloadBlob(new Blob([body], { type: 'text/markdown;charset=utf-8' }), `${safeFilename(title)}.md`);
  };

  const handleGenerateImage = async (prompt: string, referenceImage: string | null, provider: string, model: string) => {
    // Shrink the reference so the request stays under serverless body limits (~4.5 MB on Vercel).
    const reference = referenceImage ? await compressImage(referenceImage, 1024, 0.85) : null;
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, prompt, referenceImage: reference, customApiKey: aiConfig.apiKeys?.[provider] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.imageUrl) throw new Error(data.error || 'Failed to generate image');
    const imageUrl = await compressImage(data.imageUrl);
    await updateDocument(activeDoc.id, { imageUrl });
    toast('Image added', 'success');
  };

  /* ---------- Keyboard shortcuts ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey) {
        e.preventDefault();
        setIsPreviewMode(false);
        if (showFind) {
          // Re-focus the find field when already open.
          (document.querySelector('[placeholder="Find"]') as HTMLInputElement | null)?.select();
        } else {
          const { text } = bridge.getSelection();
          if (text && text.length < 100 && !text.includes('\n')) setFindOptions(o => ({ ...o, query: text }));
          setShowFind(true);
        }
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onToggleFocusMode();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSnapshot();
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setComposerFocus(n => n + 1);
      } else if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsPreviewMode(p => !p);
      } else if (e.key === 'Escape' && isFocusMode && !modal && document.activeElement === textareaRef.current) {
        onToggleFocusMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- Derived stats ---------- */

  const deferredContent = useDeferredValue(content);
  const wordCount = useMemo(() => countWords(deferredContent), [deferredContent]);
  const readability = useMemo(() => calculateFleschKincaid(deferredContent), [deferredContent]);
  const selectionWords = selection.end > selection.start ? countWords(content.slice(selection.start, selection.end)) : 0;
  const dailyGoal = activeProject?.dailyGoal || 0;

  const TypeIcon = TYPE_ICONS[activeDoc.type];
  const isManuscript = MANUSCRIPT_TYPES.includes(activeDoc.type);
  const pageWidth = PAGE_WIDTHS[editorPrefs.width];

  const textStyle: React.CSSProperties = {
    fontFamily: FONT_FAMILIES[editorPrefs.font],
    fontSize: `${editorPrefs.fontSize}px`,
    lineHeight: editorPrefs.lineHeight,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'normal',
    letterSpacing: editorPrefs.font === 'mono' ? '-0.01em' : undefined,
  };

  const highlighted = useMemo(() => {
    if (!showFind || !matches.length) return null;
    const parts: React.ReactNode[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      parts.push(content.slice(last, m.start));
      parts.push(
        <mark
          key={i}
          data-current={i === currentMatch}
          className={twMerge('rounded-[3px] text-transparent', i === currentMatch ? 'bg-accent/55' : 'bg-accent/20')}
        >
          {content.slice(m.start, m.end)}
        </mark>
      );
      last = m.end;
    });
    parts.push(content.slice(last) + '​');
    return parts;
  }, [showFind, matches, currentMatch, content]);

  return (
    <div className={twMerge('flex-1 flex flex-col min-w-0 h-full bg-base relative', isFocusMode && 'fixed inset-0 z-40')}>
      {/* Toolbar */}
      <header className={twMerge(
        'flex-shrink-0 h-14 flex items-center gap-2 px-3 md:px-5 border-b border-line bg-base/80 backdrop-blur z-30 transition-opacity duration-300',
        isFocusMode && 'opacity-0 hover:opacity-100 focus-within:opacity-100 border-transparent'
      )}>
        {onOpenSidebar && !isFocusMode && (
          <IconButton label="Open sidebar" onClick={onOpenSidebar} className="md:hidden -ml-1">
            <Menu className="w-5 h-5" />
          </IconButton>
        )}

        <div className="flex items-center gap-2 min-w-0 flex-1 text-[13px]">
          <TypeIcon className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="hidden sm:inline text-fg-subtle truncate max-w-[180px]">{activeProject?.title}</span>
          <span className="hidden sm:inline text-fg-subtle">/</span>
          <span className="text-fg truncate font-medium">{title || 'Untitled'}</span>
        </div>

        <div className="flex items-center gap-0.5">
          <IconButton label={`Find & replace (${modKey}F)`} active={showFind} onClick={() => (showFind ? closeFind() : setShowFind(true))}>
            <Search className="w-[18px] h-[18px]" />
          </IconButton>
          <IconButton label={isPreviewMode ? `Edit (${modKey}E)` : `Preview Markdown (${modKey}E)`} active={isPreviewMode} onClick={() => setIsPreviewMode(!isPreviewMode)}>
            {isPreviewMode ? <PenLine className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
          </IconButton>

          <Popover
            className="w-72 p-4"
            trigger={({ open, toggle }) => (
              <IconButton label="Typography" active={open} onClick={toggle} className="hidden sm:block">
                <Type className="w-[18px] h-[18px]" />
              </IconButton>
            )}
          >
            {() => <TypographyPanel prefs={editorPrefs} onChange={setEditorPrefs} />}
          </Popover>

          <IconButton label={isFocusMode ? 'Exit focus mode (Esc)' : `Focus mode (${modKey}⇧F)`} active={isFocusMode} onClick={onToggleFocusMode}>
            {isFocusMode ? <Minimize2 className="w-[18px] h-[18px]" /> : <Maximize2 className="w-[18px] h-[18px]" />}
          </IconButton>
          <IconButton label="Version history" onClick={() => { flush(); setModal('history'); }} className="hidden sm:block">
            <Clock className="w-[18px] h-[18px]" />
          </IconButton>

          <Popover
            className="w-64"
            trigger={({ open, toggle }) => (
              <IconButton label="More actions" active={open} onClick={toggle}>
                <MoreHorizontal className="w-[18px] h-[18px]" />
              </IconButton>
            )}
          >
            {(close) => {
              const act = (fn: () => void) => () => { close(); fn(); };
              return (
                <>
                  <MenuItem icon={<Camera className="w-4 h-4" />} shortcut={`${modKey}S`} onClick={act(handleSnapshot)}>Save snapshot</MenuItem>
                  <MenuItem icon={<Clock className="w-4 h-4" />} onClick={act(() => { flush(); setModal('history'); })}>Version history</MenuItem>
                  <MenuDivider />
                  <MenuItem icon={<Sparkles className="w-4 h-4" />} onClick={act(() => { flush(); setModal('extract'); })}>Extract characters & lore</MenuItem>
                  <MenuItem icon={<ImageIcon className="w-4 h-4" />} onClick={act(() => setModal('image'))}>{activeDoc.imageUrl ? 'Regenerate image' : 'Generate image'}</MenuItem>
                  <MenuItem icon={<Scissors className="w-4 h-4" />} onClick={act(handleSaveSnippet)}>Save selection as snippet</MenuItem>
                  <MenuDivider />
                  <MenuItem icon={<GitMerge className="w-4 h-4" />} onClick={act(() => { flush(); setModal('merge'); })}>Merge another document in…</MenuItem>
                  <MenuItem icon={<Copy className="w-4 h-4" />} onClick={act(() => { flush(); duplicateDocument(activeDoc.id); })}>Duplicate</MenuItem>
                  <MenuItem icon={<Download className="w-4 h-4" />} onClick={act(handleDownload)}>Download as Markdown</MenuItem>
                  <MenuDivider />
                  <MenuItem icon={<Trash2 className="w-4 h-4" />} danger onClick={act(handleDelete)}>Delete document</MenuItem>
                </>
              );
            }}
          </Popover>
        </div>
      </header>

      {showFind && (
        <FindReplaceBar
          options={findOptions}
          onChange={setFindOptions}
          matchCount={matches.length}
          currentIndex={currentMatch}
          onNext={() => setMatchIndex(i => (matches.length ? (Math.min(i, matches.length - 1) + 1) % matches.length : 0))}
          onPrev={() => setMatchIndex(i => (matches.length ? (Math.min(i, matches.length - 1) - 1 + matches.length) % matches.length : 0))}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={closeFind}
        />
      )}

      {/* Page */}
      <div className="flex-1 relative min-h-0">
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto paper-grain" style={{ scrollPaddingBottom: 200 }}>
          <div className="mx-auto px-5 sm:px-8 pt-8 md:pt-14 pb-[45vh]" style={{ maxWidth: pageWidth + 64 }}>
            {activeDoc.imageUrl && (
              <div className="group relative mb-8 rounded-2xl overflow-hidden border border-line bg-sunken shadow-soft">
                <img
                  src={activeDoc.imageUrl}
                  alt={title}
                  referrerPolicy="no-referrer"
                  className={twMerge('w-full object-cover', activeDoc.type === 'character' ? 'max-h-[460px] object-top' : 'max-h-[360px]')}
                />
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal('image')} className="p-2 rounded-lg bg-black/55 text-white backdrop-blur hover:bg-black/75" title="Regenerate image">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button onClick={() => updateDocument(activeDoc.id, { imageUrl: '' })} className="p-2 rounded-lg bg-black/55 text-white backdrop-blur hover:bg-red-600/80" title="Remove image">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Title */}
            <textarea
              ref={titleRef}
              value={title}
              rows={1}
              onChange={e => handleTitleChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  textareaRef.current?.focus();
                }
              }}
              placeholder="Untitled"
              className="w-full bg-transparent resize-none outline-none font-serif text-[34px] md:text-[44px] leading-[1.12] tracking-[-0.015em] text-fg placeholder:text-fg-subtle/50 overflow-hidden"
            />

            {/* Meta */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <MetaSelect
                value={activeDoc.type}
                onChange={v => updateDocument(activeDoc.id, { type: v as DocumentType })}
                options={DOCUMENT_TYPES.map(t => ({ value: t.id, label: t.label }))}
              />
              {isManuscript && (
                <MetaSelect
                  value={activeDoc.status || 'draft'}
                  onChange={v => updateDocument(activeDoc.id, { status: v as Document['status'] })}
                  options={DOCUMENT_STATUSES.map(s => ({ value: s.id, label: s.label }))}
                  dot={DOCUMENT_STATUSES.find(s => s.id === (activeDoc.status || 'draft'))?.color}
                />
              )}
              {tags.map(tag => (
                <span key={tag} className="group inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md bg-hover text-fg-muted">
                  <Hash className="w-3 h-3 text-fg-subtle" />
                  {tag}
                  <button onClick={() => removeTag(tag)} className="p-0.5 rounded text-fg-subtle hover:text-danger" aria-label={`Remove tag ${tag}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={newTag}
                onChange={e => {
                  const v = e.target.value;
                  if (v.endsWith(',')) { addTag(v); setNewTag(''); } else setNewTag(v);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(newTag); setNewTag(''); }
                  if (e.key === 'Backspace' && !newTag && tags.length) removeTag(tags[tags.length - 1]);
                }}
                onBlur={() => { if (newTag.trim()) { addTag(newTag); setNewTag(''); } }}
                placeholder="+ tag"
                className="w-20 bg-transparent outline-none py-1 text-fg-muted placeholder:text-fg-subtle"
              />
            </div>

            <textarea
              ref={synopsisRef}
              value={synopsis}
              rows={1}
              onChange={e => handleSynopsisChange(e.target.value)}
              placeholder="Add a one-line synopsis…"
              className="mt-3 w-full bg-transparent resize-none outline-none text-[15px] italic leading-relaxed text-fg-muted placeholder:text-fg-subtle/70 font-serif overflow-hidden"
            />

            <div className="my-7 flex items-center gap-3 text-fg-subtle/60" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[10px] tracking-[0.5em]">❦</span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {/* Body */}
            {isPreviewMode ? (
              <div
                className="prose prose-theme max-w-none break-words prose-p:leading-[inherit] prose-headings:font-serif prose-headings:font-normal"
                style={{ fontFamily: FONT_FAMILIES[editorPrefs.font], fontSize: `${editorPrefs.fontSize}px`, lineHeight: editorPrefs.lineHeight }}
              >
                {content.trim() ? (
                  <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                ) : (
                  <p className="italic text-fg-subtle">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <div className="relative">
                {highlighted && (
                  <div ref={overlayRef} aria-hidden className="absolute inset-0 pointer-events-none text-transparent select-none" style={textStyle}>
                    {highlighted}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => { handleContentChange(e.target.value); keepCaretVisible(); }}
                  onSelect={e => {
                    const t = e.currentTarget;
                    setSelection({ start: t.selectionStart, end: t.selectionEnd });
                  }}
                  spellCheck
                  placeholder={isManuscript ? 'Begin your story…' : 'Start writing…'}
                  className="manuscript relative block w-full min-h-[40vh] bg-transparent resize-none outline-none border-none text-fg overflow-hidden"
                  style={textStyle}
                />
              </div>
            )}
          </div>
        </div>

        <AIComposer
          activeDoc={{ ...activeDoc, title, content, synopsis }}
          bridge={bridge}
          selectionWords={selectionWords}
          dimmed={isFocusMode}
          focusSignal={composerFocus}
        />
      </div>

      {/* Status bar */}
      <footer className={twMerge(
        'flex-shrink-0 h-9 flex items-center justify-between gap-4 px-3 md:px-5 border-t border-line bg-base text-[11px] text-fg-subtle tabular-nums transition-opacity duration-300',
        isFocusMode && 'opacity-30 hover:opacity-100 border-transparent'
      )}>
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <span className="text-fg-muted">{formatNumber(wordCount)} words</span>
          {selectionWords > 0 && <span className="text-accent">{formatNumber(selectionWords)} selected</span>}
          <span className="hidden sm:inline">{readingMinutes(wordCount)} min read</span>
          {readability.label && (
            <span className="hidden md:flex items-center gap-1" title={`Flesch reading ease: ${readability.score}`}>
              <Activity className="w-3 h-3" /> {readability.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <span className="flex items-center gap-1.5" title={dailyGoal ? `Daily goal: ${formatNumber(dailyGoal)} words` : 'Set a daily goal in Project settings'}>
            {dailyGoal > 0 && <ProgressRing value={stats.today / dailyGoal} size={14} stroke={2} />}
            <span>
              {formatNumber(stats.today)}{dailyGoal ? ` / ${formatNumber(dailyGoal)}` : ''} today
            </span>
            {stats.streak > 1 && <span className="hidden sm:inline text-accent">· {stats.streak}-day streak</span>}
          </span>
          <SaveIndicator status={saveStatus} />
        </div>
      </footer>

      <Suspense fallback={null}>
        {modal === 'image' && (
          <ImageGenerationModal
            onClose={() => setModal(null)}
            onGenerate={handleGenerateImage}
            defaultPrompt={buildImagePrompt(activeDoc.type, title, synopsis, content)}
          />
        )}
        {modal === 'history' && <VersionHistoryModal document={{ ...activeDoc, content }} onClose={() => setModal(null)} />}
        {modal === 'extract' && <LoreExtractionModal document={{ ...activeDoc, content }} onClose={() => setModal(null)} />}
        {modal === 'merge' && <MergeDocumentModal document={{ ...activeDoc, content }} onClose={() => setModal(null)} />}
      </Suspense>
    </div>
  );
}

function buildImagePrompt(type: DocumentType, title: string, synopsis: string, content: string) {
  const excerpt = content.slice(0, 600).trim();
  const subject = synopsis || excerpt;
  switch (type) {
    case 'character':
      return `Cinematic character portrait of ${title}. ${subject}\n\nPainterly, richly detailed, dramatic lighting, shallow depth of field.`;
    case 'lore':
      return `Concept art of ${title}. ${subject}\n\nAtmospheric, highly detailed environment illustration, wide shot.`;
    default:
      return `Evocative book illustration for "${title}". ${subject}\n\nCinematic composition, moody lighting, painterly style.`;
  }
}

function MetaSelect({ value, onChange, options, dot }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; dot?: string }) {
  return (
    <label className="relative inline-flex items-center gap-1.5 pl-2 pr-2 py-1 rounded-md bg-hover text-fg-muted hover:text-fg cursor-pointer transition-colors">
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      <span>{options.find(o => o.value === value)?.label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function SaveIndicator({ status }: { status: ReturnType<typeof useStore>['saveStatus'] }) {
  const config = {
    idle: { icon: Cloud, label: 'Synced', cls: '' },
    saved: { icon: Cloud, label: 'Saved', cls: '' },
    saving: { icon: Loader2, label: 'Saving…', cls: 'animate-spin' },
    offline: { icon: CloudOff, label: 'Offline · saved locally', cls: '' },
    error: { icon: AlertCircle, label: 'Save failed', cls: 'text-danger' },
  }[status];
  const Icon = config.icon;
  return (
    <span className={twMerge('flex items-center gap-1.5', status === 'error' && 'text-danger')}>
      <Icon className={twMerge('w-3 h-3', config.cls)} />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

function TypographyPanel({ prefs, onChange }: { prefs: EditorPrefs; onChange: (p: EditorPrefs) => void }) {
  const seg = (active: boolean) => twMerge(
    'flex-1 py-1.5 rounded-md text-xs transition-colors',
    active ? 'bg-elevated text-fg shadow-soft ring-1 ring-line' : 'text-fg-muted hover:text-fg'
  );
  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-medium text-fg-muted mb-1.5">Typeface</div>
        <div className="flex gap-1 p-1 rounded-lg bg-sunken">
          <button className={twMerge(seg(prefs.font === 'serif'), 'font-serif')} onClick={() => onChange({ ...prefs, font: 'serif' })}>Serif</button>
          <button className={twMerge(seg(prefs.font === 'sans'), 'font-sans')} onClick={() => onChange({ ...prefs, font: 'sans' })}>Sans</button>
          <button className={twMerge(seg(prefs.font === 'mono'), 'font-mono')} onClick={() => onChange({ ...prefs, font: 'mono' })}>Mono</button>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[11px] font-medium text-fg-muted mb-1.5">
          <span>Size</span><span className="tabular-nums">{prefs.fontSize}px</span>
        </div>
        <input type="range" min={15} max={28} value={prefs.fontSize} onChange={e => onChange({ ...prefs, fontSize: +e.target.value })} className="w-full" />
      </div>
      <div>
        <div className="flex justify-between text-[11px] font-medium text-fg-muted mb-1.5">
          <span>Line spacing</span><span className="tabular-nums">{prefs.lineHeight.toFixed(2)}</span>
        </div>
        <input type="range" min={1.3} max={2.2} step={0.05} value={prefs.lineHeight} onChange={e => onChange({ ...prefs, lineHeight: +e.target.value })} className="w-full" />
      </div>
      <div>
        <div className="text-[11px] font-medium text-fg-muted mb-1.5">Page width</div>
        <div className="flex gap-1 p-1 rounded-lg bg-sunken">
          {(['narrow', 'medium', 'wide'] as const).map(w => (
            <button key={w} className={seg(prefs.width === w)} onClick={() => onChange({ ...prefs, width: w })}>
              {w[0].toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
