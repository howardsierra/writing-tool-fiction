import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useStore } from '../hooks/useStore';
import { Tag, Save, Maximize2, Minimize2, Trash2, Image as ImageIcon, Loader2, Clock, Activity, Scissors, Search, ChevronUp, ChevronDown, X, Sparkles } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { Send, GitMerge } from 'lucide-react';
import { ImageGenerationModal } from './ImageGenerationModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { calculateFleschKincaid } from '../utils/readability';

const LoreExtractionModal = lazy(() => import('./LoreExtractionModal').then(module => ({ default: module.LoreExtractionModal })));
const MergeDocumentModal = lazy(() => import('./MergeDocumentModal').then(module => ({ default: module.MergeDocumentModal })));

export function Editor() {
  const { documents, activeDocumentId, updateDocument, deleteDocument, createDocument, aiConfig } = useStore();
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [readability, setReadability] = useState({ score: 0, label: '' });
  const [showImageModal, setShowImageModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Search & Replace state
  const [showSearch, setShowSearch] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const { projects, activeProjectId } = useStore();
  const activeProject = projects.find(p => p.id === activeProjectId);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{start: number, end: number}[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const activeDoc = documents.find(d => d.id === activeDocumentId);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContentRef = useRef<string>(activeDoc?.content || '');

  // Update search results when content or query changes
  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      setCurrentMatchIndex(-1);
      return;
    }
    const results = [];
    let i = -1;
    const lowerContent = content.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    while ((i = lowerContent.indexOf(lowerQuery, i + 1)) !== -1) {
      results.push({ start: i, end: i + searchQuery.length });
    }
    setSearchResults(results);
    if (results.length > 0) {
      setCurrentMatchIndex(prev => (prev >= 0 && prev < results.length ? prev : 0));
    } else {
      setCurrentMatchIndex(-1);
    }
  }, [content, searchQuery]);

  // Highlight current match
  useEffect(() => {
    if (showSearch && currentMatchIndex >= 0 && searchResults[currentMatchIndex] && textareaRef.current) {
      const match = searchResults[currentMatchIndex];
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(match.start, match.end);
    }
  }, [currentMatchIndex, searchResults, showSearch]);

  useEffect(() => {
    if (activeDoc) {
      setContent(activeDoc.content);
      setTitle(activeDoc.title);
      setTags(activeDoc.tags || []);
      updateWordCount(activeDoc.content);
      lastSavedContentRef.current = activeDoc.content;
    } else {
      setContent('');
      setTitle('');
      setTags([]);
      setWordCount(0);
      setReadability({ score: 0, label: '' });
      lastSavedContentRef.current = '';
    }
  }, [activeDocumentId]);

  // Sync external changes (e.g. from AI Chat)
  useEffect(() => {
    if (activeDoc && activeDoc.content !== lastSavedContentRef.current) {
      setContent(activeDoc.content);
      updateWordCount(activeDoc.content);
      lastSavedContentRef.current = activeDoc.content;
    }
  }, [activeDoc?.content]);

  const updateWordCount = (text: string) => {
    const words = text.trim().split(/\s+/);
    setWordCount(text.trim() === '' ? 0 : words.length);
    setReadability(calculateFleschKincaid(text));
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    updateWordCount(newContent);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (activeDoc) {
        lastSavedContentRef.current = newContent;
        updateDocument(activeDoc.id, { content: newContent });
      }
    }, 1000);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (activeDoc) updateDocument(activeDoc.id, { title: newTitle });
    }, 1000);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim() && activeDoc) {
      e.preventDefault();
      const updatedTags = [...new Set([...tags, newTag.trim()])];
      setTags(updatedTags);
      setNewTag('');
      updateDocument(activeDoc.id, { tags: updatedTags });
    }
  };

  const removeTag = (tagToRemove: string) => {
    if (activeDoc) {
      const updatedTags = tags.filter(t => t !== tagToRemove);
      setTags(updatedTags);
      updateDocument(activeDoc.id, { tags: updatedTags });
    }
  };

  const handleGenerateImage = async (prompt: string, referenceImage: string | null, provider: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          prompt,
          referenceImage,
          customApiKey: aiConfig.apiKeys?.[provider]
        })
      });
      const data = await res.json();
      if (data.imageUrl) {
        updateDocument(activeDoc.id, { imageUrl: data.imageUrl });
      } else {
        alert(data.error || 'Failed to generate image');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error generating image');
    }
  };

  const handleSaveSnippet = async () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    if (selectionStart === selectionEnd) {
      alert('Please highlight some text in the editor to save as a snippet.');
      return;
    }
    const selectedText = content.substring(selectionStart, selectionEnd);
    const snippetTitle = `${title} Snippet - ${new Date().toLocaleTimeString()}`;
    await createDocument(snippetTitle, 'snippet', selectedText);
    alert('Snippet saved to your workspace!');
  };


  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || !activeDoc) return;

    const userMessage = aiInput.trim();
    setAiInput('');
    setIsAiLoading(true);

    try {
      let systemPrompt = `You are an expert creative writing assistant, novel planner, and co-writer. Your goal is to help the user brainstorm, write, and refine their novel. `;
      
      if (activeProject?.customAuthors && activeProject.customAuthors.length > 0) {
        systemPrompt += `\nCRITICAL: Influence the writing style and prose by studying these authors: ${activeProject.customAuthors.join(', ')}. `;
      }
      
      if (aiConfig.customPrompt) {
        systemPrompt += `\nUser Custom Instructions: ${aiConfig.customPrompt}. `;
      }
      
      systemPrompt += `\n\nThe user is currently working on a ${activeDoc.type} titled "${activeDoc.title}". `;
      
      if (activeDoc.content.trim()) {
        const contentLimit = aiConfig.fullContext ? activeDoc.content.length : 10000;
        systemPrompt += `\nHere is the current content of this active document:\n\n---\n${activeDoc.content.substring(0, contentLimit)}\n---\n`;
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

      const separator = activeDoc.content.trim() ? "\n\n" : "";
      const newContent = activeDoc.content + separator + data.text;
      
      setContent(newContent);
      lastSavedContentRef.current = newContent;
      updateDocument(activeDoc.id, { content: newContent });
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
        }
      }, 100);

    } catch (err: any) {
      console.error(err);
      alert(`Error: ${err.message || 'Failed to generate response.'}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % searchResults.length);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
  };

  const handleReplace = () => {
    if (currentMatchIndex >= 0 && searchResults[currentMatchIndex]) {
      const match = searchResults[currentMatchIndex];
      const newContent = content.substring(0, match.start) + replaceQuery + content.substring(match.end);
      
      // Simulate event to reuse logic
      handleContentChange({ target: { value: newContent } } as any);
    }
  };

  const handleReplaceAll = () => {
    if (!searchQuery) return;
    const regex = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const newContent = content.replace(regex, replaceQuery);
    handleContentChange({ target: { value: newContent } } as any);
  };

  if (!activeDoc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0C10] text-[#E0E0E0] p-8">
        <div className="max-w-md text-center space-y-6">
          <div className="w-16 h-16 bg-[#1A1D26] rounded-full flex items-center justify-center mx-auto border border-[#2D3139]">
            <Sparkles className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <h2 className="text-xl font-serif italic">Your Workspace is Empty</h2>
          <p className="text-sm text-gray-500">
            To start typing your manuscript, you first need to create a document (like a chapter, scene, or character profile).
          </p>
          <div className="pt-4">
            <button
              onClick={() => {
                const title = prompt("Enter a name for your new document (e.g., Chapter 1):");
                if (title) createDocument(title, 'chapter');
              }}
              className="px-6 py-3 bg-[#D4AF37] text-black text-xs uppercase tracking-widest font-bold rounded hover:bg-[#F3E5AB] transition-colors"
            >
              + Create First Document
            </button>
          </div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-4">
            Or use the + button in the left sidebar
          </p>
        </div>
      </div>
    );
  }

  const supportsImage = activeDoc.type === 'character' || activeDoc.type === 'scene' || activeDoc.type === 'lore';

  return (
    <div className={twMerge(
      "flex-1 flex flex-col bg-[#0A0C10] shadow-inner transition-all duration-300",
      isFocusMode ? "fixed inset-0 z-50" : "relative"
    )}>
      {/* Editor Header */}
      <div className={twMerge(
        "flex-shrink-0 flex flex-col gap-2 p-6 pb-2 border-b border-transparent transition-opacity duration-300",
        isFocusMode ? "opacity-0 hover:opacity-100 absolute top-0 left-0 right-0 bg-[#0A0C10]/90 backdrop-blur" : "opacity-100"
      )}>
        <div className="flex items-start justify-between">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            className="text-4xl font-serif italic text-white font-light bg-transparent border-none outline-none placeholder-[#2D3139] w-full max-w-2xl"
            placeholder="Document Title"
          />
          <div className="flex items-center gap-2">
            {supportsImage && (
              <button 
                onClick={() => setShowImageModal(true)}
                className="px-3 py-1.5 flex items-center gap-2 text-xs bg-[#1A1D26] border border-[#2D3139] hover:border-[#D4AF37] text-gray-300 rounded transition-colors"
                title="Generate Image (NanoBanana)"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Generate Image
              </button>
            )}
            <button 
              onClick={() => setShowExtractModal(true)}
              className="p-2 text-gray-400 hover:text-[#D4AF37] transition-colors rounded-md"
              title="Extract Lore & Characters"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            <button 
              onClick={handleSaveSnippet}
              className="p-2 text-gray-400 hover:text-[#D4AF37] transition-colors rounded-md"
              title="Save selected text as Snippet"
            >
              <Scissors className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowHistoryModal(true)}
              className="p-2 text-gray-400 hover:text-[#D4AF37] transition-colors rounded-md"
              title="Version History"
            >
              <Clock className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowSearch(!showSearch)}
              className={twMerge(
                "p-2 transition-colors rounded-md",
                showSearch ? "text-[#D4AF37] bg-[#1A1D26]" : "text-gray-400 hover:text-[#D4AF37]"
              )}
              title="Find and Replace"
            >
              <Search className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors rounded-md"
              title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
            >
              {isFocusMode ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setShowMergeModal(true)}
              className="p-2 text-gray-400 hover:text-[#D4AF37] transition-colors rounded-md"
              title="Merge with another document"
            >
              <GitMerge className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {
                if(confirm('Are you sure you want to delete this document?')) {
                  deleteDocument(activeDoc.id);
                }
              }}
              className="p-2 text-red-400 hover:text-red-600 transition-colors rounded-md"
              title="Delete Document"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-gray-400" />
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1A1D26] border border-[#2D3139] text-[10px] text-gray-400">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-400">&times;</button>
            </span>
          ))}
          <input
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Add tag..."
            className="text-xs bg-transparent border-none outline-none text-gray-500 placeholder-gray-400 w-24"
          />
        </div>
      </div>

      {showSearch && (
        <div className="flex-shrink-0 px-6 py-2 bg-[#11141B] border-b border-[#2D3139] flex flex-wrap items-center justify-between gap-4 text-sm z-10 transition-all shadow-md">
          <div className="flex items-center gap-3">
            <Search className="w-4 h-4 text-[#D4AF37]" />
            <input 
              type="text" 
              placeholder="Find in document..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-gray-200 outline-none focus:border-[#D4AF37] w-64 placeholder-[#4A4E58]"
            />
            <span className="text-xs text-gray-500 min-w-[70px]">
              {searchResults.length > 0 ? `${currentMatchIndex + 1} of ${searchResults.length}` : '0 results'}
            </span>
            <div className="flex items-center border border-[#2D3139] rounded overflow-hidden">
              <button onClick={handlePrevMatch} disabled={searchResults.length === 0} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2D3139] bg-[#1A1D26] transition-colors disabled:opacity-50 border-r border-[#2D3139]" title="Previous match">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={handleNextMatch} disabled={searchResults.length === 0} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#2D3139] bg-[#1A1D26] transition-colors disabled:opacity-50" title="Next match">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="Replace with..." 
              value={replaceQuery}
              onChange={e => setReplaceQuery(e.target.value)}
              className="bg-[#1A1D26] border border-[#2D3139] rounded px-3 py-1.5 text-gray-200 outline-none focus:border-[#D4AF37] w-56 placeholder-[#4A4E58]"
            />
            <button onClick={handleReplace} disabled={searchResults.length === 0} className="px-4 py-1.5 text-xs font-medium bg-[#1A1D26] hover:bg-[#2D3139] text-gray-300 rounded border border-[#2D3139] transition-colors disabled:opacity-50">
              Replace
            </button>
            <button onClick={handleReplaceAll} disabled={searchResults.length === 0} className="px-4 py-1.5 text-xs font-medium bg-[#1A1D26] hover:bg-[#2D3139] text-gray-300 rounded border border-[#2D3139] transition-colors disabled:opacity-50">
              Replace All
            </button>
            <button onClick={() => setShowSearch(false)} className="ml-2 p-1 text-gray-500 hover:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 overflow-y-auto flex justify-center pb-24 relative custom-scrollbar">
        <div className="w-full max-w-2xl px-12 py-8 flex flex-col gap-6">
          {activeDoc.imageUrl && (
            <div className="w-full relative group rounded-lg overflow-hidden border border-[#2D3139] bg-[#11141B]">
              <img src={activeDoc.imageUrl} alt={activeDoc.title} className="w-full h-auto object-cover max-h-[400px]" referrerPolicy="no-referrer" />
              <button 
                onClick={() => updateDocument(activeDoc.id, { imageUrl: '' })}
                className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm hover:bg-red-500/80"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder="Start writing..."
            className="w-full h-[500px] min-h-full bg-transparent border-none outline-none resize-none text-lg leading-relaxed font-serif text-gray-300 placeholder-[#2D3139]"
          />
        </div>
      </div>

      {/* Floating AI Prompt Bar */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none px-4 z-20">
        <form 
          onSubmit={handleAiSubmit} 
          className="w-full max-w-2xl bg-[#1A1D26]/90 backdrop-blur-md border border-[#2D3139] rounded-2xl shadow-2xl p-2 flex items-end gap-2 pointer-events-auto transition-all focus-within:border-[#D4AF37]/50 focus-within:shadow-[0_0_15px_rgba(212,175,55,0.1)]"
        >
          <textarea
            value={aiInput}
            onChange={(e) => {
              setAiInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = (e.target.scrollHeight) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAiSubmit(e);
              }
            }}
            placeholder="Ask AI to brainstorm, expand, or rewrite..."
            className="flex-1 max-h-32 bg-transparent border-none outline-none resize-none text-sm text-gray-200 placeholder-gray-500 py-2 px-3 custom-scrollbar self-center"
            rows={1}
            style={{ minHeight: '36px' }}
          />
          <button 
            type="submit" 
            disabled={!aiInput.trim() || isAiLoading}
            className="p-2 bg-[#D4AF37] hover:bg-[#E5C35D] disabled:opacity-50 text-black rounded-xl transition-all self-end mb-0.5 shadow-[0_0_10px_rgba(212,175,55,0.2)]"
          >
            {isAiLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          </button>
        </form>
      </div>

      {/* Footer / Status bar */}
      <div className={twMerge(
        "absolute bottom-0 left-0 right-0 p-4 flex justify-between items-center text-[10px] uppercase tracking-widest text-gray-500 pointer-events-none transition-opacity duration-300",
        isFocusMode ? "opacity-20 hover:opacity-100" : "opacity-100"
      )}>
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          {readability.label && (
            <span className="flex items-center gap-1.5 opacity-80" title={`Flesch-Kincaid Score: ${readability.score}`}>
              <Activity className="w-3 h-3" />
              {readability.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeDoc.updatedAt && (
            <span className="flex items-center gap-1">
              <Save className="w-3 h-3" />
              Synced
            </span>
          )}
        </div>
      </div>

      {showImageModal && (
        <ImageGenerationModal 
          onClose={() => setShowImageModal(false)} 
          onGenerate={handleGenerateImage}
          defaultPrompt={`A beautiful and highly detailed visual representation of: ${title}. ${content.slice(0, 500)}`}
        />
      )}

      {showHistoryModal && (
        <VersionHistoryModal
          document={activeDoc}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {showExtractModal && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />}>
          <LoreExtractionModal
            document={activeDoc}
            onClose={() => setShowExtractModal(false)}
          />
        </Suspense>
      )}
      {showMergeModal && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />}>
          <MergeDocumentModal
            document={activeDoc}
            onClose={() => setShowMergeModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
