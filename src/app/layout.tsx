import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import OfflineBanner from '@/components/OfflineBanner';

export const metadata: Metadata = {
  title: 'SEDECO - Control de Visitas',
  description: 'Sistema de control de visitas en tiempo real',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SEDECO',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1e40af',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Emergency SW cleanup: if an old SW cached sw.js itself,
              // it can never update. This inline script runs before React
              // and forces a re-register if the SW is stale.
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistration().then(function(reg) {
                  if (reg && reg.active) {
                    // Force update check bypassing SW cache
                    reg.update().catch(function() {});
                  }
                }).catch(function() {});
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-gray-50 antialiased">
        <AuthProvider>{children}</AuthProvider>
        <OfflineBanner />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
