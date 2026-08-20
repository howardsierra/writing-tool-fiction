import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { X, Plus, Trash2, RefreshCw } from 'lucide-react';
import { PROVIDERS, CustomEndpoint } from '../types';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { aiConfig, setAIConfig } = useStore();
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchModels = async () => {
      const openAiCompatible = ['openai', 'openrouter', 'custom', 'nanobanana', 'nanobanana2', 'nanogpt', 'kimi', 'mimo'];
      if (openAiCompatible.includes(aiConfig.provider)) {
        setIsLoadingModels(true);
        try {
          const activeEndpoint = aiConfig.provider === 'custom' 
            ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)
            : undefined;
            
          // Don't auto-fetch custom if no URL yet
          if (aiConfig.provider === 'custom' && !activeEndpoint?.url) {
            setDynamicModels([]);
            setIsLoadingModels(false);
            return;
          }

          const res = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: aiConfig.provider,
              customEndpoint: activeEndpoint?.url,
              customApiKey: aiConfig.provider === 'custom' ? activeEndpoint?.apiKey : (aiConfig.apiKeys?.[aiConfig.provider]),
            })
          });
          const data = await res.json();
          if (isMounted && data.models && data.models.length > 0) {
            setDynamicModels(data.models);
            // Auto-select first model if current isn't in list and we don't have one
            if (!aiConfig.model || !data.models.includes(aiConfig.model)) {
              setAIConfig({ ...aiConfig, model: data.models[0] });
            }
          } else if (isMounted) {
            setDynamicModels([]);
          }
        } catch (err) {
          console.error(err);
          if (isMounted) setDynamicModels([]);
        } finally {
          if (isMounted) setIsLoadingModels(false);
        }
      } else {
        setDynamicModels([]);
      }
    };
    
    // debounce fetch to prevent spamming while typing URL/key
    const timeout = setTimeout(fetchModels, 500);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [aiConfig.provider, aiConfig.activeCustomEndpointId, aiConfig.customEndpoints, aiConfig.apiKeys]);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value;
    const provider = PROVIDERS.find(p => p.id === providerId);
    
    setAIConfig({
      ...aiConfig,
      provider: providerId,
      model: provider?.models[0] || ''
    });
  };

  const selectedProvider = PROVIDERS.find(p => p.id === aiConfig.provider);

  const availableModels = dynamicModels.length > 0 
    ? dynamicModels 
    : (selectedProvider?.models || []);

  const addCustomEndpoint = () => {
    const newEndpoint: CustomEndpoint = {
      id: Math.random().toString(36).substring(7),
      name: 'New Endpoint',
      url: 'http://localhost:11434/v1',
      apiKey: '',
      model: ''
    };
    const updated = [...(aiConfig.customEndpoints || []), newEndpoint];
    setAIConfig({ 
      ...aiConfig, 
      customEndpoints: updated,
      activeCustomEndpointId: newEndpoint.id,
      provider: 'custom'
    });
  };

  const updateCustomEndpoint = (id: string, updates: Partial<CustomEndpoint>) => {
    const updated = (aiConfig.customEndpoints || []).map(e => 
      e.id === id ? { ...e, ...updates } : e
    );
    setAIConfig({ ...aiConfig, customEndpoints: updated });
  };

  const deleteCustomEndpoint = (id: string) => {
    const updated = (aiConfig.customEndpoints || []).filter(e => e.id !== id);
    setAIConfig({ 
      ...aiConfig, 
      customEndpoints: updated,
      activeCustomEndpointId: aiConfig.activeCustomEndpointId === id ? (updated[0]?.id || '') : aiConfig.activeCustomEndpointId
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[#0F1218] border border-[#2D3139] rounded shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#2D3139] flex justify-between items-center bg-[#11141B]">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
          
          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500">AI Configuration</h3>
            
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-500">Provider</label>
              <select 
                value={aiConfig.provider} 
                onChange={handleProviderChange}
                className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all"
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {aiConfig.provider === 'custom' && (
              <div className="flex flex-col gap-2 p-3 bg-[#11141B] border border-[#2D3139] rounded">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-widest text-[#D4AF37]">Custom Endpoints</label>
                  <button onClick={addCustomEndpoint} className="text-[#D4AF37] hover:text-white transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                
                {(aiConfig.customEndpoints || []).length === 0 ? (
                  <div className="text-xs text-gray-500 py-2">No custom endpoints configured.</div>
                ) : (
                  <select 
                    value={aiConfig.activeCustomEndpointId || ''} 
                    onChange={(e) => setAIConfig({ ...aiConfig, activeCustomEndpointId: e.target.value })}
                    className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all mb-2"
                  >
                    {(aiConfig.customEndpoints || []).map(ep => (
                      <option key={ep.id} value={ep.id}>{ep.name}</option>
                    ))}
                  </select>
                )}

                {aiConfig.activeCustomEndpointId && (
                  <div className="space-y-3 mt-2 pt-3 border-t border-[#2D3139]">
                    {(() => {
                      const activeEp = aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId);
                      if (!activeEp) return null;
                      return (
                        <>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              value={activeEp.name}
                              onChange={(e) => updateCustomEndpoint(activeEp.id, { name: e.target.value })}
                              placeholder="Endpoint Name"
                              className="flex-1 bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-[#D4AF37]"
                            />
                            <button 
                              onClick={() => deleteCustomEndpoint(activeEp.id)}
                              className="p-1.5 bg-[#1A1D26] border border-red-900/30 text-red-400 hover:bg-red-900/20 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input 
                            type="text" 
                            value={activeEp.url}
                            onChange={(e) => updateCustomEndpoint(activeEp.id, { url: e.target.value })}
                            placeholder="Base URL (e.g. http://localhost:11434/v1)"
                            className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-[#D4AF37]"
                          />
                          <input 
                            type="password" 
                            value={activeEp.apiKey || ''}
                            onChange={(e) => updateCustomEndpoint(activeEp.id, { apiKey: e.target.value })}
                            placeholder="API Key (Optional)"
                            className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-xs text-gray-200 outline-none focus:border-[#D4AF37]"
                          />
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {aiConfig.provider !== 'custom' && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">API Key (Optional / Override)</label>
                <input 
                  type="password" 
                  value={aiConfig.apiKeys?.[aiConfig.provider] || ''}
                  onChange={(e) => setAIConfig({ ...aiConfig, apiKeys: { ...aiConfig.apiKeys, [aiConfig.provider]: e.target.value } })}
                  placeholder={`Enter custom ${selectedProvider?.name} API key`}
                  className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-widest text-gray-500">Model</label>
                {isLoadingModels && <RefreshCw className="w-3 h-3 text-[#D4AF37] animate-spin" />}
              </div>
              
              {dynamicModels.length > 0 || !['custom'].includes(aiConfig.provider) ? (
                <select 
                  value={aiConfig.model} 
                  onChange={(e) => setAIConfig({ ...aiConfig, model: e.target.value })}
                  className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all"
                >
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={aiConfig.model || ''}
                  onChange={(e) => setAIConfig({ ...aiConfig, model: e.target.value })}
                  placeholder="e.g., meta-llama-3"
                  className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] transition-all"
                />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-500 flex justify-between">
                <span>Creativity (Temperature)</span>
                <span>{aiConfig.temperature}</span>
              </label>
              <input 
                type="range" 
                min="0" max="1" step="0.1"
                value={aiConfig.temperature}
                onChange={(e) => setAIConfig({ ...aiConfig, temperature: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>

            <div className="flex items-center gap-3 mt-4">
              <input
                type="checkbox"
                id="fullContextToggle"
                checked={aiConfig.fullContext || false}
                onChange={(e) => setAIConfig({ ...aiConfig, fullContext: e.target.checked })}
                className="w-4 h-4 bg-[#1A1D26] border-[#2D3139] rounded accent-[#D4AF37]"
              />
              <label htmlFor="fullContextToggle" className="text-xs text-gray-300">
                Full Manuscript Context
                <span className="block text-[10px] text-gray-500">Read entire manuscript (High Token Usage). Best with Gemini.</span>
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Writing Style</h3>
            
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-gray-500">Custom Global Prompt</label>
              <textarea 
                value={aiConfig.customPrompt || ''}
                onChange={(e) => setAIConfig({ ...aiConfig, customPrompt: e.target.value })}
                placeholder="e.g. Always write in first-person present tense..."
                className="w-full bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-2 text-sm text-gray-200 outline-none focus:border-[#D4AF37] resize-y min-h-[80px]"
              />
            </div>
          </div>

          <div className="text-[10px] text-gray-400 bg-[#1A1D26] p-3 rounded border border-[#2D3139] mt-2">
            Note: For 3rd-party providers (OpenAI, Anthropic, NanoBanana, etc.), ensure the corresponding API key is configured in the server's environment variables. Dynamic models for OpenAI/OpenRouter fetch automatically if keys are set.
          </div>
        </div>
      </div>
    </div>
  );
}
