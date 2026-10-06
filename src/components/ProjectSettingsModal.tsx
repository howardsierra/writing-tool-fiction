import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { X, Plus, SlidersHorizontal, Target, Feather, Trash2 } from 'lucide-react';
import { Modal, Field, Button, inputClass, SectionLabel } from './ui';

export function ProjectSettingsModal({ onClose }: { onClose: () => void }) {
  const { activeProject, updateProject, deleteProject } = useStore();
  const { confirm, toast } = useUI();

  const [title, setTitle] = useState(activeProject?.title || '');
  const [customAuthors, setCustomAuthors] = useState<string[]>(activeProject?.customAuthors || []);
  const [newAuthor, setNewAuthor] = useState('');
  const [wordGoal, setWordGoal] = useState(activeProject?.wordGoal ? String(activeProject.wordGoal) : '');
  const [dailyGoal, setDailyGoal] = useState(activeProject?.dailyGoal ? String(activeProject.dailyGoal) : '');

  if (!activeProject) return null;

  const handleSave = async () => {
    await updateProject(activeProject.id, {
      title: title.trim().slice(0, 100) || activeProject.title,
      customAuthors,
      wordGoal: Math.max(0, parseInt(wordGoal, 10) || 0),
      dailyGoal: Math.max(0, parseInt(dailyGoal, 10) || 0),
    });
    toast('Project settings saved', 'success');
    onClose();
  };

  const addAuthor = () => {
    const name = newAuthor.trim().slice(0, 50);
    if (name && !customAuthors.includes(name) && customAuthors.length < 100) {
      setCustomAuthors([...customAuthors, name]);
    }
    setNewAuthor('');
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete “${activeProject.title}”?`,
      message: 'Every chapter, character and note in this project will be permanently deleted. Consider exporting a backup first.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    onClose();
    await deleteProject(activeProject.id);
    toast('Project deleted', 'success');
  };

  return (
    <Modal
      title="Project settings"
      icon={<SlidersHorizontal className="w-4 h-4" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-7">
        <Field label="Title">
          <input value={title} maxLength={100} onChange={e => setTitle(e.target.value)} className={inputClass} />
        </Field>

        <section className="space-y-3">
          <SectionLabel className="flex items-center gap-1.5"><Target className="w-3 h-3" /> Goals</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Manuscript target (words)" hint="e.g. 80,000 for a novel">
              <input type="number" min={0} step={1000} value={wordGoal} onChange={e => setWordGoal(e.target.value)} placeholder="80000" className={inputClass} />
            </Field>
            <Field label="Daily goal (words)" hint="Tracked in the status bar">
              <input type="number" min={0} step={50} value={dailyGoal} onChange={e => setDailyGoal(e.target.value)} placeholder="1000" className={inputClass} />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel className="flex items-center gap-1.5"><Feather className="w-3 h-3" /> Style influences</SectionLabel>
          <p className="text-xs text-fg-subtle -mt-1">Authors whose craft the AI should draw on for this project.</p>
          <div className="flex flex-wrap gap-1.5">
            {customAuthors.map((author, i) => (
              <span key={author} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-accent-soft text-accent text-xs font-medium">
                {author}
                <button onClick={() => setCustomAuthors(customAuthors.filter((_, idx) => idx !== i))} className="p-0.5 rounded-full hover:bg-accent/20" aria-label={`Remove ${author}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {customAuthors.length === 0 && <span className="text-xs text-fg-subtle italic">None yet</span>}
          </div>
          <div className="flex gap-2">
            <input
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAuthor(); } }}
              placeholder="e.g. Ursula K. Le Guin"
              className={inputClass}
            />
            <Button onClick={addAuthor} disabled={!newAuthor.trim()} aria-label="Add author"><Plus className="w-4 h-4" /></Button>
          </div>
        </section>

        <section className="rounded-xl border border-danger/30 p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-fg">Delete project</div>
            <div className="text-xs text-fg-subtle mt-0.5">Permanently removes the project and all its documents.</div>
          </div>
          <Button variant="danger" size="sm" onClick={handleDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
        </section>
      </div>
    </Modal>
  );
}
