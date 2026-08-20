import { useState, useRef, useEffect } from 'react';
import { useStore } from '../hooks/useStore';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx } from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function AIChat() {
  const { aiConfig, documents, activeDocumentId, projects, activeProjectId } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeDoc = documents.find(d => d.id === activeDocumentId);
  const activeProject = projects.find(p => p.id === activeProjectId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Build System Prompt
      let systemPrompt = `You are an expert creative writing assistant, novel planner, and co-writer. 
Your goal is to help the user brainstorm, write, and refine their novel. `;
      
      if (activeProject?.customAuthors && activeProject.customAuthors.length > 0) {
        systemPrompt += `\nCRITICAL: Influence the writing style and prose by studying these authors: ${activeProject.customAuthors.join(', ')}. `;
      }
      if (aiConfig.customPrompt) {
        systemPrompt += `\nUser Custom Instructions: ${aiConfig.customPrompt}. `;
      }

      if (activeDoc) {
        systemPrompt += `\n\nThe user is currently working on a ${activeDoc.type} titled "${activeDoc.title}". `;
        if (activeDoc.content.trim()) {
          const contentLimit = aiConfig.fullContext ? activeDoc.content.length : 10000;
          systemPrompt += `\nHere is the current content of this active document:\n\n---\n${activeDoc.content.substring(0, contentLimit)}\n---\n`;
        }
      }

      const projectDocs = documents.filter(d => d.projectId === activeProjectId && d.id !== activeDocumentId);
      if (projectDocs.length > 0) {
        systemPrompt += `\n\n--- BACKGROUND PROJECT CONTEXT ---\nThe following are other documents and lore available in this project:\n`;
        projectDocs.forEach(doc => {
          if (doc.content.trim()) {
            const contextLimit = aiConfig.fullContext ? doc.content.length : 8000;
            systemPrompt += `\n[${doc.title} - ${doc.type}]\n${doc.content.substring(0, contextLimit)}\n`;
          }
        });
        systemPrompt += `\n--- END BACKGROUND CONTEXT ---\n`;
      }

      const activeEndpoint = aiConfig.provider === 'custom' 
        ? aiConfig.customEndpoints?.find(e => e.id === aiConfig.activeCustomEndpointId)
        : undefined;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiConfig.provider,
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          systemPrompt,
          prompt: userMessage,
          customEndpoint: activeEndpoint?.url,
          customApiKey: aiConfig.provider === 'custom' ? activeEndpoint?.apiKey : aiConfig.apiKeys?.[aiConfig.provider],
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: data.text }]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'assistant', 
        content: `**Error:** ${err.message || 'Failed to generate response.'}\n\n*Make sure your API keys are configured correctly in the .env file.*` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-[#2D3139] bg-[#0F1218] flex flex-col h-full transition-colors duration-200">
      <div className="p-4 border-b border-[#2D3139] flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#D4AF37]" />
        <h2 className="text-[10px] uppercase tracking-widest text-gray-500">AI Narrative Engine</h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-10">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-50 text-[#D4AF37]" />
            <p>How can I help you with your writing today?</p>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => setInput("Can you help me brainstorm some plot twists for this chapter?")} className="text-xs bg-[#1A1D26] border border-[#2D3139] p-2 rounded text-left hover:border-[#D4AF37] transition-colors text-gray-300">
                Brainstorm plot twists...
              </button>
              <button onClick={() => setInput("Please expand on the last paragraph I wrote, adding more sensory details.")} className="text-xs bg-[#1A1D26] border border-[#2D3139] p-2 rounded text-left hover:border-[#D4AF37] transition-colors text-gray-300">
                Expand last paragraph...
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={clsx("flex gap-3 text-sm", msg.role === 'user' ? "flex-row-reverse" : "")}>
              <div className={clsx(
                "w-6 h-6 rounded flex items-center justify-center flex-shrink-0",
                msg.role === 'user' ? "bg-[#1A1D26] text-[#D4AF37]" : "bg-[#2D3139] text-gray-300"
              )}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={clsx(
                "px-3 py-2 rounded max-w-[85%] text-xs",
                msg.role === 'user' 
                  ? "bg-[#1A1D26] border border-[#2D3139] text-gray-300" 
                  : "bg-transparent text-gray-300"
              )}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="markdown-body prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-[#1A1D26] prose-a:text-[#D4AF37]">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-3 text-sm">
            <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-[#2D3139] text-gray-300">
              <Bot className="w-4 h-4" />
            </div>
            <div className="px-3 py-2 rounded max-w-[85%] text-xs bg-transparent text-gray-300 flex items-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#2D3139]">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Message AI... (Shift+Enter for newline)"
            className="w-full bg-[#1A1D26] border border-[#2D3139] rounded pl-3 pr-10 py-3 text-xs text-gray-200 outline-none focus:border-[#D4AF37] transition-all resize-none"
            rows={2}
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="absolute right-2 bottom-2.5 p-1.5 bg-[#D4AF37] hover:bg-[#E5C35D] disabled:opacity-50 text-black rounded transition-all shadow-[0_0_10px_rgba(212,175,55,0.2)]"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
