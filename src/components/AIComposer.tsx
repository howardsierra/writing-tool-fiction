import { useEffect, useRef, useState } from 'react';
import { Sparkles, ArrowUp, Square, Copy, RotateCcw, X, CornerDownLeft, Replace, ListEnd, StickyNote, TextCursorInput } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { Document } from '../types';
import { buildActionPrompt, buildStoryContext, generateText, QUICK_ACTIONS, QuickActionId } from '../utils/ai';
import { countWords } from '../utils/text';
import { modKey } from './ui';

export interface EditorBridge {
  /** Current selection in the manuscript (preserved while the composer has focus). */
  getSelection: () => { start: number; end: number; text: string };
  getContent: () => string;
  /** Replaces [start, end) with text, keeping native undo where possible. */
  applyEdit: (start: number, end: number, text: string) => void;
}

interface PendingRequest {
  action: QuickActionId | null;
  instruction: string;
  selection: { start: number; end: number; text: string };
  textBeforeCursor: string;
}

interface AIResult {
  text: string;
  isProse: boolean;
  label: string;
  request: PendingRequest;
}

export function AIComposer({
  activeDoc,
  bridge,
  selectionWords,
  dimmed,
  focusSignal,
}: {
  activeDoc: Document;
  bridge: EditorBridge;
  selectionWords: number;
  dimmed?: boolean;
  focusSignal: number;
}) {
  const { aiConfig, documents, activeProject, createDocument } = useStore();
  const { toast } = useUI();
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [result, setResult] = useState<AIResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const autosize = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const run = async (request: PendingRequest) => {
    const { prompt, isProse } = buildActionPrompt({ ...request, selection: request.selection.text });
    if (!prompt.trim()) return;
    const label = request.action ? QUICK_ACTIONS.find(a => a.id === request.action)!.label : 'Response';

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setLoadingLabel(request.action ? `${label}…` : 'Thinking…');
    setResult(null);

    try {
      const systemPrompt = buildStoryContext({ aiConfig, project: activeProject, activeDoc, documents });
      const text = await generateText(aiConfig, { systemPrompt, prompt, signal: controller.signal });
      if (!text) throw new Error('The model returned an empty response.');
      setResult({ text, isProse, label, request });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error(err);
      toast(err.message || 'Generation failed.', 'error');
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
        abortRef.current = null;
      }
    }
  };

  const submit = (action: QuickActionId | null) => {
    const selection = bridge.getSelection();
    const content = bridge.getContent();
    const meta = action ? QUICK_ACTIONS.find(a => a.id === action) : null;
    if (meta?.needsSelection && !selection.text.trim()) {
      toast(`Highlight a passage in the manuscript to ${meta.label.toLowerCase()} it.`, 'info');
      return;
    }
    if (!action && !input.trim()) return;
    run({
      action,
      instruction: input,
      selection,
      textBeforeCursor: content.slice(0, selection.end),
    });
    setInput('');
    requestAnimationFrame(autosize);
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  };

  /** Re-locates the original selection in case the text moved while waiting. */
  const resolveRange = (r: AIResult) => {
    const content = bridge.getContent();
    const { start, end, text } = r.request.selection;
    if (content.slice(start, end) === text) return { start, end };
    const idx = text ? content.indexOf(text) : -1;
    if (idx !== -1) return { start: idx, end: idx + text.length };
    return null;
  };

  const withUndo = (message: string, fn: () => void) => {
    const before = bridge.getContent();
    fn();
    toast(message, 'success', {
      label: 'Undo',
      onClick: () => bridge.applyEdit(0, bridge.getContent().length, before),
    });
    setResult(null);
  };

  const replaceSelection = () => {
    if (!result) return;
    const range = resolveRange(result);
    if (!range) {
      toast('The original passage has changed — use Insert instead.', 'error');
      return;
    }
    withUndo('Passage replaced', () => bridge.applyEdit(range.start, range.end, result.text));
  };

  const insertAtCursor = () => {
    if (!result) return;
    const content = bridge.getContent();
    const range = resolveRange(result);
    const pos = range ? range.end : Math.min(result.request.selection.end, content.length);
    const before = content.slice(0, pos);
    const prefix = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const after = content.slice(pos);
    const suffix = after && !after.startsWith('\n') ? '\n\n' : '';
    withUndo('Inserted into manuscript', () => bridge.applyEdit(pos, pos, prefix + result.text + suffix));
  };

  const appendToEnd = () => {
    if (!result) return;
    const content = bridge.getContent();
    const prefix = !content.trim() ? '' : content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n';
    withUndo('Added to the end', () => bridge.applyEdit(content.length, content.length, prefix + result.text));
  };

  const saveAsNote = async () => {
    if (!result) return;
    const title = `${result.label}: ${activeDoc.title}`.slice(0, 200);
    await createDocument(title, 'notes', result.text, { activate: false, tags: ['ai'] });
    toast('Saved to Notes', 'success');
    setResult(null);
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      toast('Copied to clipboard', 'success');
    } catch {
      toast('Could not access the clipboard.', 'error');
    }
  };

  const expanded = isFocused || !!input || selectionWords > 0;
  const hasSelectionForResult = !!result?.request.selection.text.trim();
  const modelName = aiConfig.provider === 'custom'
    ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)?.name || 'Custom'
    : aiConfig.model || aiConfig.provider;

  return (
    <div className={twMerge(
      'absolute bottom-3 md:bottom-5 inset-x-0 z-20 flex justify-center px-3 pointer-events-none transition-opacity duration-300',
      dimmed && !isFocused && !result && !isLoading && 'opacity-30 hover:opacity-100'
    )}>
      <div className="w-full max-w-[720px] pointer-events-auto flex flex-col gap-2">
        {/* Result card */}
        {result && (
          <div className="animate-slide-up rounded-2xl border border-line bg-elevated/95 backdrop-blur-xl shadow-float overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span className="font-medium text-fg">{result.label}</span>
                <span className="text-fg-subtle">· {countWords(result.text)} words</span>
              </div>
              <button onClick={() => setResult(null)} className="p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-hover" aria-label="Discard">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[38vh] overflow-y-auto px-4 pb-3">
              {result.isProse ? (
                <div className="font-serif text-[16.5px] leading-relaxed text-fg whitespace-pre-wrap">{result.text}</div>
              ) : (
                <div className="prose prose-sm prose-theme max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 border-t border-line bg-surface/60">
              {hasSelectionForResult && result.isProse && (
                <ResultButton primary icon={<Replace className="w-3.5 h-3.5" />} onClick={replaceSelection}>Replace selection</ResultButton>
              )}
              {result.isProse && (
                <ResultButton primary={!hasSelectionForResult} icon={<TextCursorInput className="w-3.5 h-3.5" />} onClick={insertAtCursor}>Insert at cursor</ResultButton>
              )}
              <ResultButton icon={<ListEnd className="w-3.5 h-3.5" />} onClick={appendToEnd}>Append</ResultButton>
              {!result.isProse && (
                <ResultButton primary icon={<StickyNote className="w-3.5 h-3.5" />} onClick={saveAsNote}>Save as note</ResultButton>
              )}
              <div className="flex-1" />
              <ResultButton icon={<Copy className="w-3.5 h-3.5" />} onClick={copy}>Copy</ResultButton>
              <ResultButton icon={<RotateCcw className="w-3.5 h-3.5" />} onClick={() => run(result.request)}>Retry</ResultButton>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="animate-fade-in self-center flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-line bg-elevated/95 backdrop-blur shadow-soft text-xs">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
              <span className="relative w-2 h-2 rounded-full bg-accent" />
            </span>
            <span className="shimmer-text font-medium">{loadingLabel}</span>
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={e => { e.preventDefault(); submit(null); }}
          className={twMerge(
            'rounded-2xl border bg-elevated/90 backdrop-blur-xl shadow-float transition-all',
            isFocused ? 'border-accent/40 ring-4 ring-accent-soft' : 'border-line'
          )}
        >
          {expanded && (
            <div className="flex items-center gap-1.5 px-2.5 pt-2.5 overflow-x-auto no-scrollbar">
              {selectionWords > 0 && (
                <span className="flex-shrink-0 px-2 py-1 rounded-md bg-accent-soft text-accent text-[11px] font-medium">
                  {selectionWords} word{selectionWords === 1 ? '' : 's'} selected
                </span>
              )}
              {QUICK_ACTIONS.filter(a => selectionWords > 0 || !a.needsSelection).map(a => (
                <button
                  key={a.id}
                  type="button"
                  disabled={isLoading}
                  title={a.hint}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => submit(a.id)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-md border border-line text-[12px] text-fg-muted hover:text-fg hover:border-line-strong hover:bg-hover transition-colors disabled:opacity-40"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 p-2">
            <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mb-2.5 ml-1.5" />
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={e => { setInput(e.target.value); autosize(); }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(null);
                }
                if (e.key === 'Escape') inputRef.current?.blur();
              }}
              placeholder={selectionWords > 0 ? 'Tell the AI what to do with the selection…' : `Ask your co-writer anything…  ${modKey === 'Ctrl' ? 'Ctrl+J' : '⌘J'}`}
              className="flex-1 min-h-[36px] max-h-40 bg-transparent resize-none outline-none text-sm text-fg placeholder:text-fg-subtle py-2"
            />
            {isLoading ? (
              <button type="button" onClick={stop} className="p-2 rounded-xl bg-fg text-[var(--base)] hover:opacity-90 transition-opacity" aria-label="Stop">
                <Square className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-2 rounded-xl bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-30 disabled:bg-line-strong disabled:text-fg-subtle transition-all"
                aria-label="Send"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
          {expanded && (
            <div className="flex items-center justify-between px-3.5 pb-2 -mt-1 text-[10.5px] text-fg-subtle">
              <span className="truncate">{modelName}{aiConfig.fullContext ? ' · full manuscript context' : ''}</span>
              <span className="hidden sm:flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> send · Shift+↵ newline</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function ResultButton({ children, icon, onClick, primary }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
        primary ? 'bg-accent text-on-accent hover:bg-accent-strong' : 'text-fg-muted hover:text-fg hover:bg-hover'
      )}
    >
      {icon}
      {children}
    </button>
  );
}
