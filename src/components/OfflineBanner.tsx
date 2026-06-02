'use client';

import { useEffect, useState } from 'react';
import { contarPendientes } from '@/lib/offline-storage';
import { sincronizarPendientes } from '@/lib/sync-manager';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Initial state + listeners
  useEffect(() => {
    setOnline(navigator.onLine);
    setPendientes(contarPendientes());

    const goOnline = async () => {
      setOnline(true);
      // Auto-sync when back online
      const count = contarPendientes();
      if (count > 0) {
        setSyncing(true);
        await sincronizarPendientes();
        setPendientes(contarPendientes());
        setSyncing(false);
      }
    };

    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Also sync on mount if online and has pending
    if (navigator.onLine && contarPendientes() > 0) {
      setSyncing(true);
      sincronizarPendientes().then(() => {
        setPendientes(contarPendientes());
        setSyncing(false);
      });
    }

    // Poll pending count (for when other tabs save offline)
    const interval = setInterval(() => {
      setPendientes(contarPendientes());
    }, 3000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(interval);
    };
  }, []);

  // Listen for custom event dispatched after offline save
  useEffect(() => {
    const handler = () => setPendientes(contarPendientes());
    window.addEventListener('offline-visit-saved', handler);
    return () => window.removeEventListener('offline-visit-saved', handler);
  }, []);

  // Nothing to show
  if (online && pendientes === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      {!online && (
        <div className="bg-red-600 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728M12 9v4m0 4h.01" />
          </svg>
          Sin conexión
        </div>
      )}
      {pendientes > 0 && (
        <div className={`${online ? 'bg-yellow-500' : 'bg-yellow-600'} text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2`}>
          {syncing ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Sincronizando...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pendientes por sincronizar: {pendientes}
            </>
          )}
        </div>
      )}
    </div>
  );
}
