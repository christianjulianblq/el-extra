'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import ExcelImporter from '@/components/ExcelImporter';

interface VisitaConDetalles {
  id: string;
  nombre_completo: string;
  curp: string | null;
  telefono: string | null;
  foto_url: string | null;
  fecha_hora: string;
  beneficiarios: { nombre: string; direccion: string | null } | null;
  sub_padrinos: { nombre: string } | null;
}

export default function AdminPage() {
  const { usuario, loading } = useAuth();
  const router = useRouter();
  const [visitas, setVisitas] = useState<VisitaConDetalles[]>([]);
  const [subPadrinos, setSubPadrinos] = useState<{ id: string; nombre: string }[]>([]);
  const [filtroSubPadrino, setFiltroSubPadrino] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<'visitas' | 'importar'>('visitas');
  const [stats, setStats] = useState({ total: 0, visitados: 0, pendientes: 0 });
  const [fotoModal, setFotoModal] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!usuario || !usuario.es_admin)) {
      router.push('/');
    }
  }, [usuario, loading, router]);

  useEffect(() => {
    if (!usuario?.es_admin) return;

    const fetchData = async () => {
      // Get all visits with details
      const { data: visitasData } = await supabase
        .from('visitas')
        .select('id, nombre_completo, curp, telefono, foto_url, fecha_hora, beneficiarios(nombre, direccion), sub_padrinos(nombre)')
        .order('fecha_hora', { ascending: false });

      setVisitas((visitasData as unknown as VisitaConDetalles[]) || []);

      // Get sub padrinos
      const { data: spData } = await supabase
        .from('sub_padrinos')
        .select('id, nombre')
        .order('nombre');

      setSubPadrinos(spData || []);

      // Get stats
      const { count: total } = await supabase
        .from('beneficiarios')
        .select('*', { count: 'exact', head: true });

      const { count: visitados } = await supabase
        .from('beneficiarios')
        .select('*', { count: 'exact', head: true })
        .eq('visitado', true);

      setStats({
        total: total || 0,
        visitados: visitados || 0,
        pendientes: (total || 0) - (visitados || 0),
      });

      setLoadingData(false);
    };

    fetchData();

    // Real-time subscription
    const channel = supabase
      .channel('admin-visitas')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'visitas' },
        async () => {
          // Refresh data on new visit
          const { data } = await supabase
            .from('visitas')
            .select('id, nombre_completo, curp, telefono, foto_url, fecha_hora, beneficiarios(nombre, direccion), sub_padrinos(nombre)')
            .order('fecha_hora', { ascending: false });
          setVisitas((data as unknown as VisitaConDetalles[]) || []);

          setStats((prev) => ({
            ...prev,
            visitados: prev.visitados + 1,
            pendientes: prev.pendientes - 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [usuario]);

  if (loading || !usuario?.es_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const filteredVisitas = filtroSubPadrino
    ? visitas.filter((v) => v.sub_padrinos?.nombre === filtroSubPadrino)
    : visitas;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <header className="bg-blue-800 text-white px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-2 hover:bg-blue-700 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold">Panel Admin</h1>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-gray-800">{stats.total}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-green-600">{stats.visitados}</p>
          <p className="text-xs text-gray-500">Visitados</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-orange-500">{stats.pendientes}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-4">
        <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-green-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.total ? (stats.visitados / stats.total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">
          {stats.total ? Math.round((stats.visitados / stats.total) * 100) : 0}% completado
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 mb-4">
        <button
          onClick={() => setTab('visitas')}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
            tab === 'visitas' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 border'
          }`}
        >
          Visitas Realizadas
        </button>
        <button
          onClick={() => setTab('importar')}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
            tab === 'importar' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 border'
          }`}
        >
          Importar Excel
        </button>
      </div>

      {tab === 'visitas' ? (
        <div className="px-4">
          {/* Filter by sub padrino */}
          <select
            value={filtroSubPadrino}
            onChange={(e) => setFiltroSubPadrino(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 mb-4"
          >
            <option value="">Todos los sub padrinos</option>
            {subPadrinos.map((sp) => (
              <option key={sp.id} value={sp.nombre}>
                {sp.nombre}
              </option>
            ))}
          </select>

          {loadingData ? (
            <div className="text-center py-10">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
            </div>
          ) : filteredVisitas.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400">No hay visitas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{filteredVisitas.length} visitas</p>
              {filteredVisitas.map((v) => (
                <div key={v.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{v.nombre_completo}</h3>
                      {v.curp && <p className="text-xs text-gray-400 mt-0.5">CURP: {v.curp}</p>}
                      <p className="text-sm text-blue-600 mt-1">{v.sub_padrinos?.nombre}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(v.fecha_hora).toLocaleString('es-MX', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                    {v.foto_url && (
                      <button
                        onClick={() => setFotoModal(v.foto_url)}
                        className="ml-2 flex-shrink-0"
                      >
                        <img
                          src={v.foto_url}
                          alt="Evidencia"
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4">
          <ExcelImporter onComplete={() => setTab('visitas')} />
        </div>
      )}

      {/* Photo modal */}
      {fotoModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setFotoModal(null)}
        >
          <img src={fotoModal} alt="Evidencia" className="max-w-full max-h-[80vh] rounded-xl" />
        </div>
      )}
    </div>
  );
}
