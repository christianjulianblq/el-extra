'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Force the browser to always check the network for sw.js updates,
      // bypassing any HTTP cache or SW cache of the file itself.
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          // If there's a stuck old SW, force an update check now
          reg.update().catch(() => {});
        })
        .catch(() => {
          // Service worker registration failed - not critical
        });
    }
  }, []);

  return null;
}
