/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, lazy, Suspense } from 'react';
import { twMerge } from 'tailwind-merge';
import { Feather, Loader2 } from 'lucide-react';
import { StoreProvider, useStore } from './hooks/useStore';
import { UIProvider, useUI } from './hooks/useUI';
import { Sidebar } from './components/Sidebar';
import { ProjectOverview } from './components/ProjectOverview';
import { signInWithGoogle } from './firebase';

const Editor = lazy(() => import('./components/Editor').then(m => ({ default: m.Editor })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ProjectSettingsModal = lazy(() => import('./components/ProjectSettingsModal').then(m => ({ default: m.ProjectSettingsModal })));
const ImportProjectModal = lazy(() => import('./components/ImportProjectModal').then(m => ({ default: m.ImportProjectModal })));
const ExportModal = lazy(() => import('./components/ExportModal').then(m => ({ default: m.ExportModal })));
const loadPalette = () => import('./components/CommandPalette');
const CommandPalette = lazy(() => loadPalette().then(m => ({ default: m.CommandPalette })));

type Overlay = 'settings' | 'project' | 'export' | 'import' | 'palette' | null;

function SignIn() {
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        toast(err?.message || 'Sign-in failed.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-[100dvh] w-full items-center justify-center bg-base p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 paper-grain" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative w-full max-w-sm text-center animate-slide-up">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center mx-auto shadow-float">
          <Feather className="w-6 h-6 text-on-accent" />
        </div>
        <h1 className="mt-7 font-serif italic text-5xl text-fg tracking-tight">The Author's Desk</h1>
        <p className="mt-4 text-fg-muted leading-relaxed">
          A quiet room for your novel — chapters, characters and lore in one place, with an AI co-writer who knows your story.
        </p>

        <button
          onClick={handleSignIn}
          disabled={busy}
          className="mt-10 w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-fg text-[var(--base)] font-medium hover:opacity-90 transition-opacity disabled:opacity-60 shadow-float"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
          )}
          Continue with Google
        </button>
        <p className="mt-6 text-xs text-fg-subtle">Your manuscripts sync securely across devices and work offline.</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const { user, authLoading, documents, activeDocumentId } = useStore();

  const activeDoc = documents.find(d => d.id === activeDocumentId);

  useEffect(() => {
    // Warm the palette chunk so keystrokes typed right after Ctrl/⌘K aren't lost.
    const idle = setTimeout(loadPalette, 1500);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOverlay(o => (o === 'palette' ? null : 'palette'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!activeDoc) setIsFocusMode(false);
  }, [activeDoc]);

  if (authLoading) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-base">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center animate-pulse">
            <Feather className="w-5 h-5 text-on-accent" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <SignIn />;

  const open = (o: Overlay) => {
    setOverlay(o);
    setIsSidebarOpen(false);
  };

  return (
    <div
      className="flex h-[100dvh] w-full bg-base text-fg overflow-hidden relative"
      style={{
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className={twMerge(
        'fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-out md:relative md:translate-x-0 h-full',
        isSidebarOpen ? 'translate-x-0 shadow-float' : '-translate-x-full',
        isFocusMode && 'md:hidden'
      )}>
        <Sidebar
          onOpenSettings={() => open('settings')}
          onOpenProjectSettings={() => open('project')}
          onOpenExport={() => open('export')}
          onOpenImport={() => open('import')}
          onOpenPalette={() => open('palette')}
          onCloseSidebar={() => setIsSidebarOpen(false)}
        />
      </div>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden animate-fade-in" onClick={() => setIsSidebarOpen(false)} />
      )}

      <main className="flex-1 min-w-0 flex">
        {activeDoc ? (
          <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>}>
            <Editor
              key={activeDoc.id}
              document={activeDoc}
              onOpenSidebar={() => setIsSidebarOpen(true)}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode(f => !f)}
            />
          </Suspense>
        ) : (
          <ProjectOverview onOpenSidebar={() => setIsSidebarOpen(true)} onOpenImport={() => open('import')} />
        )}
      </main>

      <Suspense fallback={null}>
        {overlay === 'settings' && <SettingsModal onClose={() => setOverlay(null)} />}
        {overlay === 'project' && <ProjectSettingsModal onClose={() => setOverlay(null)} />}
        {overlay === 'export' && <ExportModal onClose={() => setOverlay(null)} />}
        {overlay === 'import' && <ImportProjectModal onClose={() => setOverlay(null)} />}
        {overlay === 'palette' && (
          <CommandPalette
            onClose={() => setOverlay(null)}
            onOpenSettings={() => setOverlay('settings')}
            onOpenExport={() => setOverlay('export')}
            onOpenImport={() => setOverlay('import')}
            onOpenProjectSettings={() => setOverlay('project')}
          />
        )}
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <UIProvider>
      <StoreProvider>
        <AppContent />
      </StoreProvider>
    </UIProvider>
  );
}
