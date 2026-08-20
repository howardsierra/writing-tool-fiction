import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { X, Sparkles, Loader2, Check } from 'lucide-react';
import { Document } from '../types';

export function LoreExtractionModal({ document, onClose }: { document: Document, onClose: () => void }) {
  const { createDocument, aiConfig } = useStore();
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedEntities, setExtractedEntities] = useState<{name: string, type: 'character'|'lore', description: string}[]>([]);
  const [hasExtracted, setHasExtracted] = useState(false);

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const activeEndpoint = aiConfig.provider === 'custom' 
        ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)
        : undefined;

      const systemPrompt = `You are an expert story editor. Read the following chapter and extract any NEW characters, locations, items, or important concepts. 
Format your response as a strict JSON array of objects. Each object must have exactly these keys: 
"name" (string), "type" (must be exactly "character" or "lore"), and "description" (a detailed summary based on the text). 
If there is nothing new, return an empty array []. Output strictly valid JSON.`;

      const prompt = `Text to analyze:\n\n${document.content}`;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiConfig.provider,
          model: aiConfig.model,
          temperature: 0.3,
          systemPrompt,
          prompt,
          customEndpoint: activeEndpoint?.url,
          customApiKey: aiConfig.provider === 'custom' ? activeEndpoint?.apiKey : aiConfig.apiKeys?.[aiConfig.provider],
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Try to parse JSON from the response text
      let text = data.text;
      // Strip markdown code blocks if present
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        setExtractedEntities(parsed);
      } else {
        throw new Error("Invalid response format");
      }
      setHasExtracted(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error extracting lore');
    }
    setIsExtracting(false);
  };

  const handleSaveToProject = () => {
    extractedEntities.forEach(entity => {
      createDocument(entity.name, entity.type, entity.description, ['auto-extracted']);
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#11141B] border border-[#2D3139] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-[#2D3139] bg-[#0A0C10] flex-shrink-0">
          <h2 className="text-sm font-serif italic text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D4AF37]" />
            Extract Lore & Characters
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
          {!hasExtracted && !isExtracting && (
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-6">
                Scan "{document.title}" for new characters, locations, or items. The AI will automatically generate encyclopedia entries for them.
              </p>
              <button 
                onClick={handleExtract}
                className="px-6 py-2 bg-[#D4AF37] text-black text-xs uppercase tracking-widest font-bold rounded hover:bg-[#F3E5AB] transition-colors inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Start Extraction
              </button>
            </div>
          )}

          {isExtracting && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
              <p className="text-xs uppercase tracking-widest text-gray-400 animate-pulse">Analyzing text...</p>
            </div>
          )}

          {hasExtracted && !isExtracting && (
            <div className="space-y-4">
              <h3 className="text-xs uppercase tracking-widest text-[#D4AF37]">Found {extractedEntities.length} Entities</h3>
              
              {extractedEntities.length === 0 ? (
                <p className="text-sm text-gray-500">No new significant entities found in this text.</p>
              ) : (
                <div className="space-y-3">
                  {extractedEntities.map((entity, i) => (
                    <div key={i} className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">{entity.name}</span>
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 px-2 py-0.5 border border-[#2D3139] rounded-full">
                          {entity.type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">{entity.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {hasExtracted && extractedEntities.length > 0 && (
          <div className="p-4 bg-[#0A0C10] border-t border-[#2D3139] flex justify-end gap-3 flex-shrink-0">
            <button 
              onClick={onClose}
              className="px-4 py-2 text-xs uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button 
              onClick={handleSaveToProject}
              className="px-4 py-2 bg-[#D4AF37] text-black text-xs uppercase tracking-widest font-bold rounded hover:bg-[#F3E5AB] transition-colors inline-flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Save to Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
