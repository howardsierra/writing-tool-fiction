import { useState, useRef } from 'react';
import { Upload, Loader2, Image as ImageIcon, X, AlertCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Modal, Button, Field, inputClass } from './ui';

interface Props {
  onClose: () => void;
  onGenerate: (prompt: string, referenceImage: string | null, provider: string, model: string) => Promise<void>;
  defaultPrompt: string;
}

const IMAGE_PROVIDERS = [
  { id: 'nanobanana', name: 'Nano Banana (Gemini)', defaultModel: 'gemini-2.5-flash-image', usesReference: true },
  { id: 'nanobanana2', name: 'Nano Banana 2 (Gemini)', defaultModel: 'gemini-3.1-flash-image-preview', usesReference: true },
  { id: 'nanogpt', name: 'NanoGPT', defaultModel: 'dall-e-3', usesReference: false },
  { id: 'openrouter', name: 'OpenRouter', defaultModel: '', usesReference: false },
];

export function ImageGenerationModal({ onClose, onGenerate, defaultPrompt }: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [providerId, setProviderId] = useState(() => localStorage.getItem('imageProvider') || 'nanobanana');
  const provider = IMAGE_PROVIDERS.find(p => p.id === providerId) || IMAGE_PROVIDERS[0];
  const [model, setModel] = useState(() => localStorage.getItem(`imageModel:${providerId}`) || provider.defaultModel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const changeProvider = (id: string) => {
    setProviderId(id);
    const p = IMAGE_PROVIDERS.find(x => x.id === id)!;
    setModel(localStorage.getItem(`imageModel:${id}`) || p.defaultModel);
  };

  const loadFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Reference images must be smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = e => setReferenceImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError('');
    try {
      localStorage.setItem('imageProvider', providerId);
      localStorage.setItem(`imageModel:${providerId}`, model);
      await onGenerate(prompt, referenceImage, providerId, model.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Image generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Modal
      title="Generate image"
      icon={<ImageIcon className="w-4 h-4" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {isGenerating ? 'Generating…' : 'Generate'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Provider">
            <select value={providerId} onChange={e => changeProvider(e.target.value)} className={inputClass}>
              {IMAGE_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Model">
            <input value={model} onChange={e => setModel(e.target.value)} placeholder="Provider default" className={inputClass} />
          </Field>
        </div>

        <Field label="Prompt" hint="Pre-filled from this document — edit freely.">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className={twMerge(inputClass, 'min-h-[130px] resize-y leading-relaxed')} />
        </Field>

        <div>
          <div className="text-xs font-medium text-fg-muted mb-1.5">Style reference <span className="text-fg-subtle font-normal">(optional)</span></div>
          {referenceImage ? (
            <div className="relative rounded-xl overflow-hidden border border-line bg-sunken">
              <img src={referenceImage} alt="Reference" className="w-full max-h-52 object-contain" />
              <button onClick={() => setReferenceImage(null)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600/80" aria-label="Remove reference">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); loadFile(e.dataTransfer.files?.[0]); }}
              className={twMerge(
                'w-full rounded-xl border-2 border-dashed p-6 flex flex-col items-center gap-1.5 transition-colors',
                isDragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong bg-surface'
              )}
            >
              <Upload className="w-5 h-5 text-fg-subtle" />
              <span className="text-sm text-fg-muted">Drop an image or click to upload</span>
              <span className="text-xs text-fg-subtle">JPG, PNG or WebP up to 5 MB</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="text-xs text-fg-subtle mt-2 leading-relaxed">
            {provider.usesReference
              ? 'Gemini models receive the reference directly and match its style and composition.'
              : 'This provider can’t take images, so the reference is ignored.'}
          </p>
        </div>

        {error && (
          <div className="flex gap-2 p-3 rounded-lg bg-danger-soft text-danger text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
