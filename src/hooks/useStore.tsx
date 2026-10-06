import { useState, useEffect, createContext, useContext, useMemo, useRef, useCallback } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch, getDocs } from 'firebase/firestore';
import { Project, Document, AIConfig, EditorPrefs, DEFAULT_EDITOR_PREFS, DocumentType, DOCUMENT_TYPES } from '../types';
import { useUI } from './useUI';
import { toMillis } from '../utils/text';

const MAX_VERSIONS = 30;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

interface CreateDocumentOptions {
  activate?: boolean;
  tags?: string[];
  synopsis?: string;
}

interface StoreContextType {
  user: any;
  authLoading: boolean;
  projects: Project[];
  activeProject: Project | undefined;
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  documents: Document[];
  activeDocumentId: string | null;
  setActiveDocumentId: (id: string | null) => void;
  createProject: (title: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createDocument: (title: string, type: DocumentType, initialContent?: string, options?: CreateDocumentOptions) => Promise<string | null>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  duplicateDocument: (id: string) => Promise<void>;
  reorderDocuments: (orderedIds: string[]) => Promise<void>;
  saveVersion: (documentId: string, content: string, label?: string) => Promise<void>;
  deleteVersion: (documentId: string, versionId: string) => Promise<void>;
  saveStatus: SaveStatus;
  /** Id of the document most recently created in this session (used to focus its title). */
  lastCreatedId: string | null;
  aiConfig: AIConfig;
  setAIConfig: (config: AIConfig) => void;
  editorPrefs: EditorPrefs;
  setEditorPrefs: (prefs: EditorPrefs) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function sortDocuments(docs: Document[]): Document[] {
  return [...docs].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return toMillis(a.createdAt) - toMillis(b.createdAt);
  });
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useUI();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => localStorage.getItem('activeProjectId'));
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [lastWriteFailed, setLastWriteFailed] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [hasSaved, setHasSaved] = useState(false);
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === null ? true : saved === 'true';
  });

  const [aiConfig, setAIConfig] = useState<AIConfig>(() => readJSON<AIConfig>('aiConfig', {
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    temperature: 0.7,
    customPrompt: '',
    customEndpoints: [],
    activeCustomEndpointId: '',
  }));

  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>(() => readJSON('editorPrefs', DEFAULT_EDITOR_PREFS));

  const reportError = useCallback((action: string, error: unknown) => {
    console.error(`Firestore error while trying to ${action}:`, error);
    const code = (error as any)?.code;
    const message = code === 'permission-denied'
      ? `Couldn't ${action}: permission denied. Your Firestore rules may need deploying.`
      : `Couldn't ${action}. ${(error as any)?.message || ''}`.trim();
    toast(message, 'error');
  }, [toast]);

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDarkMode));
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDarkMode ? '#0B0D12' : '#F6F2EA');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('aiConfig', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem('editorPrefs', JSON.stringify(editorPrefs));
  }, [editorPrefs]);

  useEffect(() => {
    if (activeProjectId) localStorage.setItem('activeProjectId', activeProjectId);
  }, [activeProjectId]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveProjectIdState(id);
    setActiveDocumentId(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Project))
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
      setProjects(projs);
      setActiveProjectIdState(current => {
        if (current && projs.some(p => p.id === current)) return current;
        return projs[0]?.id ?? null;
      });
    }, (error) => reportError('load your projects', error));
    return () => unsubscribe();
  }, [user, reportError]);

  useEffect(() => {
    if (!user || !activeProjectId) {
      setDocuments([]);
      return;
    }
    const q = query(
      collection(db, 'documents'),
      where('projectId', '==', activeProjectId),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setDocuments(sortDocuments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Document))));
    }, (error) => reportError('load documents', error));
    return () => unsubscribe();
  }, [user, activeProjectId, reportError]);

  // Keep a ref so async helpers always see the latest documents.
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  /** Wraps a write so the save indicator reflects reality. */
  const trackWrite = useCallback(async <T,>(action: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setPendingWrites(n => n + 1);
    try {
      const result = await fn();
      setLastWriteFailed(false);
      setHasSaved(true);
      return result;
    } catch (error) {
      setLastWriteFailed(true);
      reportError(action, error);
      return undefined;
    } finally {
      setPendingWrites(n => Math.max(0, n - 1));
    }
  }, [reportError]);

  const createProject = async (title: string) => {
    if (!user) return;
    const ref = await trackWrite('create the project', () => addDoc(collection(db, 'projects'), {
      userId: user.uid,
      title,
      customAuthors: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    if (ref) setActiveProjectId(ref.id);
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    await trackWrite('update the project', () => updateDoc(doc(db, 'projects', id), {
      ...updates,
      updatedAt: serverTimestamp(),
    }));
  };

  const deleteProject = async (id: string) => {
    if (!user) return;
    await trackWrite('delete the project', async () => {
      const snap = await getDocs(query(collection(db, 'documents'), where('projectId', '==', id), where('userId', '==', user.uid)));
      // Batches are capped at 500 operations.
      for (let i = 0; i < snap.docs.length; i += 450) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'projects', id));
    });
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const createDocument = async (title: string, type: DocumentType, initialContent = '', options: CreateDocumentOptions = {}) => {
    if (!user || !activeProjectId) return null;
    const { activate = true, tags = [], synopsis } = options;
    const siblings = documentsRef.current.filter(d => d.type === type);
    const order = siblings.reduce((max, d) => Math.max(max, d.order ?? 0), 0) + 1;
    const data: Record<string, unknown> = {
      userId: user.uid,
      projectId: activeProjectId,
      title,
      type,
      content: initialContent,
      tags,
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (type === 'chapter' || type === 'scene') data.status = 'draft';
    if (synopsis) data.synopsis = synopsis;
    const ref = await trackWrite('create the document', () => addDoc(collection(db, 'documents'), data));
    if (!ref) return null;
    setLastCreatedId(ref.id);
    if (activate) setActiveDocumentId(ref.id);
    return ref.id;
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    await trackWrite('save your changes', () => updateDoc(doc(db, 'documents', id), {
      ...updates,
      updatedAt: serverTimestamp(),
    }));
  };

  const deleteDocument = async (id: string) => {
    if (activeDocumentId === id) setActiveDocumentId(null);
    await trackWrite('delete the document', () => deleteDoc(doc(db, 'documents', id)));
  };

  const duplicateDocument = async (id: string) => {
    const source = documentsRef.current.find(d => d.id === id);
    if (!source) return;
    await createDocument(`${source.title} (copy)`, source.type, source.content, {
      tags: source.tags || [],
      synopsis: source.synopsis,
    });
  };

  const reorderDocuments = async (orderedIds: string[]) => {
    // Optimistic local update so drag-and-drop feels instant.
    setDocuments(prev => sortDocuments(prev.map(d => {
      const idx = orderedIds.indexOf(d.id);
      return idx === -1 ? d : { ...d, order: idx + 1 };
    })));
    await trackWrite('reorder documents', async () => {
      const batch = writeBatch(db);
      orderedIds.forEach((id, idx) => batch.update(doc(db, 'documents', id), { order: idx + 1, updatedAt: serverTimestamp() }));
      await batch.commit();
    });
  };

  const saveVersion = async (documentId: string, content: string, label?: string) => {
    const source = documentsRef.current.find(d => d.id === documentId);
    if (!source) return;
    const newVersion = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      content,
      ...(label ? { label } : {}),
    };
    let versions = [...(source.versions || []), newVersion].slice(-MAX_VERSIONS);
    // Firestore documents are capped at 1 MiB — drop the oldest snapshots to stay well under it.
    const baseSize = (source.content?.length || 0) + (source.imageUrl?.length || 0) + (source.synopsis?.length || 0) + 4000;
    const sizeOf = (list: typeof versions) => list.reduce((sum, v) => sum + v.content.length * 1.1 + 120, 0);
    while (versions.length > 1 && baseSize + sizeOf(versions) > 900_000) versions = versions.slice(1);
    if (baseSize + sizeOf(versions) > 900_000) {
      toast('This document is too large to store another snapshot alongside it. Try removing its image.', 'error');
      return;
    }
    if (versions.length < (source.versions?.length || 0) + 1 && versions.length < MAX_VERSIONS) {
      toast('Older snapshots were pruned to stay within the storage limit.', 'info');
    }
    await trackWrite('save the snapshot', () => updateDoc(doc(db, 'documents', documentId), { versions, updatedAt: serverTimestamp() }));
  };

  const deleteVersion = async (documentId: string, versionId: string) => {
    const source = documentsRef.current.find(d => d.id === documentId);
    if (!source) return;
    const versions = (source.versions || []).filter(v => v.id !== versionId);
    await trackWrite('delete the snapshot', () => updateDoc(doc(db, 'documents', documentId), { versions, updatedAt: serverTimestamp() }));
  };

  const saveStatus: SaveStatus = lastWriteFailed
    ? 'error'
    : pendingWrites > 0
      ? (isOnline ? 'saving' : 'offline')
      : hasSaved ? 'saved' : 'idle';

  const activeProject = useMemo(() => projects.find(p => p.id === activeProjectId), [projects, activeProjectId]);

  const toggleDarkMode = () => setIsDarkMode(v => !v);

  return (
    <StoreContext.Provider value={{
      user, authLoading, projects, activeProject, activeProjectId, setActiveProjectId,
      documents, activeDocumentId, setActiveDocumentId,
      createProject, updateProject, deleteProject,
      createDocument, updateDocument, deleteDocument, duplicateDocument, reorderDocuments,
      saveVersion, deleteVersion, saveStatus, lastCreatedId,
      aiConfig, setAIConfig, editorPrefs, setEditorPrefs,
      isDarkMode, toggleDarkMode,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}

export function typeLabel(type: DocumentType) {
  return DOCUMENT_TYPES.find(t => t.id === type)?.label ?? type;
}
