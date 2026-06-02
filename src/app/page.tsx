'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase, Beneficiario } from '@/lib/supabase';
import {
  guardarBeneficiariosCache,
  obtenerBeneficiariosCache,
  obtenerJornadaMeta,
  marcarVisitadoEnCache,
  JornadaMeta,
} from '@/lib/jornada-cache';

export default function HomePage() {
  const { usuario, loading, logout } = useAuth();
  const router = useRouter();
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'visitados'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [isOfflineData, setIsOfflineData] = useState(false);
  const [jornadaMeta, setJornadaMeta] = useState<JornadaMeta | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMsg, setDownloadMsg] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!loading && !usuario) {
      router.push('/login');
    }
  }, [usuario, loading, router]);

  const fetchFromSupabase = useCallback(async (): Promise<Beneficiario[]> => {
    if (usuario!.es_admin) {
      const { data } = await supabase
        .from('beneficiarios')
        .select('*')
        .order('nombre');
      return data || [];
    } else {
      const { data } = await supabase
        .from('asignaciones')
        .select('beneficiario_id, beneficiarios(*)')
        .eq('sub_padrino_id', usuario!.id);

      return (data || [])
        .map((a: Record<string, unknown>) => a.beneficiarios as Beneficiario)
        .filter(Boolean)
        .sort((a: Beneficiario, b: Beneficiario) => a.nombre.localeCompare(b.nombre));
    }
  }, [usuario]);

  useEffect(() => {
    if (!usuario) return;

    // Load meta for display
    setJornadaMeta(obtenerJornadaMeta());

    const loadBeneficiarios = async () => {
      // 1. Show cached data immediately (if available)
      const cached = obtenerBeneficiariosCache(usuario.id);
      if (cached.length > 0) {
        setBeneficiarios(cached);
        setLoadingData(false);
      }

      // 2. If online, fetch fresh data
      if (navigator.onLine) {
        try {
          const fresh = await fetchFromSupabase();
          setBeneficiarios(fresh);
          guardarBeneficiariosCache(fresh, usuario.id);
          setJornadaMeta(obtenerJornadaMeta());
          setIsOfflineData(false);
        } catch {
          // Network failed — keep cache
          if (cached.length > 0) {
            setIsOfflineData(true);
          }
        }
      } else {
        // Offline — use cache
        if (cached.length > 0) {
          setIsOfflineData(true);
        }
      }

      setLoadingData(false);
    };

    loadBeneficiarios();

    // Realtime only if online
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (navigator.onLine) {
      channel = supabase
        .channel('beneficiarios-changes')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'beneficiarios' },
          (payload) => {
            setBeneficiarios((prev) => {
              const updated = prev.map((b) =>
                b.id === payload.new.id ? { ...b, ...payload.new } : b
              );
              // Also update cache
              guardarBeneficiariosCache(updated, usuario.id);
              return updated;
            });
          }
        )
        .subscribe();
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [usuario, fetchFromSupabase]);

  // Listen for offline-visit-saved to update cache
  useEffect(() => {
    const handler = () => {
      const raw = localStorage.getItem('visitas_pendientes');
      if (raw) {
        try {
          const pendientes = JSON.parse(raw);
          pendientes.forEach((p: { beneficiario_id: string }) => {
            marcarVisitadoEnCache(p.beneficiario_id);
          });
          if (usuario) {
            setBeneficiarios(obtenerBeneficiariosCache(usuario.id));
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('offline-visit-saved', handler);
    return () => window.removeEventListener('offline-visit-saved', handler);
  }, [usuario]);

  if (loading || !usuario) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const handleDescargarJornada = async () => {
    if (!usuario || !isOnline) return;
    setDownloading(true);
    setDownloadMsg('');
    try {
      const fresh = await fetchFromSupabase();
      guardarBeneficiariosCache(fresh, usuario.id);
      setBeneficiarios(fresh);
      const meta = obtenerJornadaMeta();
      setJornadaMeta(meta);
      setIsOfflineData(false);
      setDownloadMsg(`${fresh.length} beneficiarios descargados`);
      setTimeout(() => setDownloadMsg(''), 4000);
    } catch {
      setDownloadMsg('Error al descargar. Verifica tu conexión.');
      setTimeout(() => setDownloadMsg(''), 4000);
    } finally {
      setDownloading(false);
    }
  };

  const filtered = beneficiarios
    .filter((b) => {
      if (filtro === 'pendientes') return !b.visitado;
      if (filtro === 'visitados') return b.visitado;
      return true;
    })
    .filter((b) => {
      if (!busqueda.trim()) return true;
      const q = busqueda.toLowerCase();
      return (
        b.nombre.toLowerCase().includes(q) ||
        b.direccion?.toLowerCase().includes(q) ||
        b.telefono?.includes(q)
      );
    });

  const totalVisitados = beneficiarios.filter((b) => b.visitado).length;
  const totalPendientes = beneficiarios.filter((b) => !b.visitado).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-blue-700 text-white px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">El Extra</h1>
            <p className="text-blue-200 text-xs">{usuario.nombre}</p>
          </div>
          <div className="flex gap-2">
            {usuario.es_admin && (
              <button
                onClick={() => router.push('/admin')}
                className="bg-blue-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition"
              >
                Admin
              </button>
            )}
            <button
              onClick={logout}
              className="bg-blue-800 px-3 py-2 rounded-lg text-sm hover:bg-blue-900 transition"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-800">{beneficiarios.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-green-600">{totalVisitados}</p>
          <p className="text-xs text-gray-500">Visitados</p>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm">
          <p className="text-2xl font-bold text-orange-500">{totalPendientes}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
      </div>

      {/* Offline indicator */}
      {isOfflineData && (
        <div className="mx-4 mb-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-yellow-700">Mostrando datos guardados localmente</p>
        </div>
      )}

      {/* Download jornada card */}
      <div className="mx-4 mb-3 bg-white rounded-xl p-4 shadow-sm">
        <button
          onClick={handleDescargarJornada}
          disabled={downloading || !isOnline}
          className="w-full flex items-center justify-center gap-2 bg-blue-700 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-800 active:bg-blue-900 transition disabled:opacity-50"
        >
          {downloading ? (
            <>
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              Descargando...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Descargar jornada para uso sin conexión
            </>
          )}
        </button>
        {downloadMsg && (
          <p className="text-center text-sm text-green-600 mt-2 font-medium">{downloadMsg}</p>
        )}
        {jornadaMeta && (
          <div className="mt-2 text-center text-xs text-gray-400 space-y-0.5">
            <p>Beneficiarios descargados: {jornadaMeta.cantidad}</p>
            <p>Última actualización: {new Date(jornadaMeta.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</p>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-4 mb-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar beneficiario..."
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Filter */}
      <div className="flex gap-2 px-4 mb-4">
        {(['todos', 'pendientes', 'visitados'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              filtro === f
                ? 'bg-blue-700 text-white'
                : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="px-4 space-y-3">
        {loadingData ? (
          <div className="text-center py-10">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-2 text-sm">Cargando beneficiarios...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 text-lg">
              {!isOnline && beneficiarios.length === 0
                ? 'No hay beneficiarios descargados para uso sin conexión.'
                : 'No hay beneficiarios'}
            </p>
          </div>
        ) : (
          filtered.map((ben) => (
            <div
              key={ben.id}
              onClick={() => !ben.visitado && router.push(`/visita/${ben.id}`)}
              className={`bg-white rounded-xl p-4 shadow-sm border-l-4 transition active:scale-[0.98] ${
                ben.visitado
                  ? 'border-green-500 opacity-70'
                  : 'border-orange-400 cursor-pointer hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">{ben.nombre}</h3>
                  {ben.direccion && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{ben.direccion}</p>
                  )}
                  {ben.telefono && (
                    <p className="text-sm text-gray-400 mt-1">{ben.telefono}</p>
                  )}
                </div>
                <div className="ml-3 flex-shrink-0">
                  {ben.visitado ? (
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Visitado
                    </span>
                  ) : (
                    <span className="inline-flex items-center bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-medium">
                      Pendiente
                    </span>
                  )}
                </div>
              </div>

              {!ben.visitado && (
                <div className="flex gap-2 mt-3">
                  {ben.telefono && (
                    <a
                      href={`tel:${ben.telefono}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Llamar
                    </a>
                  )}
                  {ben.direccion && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ben.direccion)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Mapa
                    </a>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
