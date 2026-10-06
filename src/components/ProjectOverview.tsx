import { useMemo, useState } from 'react';
import { Menu, Plus, Flame, Target, BookOpen, Clock, Feather, ArrowRight, FolderPlus } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useStore } from '../hooks/useStore';
import { useWritingStats } from '../hooks/useWritingStats';
import { Document, DocumentType, DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../types';
import { countWords, formatNumber, readingMinutes, relativeTime, toMillis } from '../utils/text';
import { TYPE_ICONS, nextDocumentTitle } from './Sidebar';
import { IconButton, ProgressRing, SectionLabel, Button, inputClass, modKey } from './ui';

export function ProjectOverview({ onOpenSidebar, onOpenImport }: { onOpenSidebar?: () => void; onOpenImport?: () => void }) {
  const { projects, activeProject, activeProjectId, documents, setActiveDocumentId, createDocument, reorderDocuments, createProject } = useStore();
  const stats = useWritingStats(activeProjectId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [newProjectTitle, setNewProjectTitle] = useState('');

  const words = useMemo(() => {
    const map: Record<string, number> = {};
    documents.forEach(d => { map[d.id] = countWords(d.content); });
    return map;
  }, [documents]);

  const chapters = documents.filter(d => d.type === 'chapter');
  const scenes = documents.filter(d => d.type === 'scene');
  const bible = documents.filter(d => d.type === 'character' || d.type === 'lore');
  const manuscriptWords = [...chapters, ...scenes].reduce((sum, d) => sum + (words[d.id] || 0), 0);
  const allWords = documents.reduce((sum, d) => sum + (words[d.id] || 0), 0);
  const lastEdited = Math.max(0, ...documents.map(d => toMillis(d.updatedAt)));
  const wordGoal = activeProject?.wordGoal || 0;
  const dailyGoal = activeProject?.dailyGoal || 0;
  const maxRecent = Math.max(1, dailyGoal, ...stats.recent.map(r => r.words));

  const statusCounts = DOCUMENT_STATUSES.map(s => ({
    ...s,
    count: [...chapters, ...scenes].filter(d => (d.status || 'draft') === s.id).length,
  }));
  const statusTotal = statusCounts.reduce((a, s) => a + s.count, 0);

  const create = (type: DocumentType) => createDocument(nextDocumentTitle(type, documents), type);

  const handleDrop = (targetId: string, type: DocumentType) => {
    if (!dragId || dragId === targetId) return;
    const ids = documents.filter(d => d.type === type).map(d => d.id);
    if (!ids.includes(dragId)) return;
    const without = ids.filter(id => id !== dragId);
    without.splice(without.indexOf(targetId), 0, dragId);
    reorderDocuments(without);
  };

  /* ---------- No projects yet ---------- */
  if (!activeProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-base relative paper-grain">
        {onOpenSidebar && projects.length > 0 && (
          <IconButton label="Open sidebar" onClick={onOpenSidebar} className="absolute top-3 left-3 md:hidden"><Menu className="w-5 h-5" /></IconButton>
        )}
        <div className="w-full max-w-md text-center animate-slide-up">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center mx-auto mb-6 shadow-float">
            <Feather className="w-6 h-6 text-on-accent" />
          </div>
          <h1 className="font-serif text-4xl text-fg tracking-tight">Begin a new story</h1>
          <p className="mt-3 text-fg-muted leading-relaxed">Give your project a working title. You can change it any time.</p>
          <form
            onSubmit={e => { e.preventDefault(); if (newProjectTitle.trim()) createProject(newProjectTitle.trim().slice(0, 100)); }}
            className="mt-8 flex gap-2"
          >
            <input autoFocus value={newProjectTitle} onChange={e => setNewProjectTitle(e.target.value)} placeholder="e.g. The Salt Road" className={twMerge(inputClass, 'py-3 text-base')} />
            <Button type="submit" variant="primary" disabled={!newProjectTitle.trim()} className="px-5">
              <FolderPlus className="w-4 h-4" /> Create
            </Button>
          </form>
          {onOpenImport && (
            <button onClick={onOpenImport} className="mt-5 text-sm text-fg-muted hover:text-accent transition-colors">
              or <span className="underline underline-offset-4">import an exported project</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-base">
      <header className="md:hidden flex-shrink-0 h-14 flex items-center gap-2 px-3 border-b border-line">
        {onOpenSidebar && <IconButton label="Open sidebar" onClick={onOpenSidebar}><Menu className="w-5 h-5" /></IconButton>}
        <span className="text-sm font-medium text-fg truncate">{activeProject.title}</span>
      </header>

      <div className="flex-1 overflow-y-auto paper-grain">
        <div className="max-w-6xl mx-auto px-5 md:px-10 py-8 md:py-12">
          {/* Heading */}
          <div className="animate-fade-in">
            <SectionLabel>Overview</SectionLabel>
            <h1 className="mt-2 font-serif text-4xl md:text-5xl text-fg tracking-tight">{activeProject.title}</h1>
            <p className="mt-2 text-sm text-fg-subtle">
              {documents.length} document{documents.length === 1 ? '' : 's'} · {formatNumber(allWords)} words in total
              {lastEdited > 0 && ` · edited ${relativeTime(lastEdited)}`}
            </p>
          </div>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={<BookOpen className="w-4 h-4" />} label="Manuscript">
              <div className="font-serif text-3xl text-fg tabular-nums">{formatNumber(manuscriptWords)}</div>
              {wordGoal > 0 ? (
                <>
                  <div className="mt-3 h-1.5 rounded-full bg-line overflow-hidden">
                    <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${Math.min(100, (manuscriptWords / wordGoal) * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 text-xs text-fg-subtle">{Math.round((manuscriptWords / wordGoal) * 100)}% of {formatNumber(wordGoal)}</div>
                </>
              ) : (
                <div className="mt-1 text-xs text-fg-subtle">words · set a target in project settings</div>
              )}
            </StatCard>

            <StatCard icon={<Target className="w-4 h-4" />} label="Today">
              <div className="flex items-center gap-3">
                <div className="font-serif text-3xl text-fg tabular-nums">{formatNumber(stats.today)}</div>
                {dailyGoal > 0 && <ProgressRing value={stats.today / dailyGoal} size={28} stroke={3} />}
              </div>
              <div className="mt-3 flex items-end gap-[3px] h-8" aria-label="Words per day, last 14 days">
                {stats.recent.map(r => (
                  <div
                    key={r.day}
                    title={`${r.day}: ${formatNumber(r.words)} words`}
                    className={twMerge('flex-1 rounded-sm transition-all', r.words > 0 ? (dailyGoal && r.words >= dailyGoal ? 'bg-success/70' : 'bg-accent/60') : 'bg-line')}
                    style={{ height: `${Math.max(8, (r.words / maxRecent) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="mt-1.5 text-xs text-fg-subtle">{dailyGoal ? `Goal ${formatNumber(dailyGoal)} / day` : 'Last 14 days'}</div>
            </StatCard>

            <StatCard icon={<Flame className="w-4 h-4" />} label="Streak">
              <div className="font-serif text-3xl text-fg tabular-nums">{stats.streak}<span className="text-base text-fg-subtle ml-1.5">day{stats.streak === 1 ? '' : 's'}</span></div>
              <div className="mt-1 text-xs text-fg-subtle">{stats.streak ? 'Keep it going — write a little today.' : 'Write today to start a streak.'}</div>
            </StatCard>

            <StatCard icon={<Clock className="w-4 h-4" />} label="Progress">
              <div className="font-serif text-3xl text-fg tabular-nums">{readingMinutes(manuscriptWords)}<span className="text-base text-fg-subtle ml-1.5">min read</span></div>
              {statusTotal > 0 && (
                <>
                  <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-line">
                    {statusCounts.filter(s => s.count).map(s => (
                      <div key={s.id} style={{ width: `${(s.count / statusTotal) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-2.5 text-[11px] text-fg-subtle">
                    {statusCounts.filter(s => s.count).map(s => (
                      <span key={s.id} className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />{s.count} {s.label.toLowerCase()}</span>
                    ))}
                  </div>
                </>
              )}
            </StatCard>
          </div>

          {/* Empty project */}
          {documents.length === 0 && (
            <div className="mt-12 rounded-2xl border border-dashed border-line-strong p-8 md:p-12 text-center animate-slide-up">
              <h2 className="font-serif text-2xl text-fg">An empty page, full of possibility</h2>
              <p className="mt-2 text-sm text-fg-muted">Start with a chapter, or sketch out your cast and world first.</p>
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
                {(['chapter', 'character', 'lore'] as DocumentType[]).map(type => {
                  const Icon = TYPE_ICONS[type];
                  const meta = DOCUMENT_TYPES.find(t => t.id === type)!;
                  return (
                    <button key={type} onClick={() => create(type)} className="group p-5 rounded-xl border border-line bg-surface hover:border-accent/50 hover:shadow-soft transition-all text-left">
                      <Icon className="w-5 h-5 text-accent" />
                      <div className="mt-3 text-sm font-medium text-fg flex items-center gap-1">
                        New {meta.label.toLowerCase()} <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-6 text-xs text-fg-subtle">Tip: press <span className="text-fg-muted">{modKey} K</span> anywhere to jump between documents.</p>
            </div>
          )}

          {/* Corkboard */}
          {[{ type: 'chapter' as DocumentType, docs: chapters }, { type: 'scene' as DocumentType, docs: scenes }].map(({ type, docs }) => {
            if (!docs.length && (type === 'scene' || documents.length === 0)) return null;
            const meta = DOCUMENT_TYPES.find(t => t.id === type)!;
            return (
              <section key={type} className="mt-12">
                <div className="flex items-center justify-between mb-4">
                  <SectionLabel>{meta.plural} <span className="ml-1 font-normal tracking-normal">{docs.length}</span></SectionLabel>
                  <span className="hidden sm:block text-[11px] text-fg-subtle">Drag cards to reorder</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {docs.map((doc, i) => (
                    <CorkCard
                      key={doc.id}
                      doc={doc}
                      index={i + 1}
                      words={words[doc.id] || 0}
                      isDragging={dragId === doc.id}
                      isOver={overId === doc.id && dragId !== doc.id}
                      onOpen={() => setActiveDocumentId(doc.id)}
                      onDragStart={() => setDragId(doc.id)}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                      onDragOver={e => { if (documents.find(d => d.id === dragId)?.type === type) { e.preventDefault(); setOverId(doc.id); } }}
                      onDrop={() => { handleDrop(doc.id, type); setOverId(null); }}
                    />
                  ))}
                  <button
                    onClick={() => create(type)}
                    className="min-h-[150px] rounded-xl border border-dashed border-line-strong text-fg-subtle hover:text-accent hover:border-accent/50 hover:bg-accent-soft/30 transition-all flex flex-col items-center justify-center gap-2 text-sm"
                  >
                    <Plus className="w-5 h-5" />
                    New {meta.label.toLowerCase()}
                  </button>
                </div>
              </section>
            );
          })}

          {/* Story bible */}
          {bible.length > 0 && (
            <section className="mt-12 mb-8">
              <SectionLabel className="mb-4">Story bible <span className="ml-1 font-normal tracking-normal">{bible.length}</span></SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {bible.map(doc => {
                  const Icon = TYPE_ICONS[doc.type];
                  return (
                    <button
                      key={doc.id}
                      onClick={() => setActiveDocumentId(doc.id)}
                      className="group text-left rounded-xl border border-line bg-surface overflow-hidden hover:border-line-strong hover:shadow-soft transition-all"
                    >
                      <div className="aspect-[4/3] bg-sunken relative overflow-hidden">
                        {doc.imageUrl ? (
                          <img src={doc.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="font-serif text-4xl text-fg-subtle/40">{doc.title.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
                          <Icon className="w-3 h-3" /> {doc.type}
                        </div>
                        <div className="mt-1 text-sm font-medium text-fg truncate">{doc.title}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/80 p-5 shadow-soft">
      <div className="flex items-center gap-2 text-xs text-fg-muted mb-3">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function CorkCard({
  doc, index, words, isDragging, isOver, onOpen, onDragStart, onDragEnd, onDragOver, onDrop,
}: {
  doc: Document;
  index: number;
  words: number;
  isDragging: boolean;
  isOver: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const status = DOCUMENT_STATUSES.find(s => s.id === (doc.status || 'draft'))!;
  const excerpt = doc.content.trim().slice(0, 220);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onOpen}
      onKeyDown={e => e.key === 'Enter' && onOpen()}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      className={twMerge(
        'group relative min-h-[150px] flex flex-col rounded-xl border bg-surface p-4 cursor-pointer transition-all outline-none',
        'hover:-translate-y-0.5 hover:shadow-float hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent',
        isDragging ? 'opacity-40' : 'border-line shadow-soft',
        isOver && 'ring-2 ring-accent/60'
      )}
    >
      <div className="absolute top-0 left-4 right-4 h-[2px] rounded-b-full" style={{ background: status.color, opacity: 0.8 }} />
      <div className="flex items-start gap-3">
        <span className="font-serif text-2xl leading-none text-fg-subtle/60 tabular-nums">{String(index).padStart(2, '0')}</span>
        <h3 className="flex-1 font-serif text-lg leading-snug text-fg line-clamp-2">{doc.title || 'Untitled'}</h3>
      </div>
      <p className={twMerge('mt-2.5 text-[13px] leading-relaxed line-clamp-3 flex-1', doc.synopsis ? 'text-fg-muted italic font-serif text-[14px]' : 'text-fg-subtle')}>
        {doc.synopsis || excerpt || 'Empty — click to start writing.'}
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} />
          {status.label}
        </span>
        <span className="tabular-nums">{formatNumber(words)} words</span>
      </div>
    </div>
  );
}
