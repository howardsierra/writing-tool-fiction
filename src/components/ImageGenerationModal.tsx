import { useState, useRef } from 'react';
import { X, Upload, Loader2, Image as ImageIcon } from 'lucide-react';

interface Props {
  onClose: () => void;
  onGenerate: (prompt: string, referenceImage: string | null, provider: string) => Promise<void>;
  defaultPrompt: string;
}

export function ImageGenerationModal({ onClose, onGenerate, defaultPrompt }: Props) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>('nanobanana');
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be smaller than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferenceImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      await onGenerate(prompt, referenceImage, provider);
      onClose();
    } catch (err) {
      console.error(err);
      // error handled in parent
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0F1218] border border-[#2D3139] rounded shadow-2xl w-full max-w-lg flex flex-col">
        <div className="px-6 py-4 border-b border-[#2D3139] flex justify-between items-center bg-[#11141B]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" />
            Generate Image
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value)}
              className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37]"
            >
              <option value="nanobanana">Nano Banana</option>
              <option value="nanogpt">NanoGPT</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Image Prompt</label>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] min-h-[100px] resize-none"
              placeholder="Describe the image you want to generate..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">Inspiration Image (Optional)</label>
            
            {referenceImage ? (
              <div className="relative rounded overflow-hidden border border-[#2D3139] bg-[#11141B]">
                <img src={referenceImage} alt="Reference" className="w-full h-auto max-h-[200px] object-contain" />
                <button 
                  onClick={() => setReferenceImage(null)}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded hover:bg-red-500/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-[#2D3139] hover:border-[#D4AF37] rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors bg-[#1A1D26]"
              >
                <Upload className="w-6 h-6 text-gray-500" />
                <span className="text-sm text-gray-400">Click to upload reference image</span>
                <span className="text-xs text-gray-600">JPG, PNG up to 5MB</span>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <p className="text-xs text-gray-500 mt-1">
              If provided, the AI will study this image and use it to heavily influence the generated style and composition.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#2D3139] flex justify-end gap-3 bg-[#11141B]">
          <button onClick={onClose} disabled={isGenerating} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50">Cancel</button>
          <button 
            onClick={handleGenerate} 
            disabled={isGenerating || !prompt.trim()} 
            className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-medium rounded hover:bg-[#F3CF55] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {isGenerating ? 'Generating...' : 'Generate Image'}
          </button>
        </div>
      </div>
    </div>
  );
}
