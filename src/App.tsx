/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, lazy, Suspense } from 'react';
import { twMerge } from 'tailwind-merge';
import { StoreProvider, useStore } from './hooks/useStore';
import { Sidebar } from './components/Sidebar';
import { signInWithGoogle } from './firebase';

const Editor = lazy(() => import('./components/Editor').then(module => ({ default: module.Editor })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));

function AppContent() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, authLoading } = useStore();

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0C10] text-[#D4AF37]">
        <div className="text-[10px] uppercase tracking-[0.2em] animate-pulse">Initializing System...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#0A0C10] text-[#E0E0E0] p-4">
        <div className="max-w-md w-full bg-[#11141B] border border-[#2D3139] p-8 rounded text-center shadow-2xl">
          <h1 className="text-xl italic text-white font-serif mb-2">The Author's Desk</h1>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-8">Sign in to access your manuscripts</p>
          <button 
            onClick={() => signInWithGoogle().catch(console.error)}
            className="w-full py-3 bg-[#1A1D26] hover:bg-[#2D3139] border border-[#2D3139] text-[#D4AF37] rounded transition-all text-xs tracking-widest uppercase"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[#0A0C10] text-[#E0E0E0] font-sans overflow-hidden relative">
      <div className={twMerge(
        "fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 md:relative md:translate-x-0 h-full",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar onOpenSettings={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); }} onCloseSidebar={() => setIsSidebarOpen(false)} />
      </div>
      
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[#D4AF37] text-xs tracking-widest animate-pulse min-w-0">Loading Editor...</div>}>
        <Editor onOpenSidebar={() => setIsSidebarOpen(true)} />
      </Suspense>
      
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

