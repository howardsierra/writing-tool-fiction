import { useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X, CaseSensitive, WholeWord, Replace } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export interface FindOptions {
  query: string;
  replace: string;
  matchCase: boolean;
  wholeWord: boolean;
}

export interface Match {
  start: number;
  end: number;
}

export function buildSearchRegex({ query, matchCase, wholeWord }: FindOptions): RegExp | null {
  if (!query) return null;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(source, matchCase ? 'gu' : 'giu');
}

export function findMatches(content: string, options: FindOptions, limit = 5000): Match[] {
  const regex = buildSearchRegex(options);
  if (!regex) return [];
  const results: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) && results.length < limit) {
    results.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) regex.lastIndex++;
  }
  return results;
}

export function FindReplaceBar({
  options,
  onChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  options: FindOptions;
  onChange: (options: FindOptions) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const toggleClass = (on: boolean) => twMerge(
    'p-1.5 rounded-md transition-colors',
    on ? 'bg-accent-soft text-accent' : 'text-fg-subtle hover:text-fg hover:bg-hover'
  );

  return (
    <div className="flex-shrink-0 border-b border-line bg-surface/80 backdrop-blur px-3 md:px-6 py-2 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2 max-w-4xl mx-auto">
        <div className="flex items-center gap-1 flex-1 min-w-[220px] bg-elevated border border-line rounded-lg pl-2.5 pr-1 focus-within:border-accent transition-colors">
          <Search className="w-3.5 h-3.5 text-fg-subtle flex-shrink-0" />
          <input
            ref={inputRef}
            value={options.query}
            onChange={e => onChange({ ...options, query: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? onPrev() : onNext(); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="Find"
            className="flex-1 min-w-0 bg-transparent py-1.5 text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          <span className="text-[11px] tabular-nums text-fg-subtle px-1 whitespace-nowrap">
            {options.query ? (matchCount ? `${currentIndex + 1}/${matchCount}` : 'No results') : ''}
          </span>
          <button onClick={() => onChange({ ...options, matchCase: !options.matchCase })} className={toggleClass(options.matchCase)} title="Match case">
            <CaseSensitive className="w-4 h-4" />
          </button>
          <button onClick={() => onChange({ ...options, wholeWord: !options.wholeWord })} className={toggleClass(options.wholeWord)} title="Whole word">
            <WholeWord className="w-4 h-4" />
          </button>
          <button onClick={onPrev} disabled={!matchCount} className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-hover disabled:opacity-40" title="Previous (Shift+Enter)">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button onClick={onNext} disabled={!matchCount} className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-hover disabled:opacity-40" title="Next (Enter)">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 flex-1 min-w-[220px] bg-elevated border border-line rounded-lg pl-2.5 pr-1 focus-within:border-accent transition-colors">
          <Replace className="w-3.5 h-3.5 text-fg-subtle flex-shrink-0" />
          <input
            value={options.replace}
            onChange={e => onChange({ ...options, replace: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onReplace(); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="Replace with"
            className="flex-1 min-w-0 bg-transparent py-1.5 text-sm text-fg placeholder:text-fg-subtle outline-none"
          />
          <button onClick={onReplace} disabled={!matchCount} className="px-2 py-1 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-hover disabled:opacity-40">
            Replace
          </button>
          <button onClick={onReplaceAll} disabled={!matchCount} className="px-2 py-1 rounded-md text-xs font-medium text-fg-muted hover:text-fg hover:bg-hover disabled:opacity-40">
            All
          </button>
        </div>

        <button onClick={onClose} className="p-1.5 rounded-md text-fg-subtle hover:text-fg hover:bg-hover" aria-label="Close find">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
