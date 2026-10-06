import { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { Plus, Trash2, RefreshCw, Settings, Eye, EyeOff, Zap, CheckCircle2, AlertCircle, Loader2, Keyboard } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { PROVIDERS, CustomEndpoint } from '../types';
import { Modal, Field, Toggle, inputClass, SectionLabel, Kbd, modKey, Button } from './ui';
import { generateText } from '../utils/ai';

const OPENAI_COMPATIBLE = ['openai', 'openrouter', 'custom', 'nanobanana', 'nanobanana2', 'nanogpt', 'kimi', 'mimo'];

const SHORTCUTS: [string, string][] = [
  [`${modKey} K`, 'Command palette'],
  [`${modKey} J`, 'Ask the AI'],
  [`${modKey} F`, 'Find & replace'],
  [`${modKey} S`, 'Save snapshot'],
  [`${modKey} E`, 'Toggle Markdown preview'],
  [`${modKey} ⇧ F`, 'Focus mode'],
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { aiConfig, setAIConfig } = useStore();
  const [dynamicModels, setDynamicModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' });

  useEffect(() => {
    let isMounted = true;
    const fetchModels = async () => {
      if (!OPENAI_COMPATIBLE.includes(aiConfig.provider)) {
        setDynamicModels([]);
        return;
      }
      const activeEndpoint = aiConfig.provider === 'custom'
        ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)
        : undefined;
      if (aiConfig.provider === 'custom' && !activeEndpoint?.url) {
        setDynamicModels([]);
        return;
      }
      setIsLoadingModels(true);
      try {
        const res = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: aiConfig.provider,
            customEndpoint: activeEndpoint?.url,
            customApiKey: aiConfig.provider === 'custom' ? activeEndpoint?.apiKey : aiConfig.apiKeys?.[aiConfig.provider],
          }),
        });
        const data = await res.json();
        if (isMounted) setDynamicModels(Array.isArray(data.models) ? data.models : []);
      } catch (err) {
        console.error(err);
        if (isMounted) setDynamicModels([]);
      } finally {
        if (isMounted) setIsLoadingModels(false);
      }
    };
    const timeout = setTimeout(fetchModels, 500);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [aiConfig.provider, aiConfig.activeCustomEndpointId, aiConfig.customEndpoints, aiConfig.apiKeys]);

  useEffect(() => setTest({ state: 'idle' }), [aiConfig.provider, aiConfig.model, aiConfig.apiKeys, aiConfig.customEndpoints, aiConfig.activeCustomEndpointId]);

  const handleProviderChange = (providerId: string) => {
    const provider = PROVIDERS.find(p => p.id === providerId);
    setAIConfig({ ...aiConfig, provider: providerId, model: provider?.models[0] || '' });
  };

  const selectedProvider = PROVIDERS.find(p => p.id === aiConfig.provider);
  const availableModels = dynamicModels.length > 0 ? dynamicModels : (selectedProvider?.models || []);

  const addCustomEndpoint = () => {
    const newEndpoint: CustomEndpoint = {
      id: Math.random().toString(36).substring(2, 9),
      name: 'Local model',
      url: 'http://localhost:11434/v1',
      apiKey: '',
      model: '',
    };
    setAIConfig({
      ...aiConfig,
      customEndpoints: [...(aiConfig.customEndpoints || []), newEndpoint],
      activeCustomEndpointId: newEndpoint.id,
      provider: 'custom',
    });
  };

  const updateCustomEndpoint = (id: string, updates: Partial<CustomEndpoint>) => {
    setAIConfig({ ...aiConfig, customEndpoints: (aiConfig.customEndpoints || []).map(e => (e.id === id ? { ...e, ...updates } : e)) });
  };

  const deleteCustomEndpoint = (id: string) => {
    const updated = (aiConfig.customEndpoints || []).filter(e => e.id !== id);
    setAIConfig({
      ...aiConfig,
      customEndpoints: updated,
      activeCustomEndpointId: aiConfig.activeCustomEndpointId === id ? (updated[0]?.id || '') : aiConfig.activeCustomEndpointId,
    });
  };

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const reply = await generateText(aiConfig, { systemPrompt: 'You are a connection test.', prompt: 'Reply with the single word: ready', temperature: 0 });
      setTest({ state: 'ok', message: reply.slice(0, 60) });
    } catch (err: any) {
      setTest({ state: 'fail', message: err.message });
    }
  };

  const activeEp = aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId);
  const ignoresTemperature = aiConfig.provider === 'anthropic' && /claude-(fable|mythos|opus-5|sonnet-5|opus-4-[78])/.test(aiConfig.model);

  return (
    <Modal title="Settings" icon={<Settings className="w-4 h-4" />} onClose={onClose} size="lg">
      <div className="space-y-8">
        <section className="space-y-4">
          <SectionLabel>AI model</SectionLabel>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Provider">
              <select value={aiConfig.provider} onChange={e => handleProviderChange(e.target.value)} className={inputClass}>
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label={<span className="flex items-center gap-1.5">Model {isLoadingModels && <RefreshCw className="w-3 h-3 text-accent animate-spin" />}</span>}>
              <input
                list="model-options"
                value={aiConfig.model || ''}
                onChange={e => setAIConfig({ ...aiConfig, model: e.target.value })}
                placeholder="Type or pick a model"
                className={inputClass}
              />
              <datalist id="model-options">
                {availableModels.map(m => <option key={m} value={m} />)}
              </datalist>
            </Field>
          </div>

          {aiConfig.provider === 'custom' ? (
            <div className="rounded-xl border border-line bg-surface/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-fg-muted">Custom endpoints (OpenAI-compatible)</span>
                <Button size="sm" variant="ghost" onClick={addCustomEndpoint}><Plus className="w-3.5 h-3.5" /> Add</Button>
              </div>
              {(aiConfig.customEndpoints || []).length === 0 ? (
                <p className="text-xs text-fg-subtle">No endpoints yet. Add one for Ollama, LM Studio, vLLM or any OpenAI-compatible server.</p>
              ) : (
                <select value={aiConfig.activeCustomEndpointId || ''} onChange={e => setAIConfig({ ...aiConfig, activeCustomEndpointId: e.target.value })} className={inputClass}>
                  {(aiConfig.customEndpoints || []).map(ep => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
                </select>
              )}
              {activeEp && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex gap-2">
                    <input value={activeEp.name} onChange={e => updateCustomEndpoint(activeEp.id, { name: e.target.value })} placeholder="Name" className={inputClass} />
                    <button onClick={() => deleteCustomEndpoint(activeEp.id)} className="px-2.5 rounded-lg border border-line text-danger hover:bg-danger-soft" aria-label="Delete endpoint">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input value={activeEp.url} onChange={e => updateCustomEndpoint(activeEp.id, { url: e.target.value })} placeholder="Base URL, e.g. http://localhost:11434/v1" className={inputClass} />
                  <input type="password" value={activeEp.apiKey || ''} onChange={e => updateCustomEndpoint(activeEp.id, { apiKey: e.target.value })} placeholder="API key (optional)" className={inputClass} />
                </div>
              )}
            </div>
          ) : (
            <Field label="API key" hint="Leave blank to use the server’s environment key, if one is configured.">
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={aiConfig.apiKeys?.[aiConfig.provider] || ''}
                  onChange={e => setAIConfig({ ...aiConfig, apiKeys: { ...aiConfig.apiKeys, [aiConfig.provider]: e.target.value } })}
                  placeholder={`${selectedProvider?.name} API key`}
                  className={twMerge(inputClass, 'pr-10 font-mono text-[13px]')}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg" aria-label={showKey ? 'Hide key' : 'Show key'}>
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
          )}

          <div className="flex items-center gap-3">
            <Button size="sm" onClick={runTest} disabled={test.state === 'running'}>
              {test.state === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Test connection
            </Button>
            {test.state === 'ok' && <span className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="w-3.5 h-3.5" /> Connected</span>}
            {test.state === 'fail' && <span className="flex items-start gap-1.5 text-xs text-danger min-w-0"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /><span className="break-words">{test.message}</span></span>}
          </div>

          <Field
            label={`Creativity (temperature) · ${aiConfig.temperature.toFixed(1)}`}
            hint={ignoresTemperature ? 'This Claude model sets its own sampling, so this slider has no effect.' : 'Lower is more focused and consistent; higher is more surprising.'}
          >
            <input type="range" min="0" max="1" step="0.1" value={aiConfig.temperature} onChange={e => setAIConfig({ ...aiConfig, temperature: parseFloat(e.target.value) })} disabled={ignoresTemperature} className="w-full disabled:opacity-40" />
          </Field>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-4">
            <div>
              <div className="text-sm text-fg">Full manuscript context</div>
              <div className="text-xs text-fg-subtle mt-0.5 leading-relaxed">Send every document in full instead of excerpts. Better continuity, much higher token usage — best with long-context models.</div>
            </div>
            <Toggle checked={!!aiConfig.fullContext} onChange={v => setAIConfig({ ...aiConfig, fullContext: v })} label="Full manuscript context" />
          </div>
        </section>

        <section className="space-y-3">
          <SectionLabel>Writing style</SectionLabel>
          <Field label="Standing instructions" hint="Applied to every AI request, across all projects.">
            <textarea
              value={aiConfig.customPrompt || ''}
              onChange={e => setAIConfig({ ...aiConfig, customPrompt: e.target.value })}
              placeholder="e.g. Write in close third person, past tense. British spelling. Avoid adverbs."
              className={twMerge(inputClass, 'min-h-[90px] resize-y')}
            />
          </Field>
        </section>

        <section className="space-y-3">
          <SectionLabel className="flex items-center gap-1.5"><Keyboard className="w-3 h-3" /> Keyboard shortcuts</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-fg-muted">{label}</span>
                <span className="flex gap-1">{keys.split(' ').map(k => <Kbd key={k}>{k}</Kbd>)}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-xs text-fg-subtle leading-relaxed rounded-xl bg-sunken p-3.5">
          API keys are stored only in this browser and are sent to this app’s server solely to make the request. They are never saved on the server.
        </p>
      </div>
    </Modal>
  );
}
