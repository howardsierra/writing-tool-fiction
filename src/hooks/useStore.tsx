import { useState, useEffect, createContext, useContext } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { Project, Document, AIConfig } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface StoreContextType {
  user: any;
  authLoading: boolean;
  projects: Project[];
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
  documents: Document[];
  activeDocumentId: string | null;
  setActiveDocumentId: (id: string | null) => void;
  createProject: (title: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  createDocument: (title: string, type: Document['type'], initialContent?: string, tags?: string[]) => Promise<void>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  saveVersion: (documentId: string, content: string, label?: string) => Promise<void>;
  aiConfig: AIConfig;
  setAIConfig: (config: AIConfig) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true' || window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [aiConfig, setAIConfig] = useState<AIConfig>(() => {
    const saved = localStorage.getItem('aiConfig');
    return saved ? JSON.parse(saved) : {
      provider: 'gemini',
      model: 'gemini-3.1-pro-preview',
      temperature: 0.7,
      authorStyle: '',
      customPrompt: '',
      customEndpoints: [],
      activeCustomEndpointId: ''
    };
  });

  useEffect(() => {
    localStorage.setItem('darkMode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('aiConfig', JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    const q = query(collection(db, 'projects'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projs);
      if (projs.length > 0 && !activeProjectId) {
        setActiveProjectId(projs[0].id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });
    return () => unsubscribe();
  }, [user, activeProjectId]);

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
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
      setDocuments(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
    });
    return () => unsubscribe();
  }, [user, activeProjectId]);

  const createProject = async (title: string) => {
    if (!user) return;
    try {
      const docRef = await addDoc(collection(db, 'projects'), {
        userId: user.uid,
        title,
        customAuthors: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveProjectId(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      await updateDoc(doc(db, 'projects', id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const createDocument = async (title: string, type: Document['type'], initialContent: string = '', tags: string[] = []) => {
    if (!user || !activeProjectId) return;
    try {
      const docRef = await addDoc(collection(db, 'documents'), {
        userId: user.uid,
        projectId: activeProjectId,
        title,
        type,
        content: initialContent,
        tags: tags,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setActiveDocumentId(docRef.id);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'documents');
    }
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    try {
      await updateDoc(doc(db, 'documents', id), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `documents/${id}`);
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'documents', id));
      if (activeDocumentId === id) {
        setActiveDocumentId(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `documents/${id}`);
    }
  };

  const saveVersion = async (documentId: string, content: string, label?: string) => {
    try {
      const docRef = doc(db, 'documents', documentId);
      const docSnap = documents.find(d => d.id === documentId);
      if (docSnap) {
        const newVersion = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          content,
          label
        };
        const updatedVersions = [...(docSnap.versions || []), newVersion];
        await updateDoc(docRef, { versions: updatedVersions });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `documents/${documentId}`);
    }
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  return (
    <StoreContext.Provider value={{
      user, authLoading, projects, activeProjectId, setActiveProjectId,
      documents, activeDocumentId, setActiveDocumentId,
      createProject, updateProject, createDocument, updateDocument, deleteDocument, saveVersion,
      aiConfig, setAIConfig,
      isDarkMode, toggleDarkMode
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
