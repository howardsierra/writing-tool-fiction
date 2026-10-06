import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { Sparkles, Loader2, Check, Users, Globe2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Document } from '../types';
import { generateText, parseJsonArray } from '../utils/ai';
import { Modal, Button } from './ui';

interface Entity {
  name: string;
  type: 'character' | 'lore';
  description: string;
  selected: boolean;
}

export function LoreExtractionModal({ document, onClose }: { document: Document; onClose: () => void }) {
  const { createDocument, aiConfig, documents } = useStore();
  const { toast } = useUI();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [entities, setEntities] = useState<Entity[] | null>(null);

  const existing = documents.filter(d => d.type === 'character' || d.type === 'lore');

  const handleExtract = async () => {
    if (!document.content.trim()) {
      toast('This document is empty — write something first.', 'info');
      return;
    }
    setIsExtracting(true);
    try {
      const known = existing.map(d => `${d.title} (${d.type})`).join(', ') || 'none';
      const systemPrompt = `You are a meticulous story editor building a series bible. Extract characters, places, factions, objects and important concepts that appear in the text.
Skip anything already documented. Already documented: ${known}.
Respond with ONLY a JSON array. Each item: {"name": string, "type": "character" | "lore", "description": string}.
Descriptions should be 2–5 sentences covering appearance, role, relationships and any facts established in the text. Return [] if nothing new.`;
      const text = await generateText(aiConfig, { systemPrompt, prompt: `TEXT:\n\n${document.content}`, temperature: 0.2 });
      const parsed = parseJsonArray<any>(text)
        .filter(e => e && typeof e.name === 'string' && e.name.trim())
        .map(e => ({
          name: String(e.name).trim().slice(0, 200),
          type: (e.type === 'character' ? 'character' : 'lore') as Entity['type'],
          description: String(e.description || '').trim(),
          selected: true,
        }));
      setEntities(parsed);
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Extraction failed.', 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const update = (i: number, patch: Partial<Entity>) =>
    setEntities(list => list!.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const selected = entities?.filter(e => e.selected) || [];

  const handleSave = async () => {
    setIsSaving(true);
    for (const e of selected) {
      await createDocument(e.name, e.type, e.description, { activate: false, tags: ['auto-extracted'] });
    }
    setIsSaving(false);
    toast(`Added ${selected.length} entr${selected.length === 1 ? 'y' : 'ies'} to your bible`, 'success');
    onClose();
  };

  return (
    <Modal
      title="Extract characters & lore"
      icon={<Sparkles className="w-4 h-4" />}
      onClose={onClose}
      size="lg"
      footer={entities && entities.length > 0 ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={!selected.length || isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Add {selected.length} to project
          </Button>
        </>
      ) : undefined}
    >
      {!entities && !isExtracting && (
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-5 h-5" />
          </div>
          <p className="text-sm text-fg-muted max-w-sm mx-auto leading-relaxed mb-6">
            Scan “{document.title}” for characters, places and concepts that aren’t in your project yet, and draft encyclopedia entries for them.
          </p>
          <Button variant="primary" onClick={handleExtract}>
            <Sparkles className="w-4 h-4" /> Start extraction
          </Button>
        </div>
      )}

      {isExtracting && (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <Loader2 className="w-7 h-7 text-accent animate-spin" />
          <p className="text-sm shimmer-text font-medium">Reading your chapter…</p>
        </div>
      )}

      {entities && !isExtracting && (
        entities.length === 0 ? (
          <p className="text-sm text-fg-muted text-center py-8">Nothing new found — your bible is up to date.</p>
        ) : (
          <div className="space-y-2.5">
            <p className="text-xs text-fg-subtle mb-3">Review, edit and choose which entries to add.</p>
            {entities.map((e, i) => (
              <div key={i} className={twMerge('rounded-xl border p-3.5 transition-colors', e.selected ? 'border-accent/40 bg-accent-soft/40' : 'border-line opacity-60')}>
                <div className="flex items-center gap-2.5">
                  <input type="checkbox" checked={e.selected} onChange={ev => update(i, { selected: ev.target.checked })} className="w-4 h-4 accent-[var(--accent)]" />
                  <input
                    value={e.name}
                    onChange={ev => update(i, { name: ev.target.value })}
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-fg"
                  />
                  <button
                    onClick={() => update(i, { type: e.type === 'character' ? 'lore' : 'character' })}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-hover text-[11px] text-fg-muted hover:text-fg"
                    title="Toggle type"
                  >
                    {e.type === 'character' ? <Users className="w-3 h-3" /> : <Globe2 className="w-3 h-3" />}
                    {e.type === 'character' ? 'Character' : 'Lore'}
                  </button>
                </div>
                <textarea
                  value={e.description}
                  onChange={ev => update(i, { description: ev.target.value })}
                  rows={3}
                  className="mt-2 w-full bg-transparent outline-none resize-y text-[13px] leading-relaxed text-fg-muted"
                />
              </div>
            ))}
          </div>
        )
      )}
    </Modal>
  );
}
