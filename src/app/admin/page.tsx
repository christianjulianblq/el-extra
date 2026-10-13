'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { rpc, Beneficiario } from '@/lib/supabase';
import ExcelImporter from '@/components/ExcelImporter';

interface Visita {
  id: string;
  nombre_completo: string;
  curp: string | null;
  telefono: string | null;
  foto_url: string | null;
  notas: string | null;
  fecha_hora: string;
  direccion: string | null;
  subpadrino: string | null;
}
interface UsuarioFila {
  id: string;
  nombre: string;
  usuario: string;
  departamento: string | null;
  must_change: boolean;
  es_admin: boolean;
  beneficiarios: number;
}
type Tab = 'visitas' | 'beneficiarios' | 'usuarios' | 'importar';

export default function AdminPage() {
  const { usuario, loading } = useAuth();
  const router = useRouter();
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [bens, setBens] = useState<Beneficiario[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [filtroSP, setFiltroSP] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<'todos' | 'pendientes' | 'visitados'>('todos');
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab] = useState<Tab>('visitas');
  const [fotoModal, setFotoModal] = useState<string | null>(null);
  const [reset, setReset] = useState<{ nombre: string; usuario: string; password: string } | null>(null);

  useEffect(() => {
    if (!loading && (!usuario || !usuario.es_admin)) router.push('/');
  }, [usuario, loading, router]);

  const cargar = useCallback(async () => {
    try {
      const [v, b, u] = await Promise.all([
        rpc<Visita[]>('admin_visitas'),
        rpc<Beneficiario[]>('mis_beneficiarios'),
        rpc<UsuarioFila[]>('admin_usuarios'),
      ]);
      setVisitas(v);
      setBens(b);
      setUsuarios(u);
    } catch (e) {
      console.error(e);
    }
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (!usuario?.es_admin) return;
    cargar();
    const t = setInterval(() => document.visibilityState === 'visible' && cargar(), 20000);
    return () => clearInterval(t);
  }, [usuario, cargar]);

  const resetPassword = async (u: UsuarioFila) => {
    if (!confirm(`¿Generar una contraseña nueva para ${u.nombre}? Se cerrará su sesión.`)) return;
    const res = await rpc<{ password: string }>('admin_reset_password', { p_usuario_id: u.id });
    setReset({ nombre: u.nombre, usuario: u.usuario, password: res.password });
    cargar();
  };

  const stats = useMemo(() => {
    const visitados = bens.filter((b) => b.visitado).length;
    return { total: bens.length, visitados, pendientes: bens.length - visitados };
  }, [bens]);

  const nombresSP = useMemo(() => [...new Set(visitas.map((v) => v.subpadrino || ''))].filter(Boolean).sort(), [visitas]);

  const visitasFiltradas = visitas.filter((v) => !filtroSP || v.subpadrino === filtroSP);

  const bensFiltrados = bens.filter((b) => {
    if (estado === 'pendientes' && b.visitado) return false;
    if (estado === 'visitados' && !b.visitado) return false;
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return [b.nombre, b.direccion, b.telefono, b.subpadrino, b.departamento].some((x) => x?.toLowerCase().includes(q));
  });

  if (loading || !usuario?.es_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ['visitas', 'Visitas'],
    ['beneficiarios', 'Beneficiarios'],
    ['usuarios', 'Usuarios'],
    ['importar', 'Importar'],
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-blue-800 text-white px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')} className="p-2 hover:bg-blue-700 rounded-lg transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold">Panel Admin</h1>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 p-4">
        {[
          ['Total', stats.total, 'text-gray-800'],
          ['Visitados', stats.visitados, 'text-green-600'],
          ['Pendientes', stats.pendientes, 'text-orange-500'],
        ].map(([l, n, c]) => (
          <div key={l as string} className="bg-white rounded-xl p-4 text-center shadow-sm">
            <p className={`text-3xl font-bold ${c}`}>{n}</p>
            <p className="text-xs text-gray-500">{l}</p>
          </div>
        ))}
      </div>

      <div className="px-4 mb-4">
        <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className="bg-green-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${stats.total ? (stats.visitados / stats.total) * 100 : 0}%` }} />
        </div>
        <p className="text-xs text-gray-500 mt-1 text-right">
          {stats.total ? Math.round((stats.visitados / stats.total) * 100) : 0}% completado
        </p>
      </div>

      <div className="flex gap-1 px-4 mb-4">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-3 rounded-xl text-xs sm:text-sm font-medium transition ${
              tab === k ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 border'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {loadingData && tab !== 'importar' ? (
        <div className="text-center py-10">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
        </div>
      ) : tab === 'visitas' ? (
        <div className="px-4">
          <select value={filtroSP} onChange={(e) => setFiltroSP(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 mb-4">
            <option value="">Todos los sub padrinos</option>
            {nombresSP.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {visitasFiltradas.length === 0 ? (
            <p className="text-center py-10 text-gray-400">No hay visitas registradas</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">{visitasFiltradas.length} visitas</p>
              {visitasFiltradas.map((v) => (
                <div key={v.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">{v.nombre_completo}</h3>
                      {v.curp && <p className="text-xs text-gray-400 mt-0.5">CURP: {v.curp}</p>}
                      <p className="text-sm text-blue-600 mt-1">{v.subpadrino}</p>
                      {v.notas && <p className="text-sm text-gray-600 mt-1">{v.notas}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(v.fecha_hora).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    {v.foto_url && (
                      <button onClick={() => setFotoModal(v.foto_url)} className="ml-2 flex-shrink-0">
                        <img src={v.foto_url} alt="Evidencia" className="w-16 h-16 object-cover rounded-lg" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'beneficiarios' ? (
        <div className="px-4">
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono, dirección, sub padrino o departamento..."
            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 mb-3" />
          <div className="flex gap-2 mb-3">
            {(['todos', 'pendientes', 'visitados'] as const).map((f) => (
              <button key={f} onClick={() => setEstado(f)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                  estado === f ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 border border-gray-200'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500 mb-2">{bensFiltrados.length} beneficiarios</p>
          <div className="space-y-2">
            {bensFiltrados.map((b) => (
              <div key={b.id} className={`bg-white rounded-xl p-3 shadow-sm border-l-4 ${b.visitado ? 'border-green-500' : 'border-orange-400'}`}>
                <div className="flex justify-between gap-2">
                  <h3 className="font-semibold text-gray-800 text-sm">{b.nombre}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full h-fit ${b.visitado ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {b.visitado ? 'Visitado' : 'Pendiente'}
                  </span>
                </div>
                {b.direccion && <p className="text-xs text-gray-500 mt-1">{b.direccion}</p>}
                {b.telefono && <a href={`tel:${b.telefono}`} className="text-xs text-gray-500">{b.telefono}</a>}
                <p className="text-xs text-blue-600 mt-1">{b.subpadrino} · {b.departamento}</p>
              </div>
            ))}
          </div>
        </div>
      ) : tab === 'usuarios' ? (
        <div className="px-4 space-y-2">
          <p className="text-xs text-gray-500">
            Las contraseñas no se pueden consultar (están cifradas). Si alguien la olvidó, genera una nueva.
          </p>
          {usuarios.map((u) => (
            <div key={u.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm truncate">{u.nombre}</p>
                <p className="text-xs text-gray-500">
                  {u.usuario} · {u.departamento} · {u.es_admin ? 'admin' : `${u.beneficiarios} benef.`}
                </p>
                <p className={`text-xs ${u.must_change ? 'text-orange-600' : 'text-green-600'}`}>
                  {u.must_change ? 'Aún no cambia su contraseña' : 'Contraseña personalizada'}
                </p>
              </div>
              <button onClick={() => resetPassword(u)}
                className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium flex-shrink-0">
                Nueva clave
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4">
          <ExcelImporter onComplete={cargar} />
        </div>
      )}

      {reset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setReset(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-500">{reset.nombre}</p>
            <p className="mt-3 text-gray-700">Usuario: <b>{reset.usuario}</b></p>
            <p className="text-gray-700">Contraseña: <b className="font-mono text-lg">{reset.password}</b></p>
            <p className="text-xs text-gray-400 mt-3">Cópiala ahora: no se volverá a mostrar. Deberá cambiarla al entrar.</p>
            <button onClick={() => setReset(null)} className="mt-4 bg-blue-700 text-white px-6 py-2 rounded-xl">Listo</button>
          </div>
        </div>
      )}

      {fotoModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setFotoModal(null)}>
          <img src={fotoModal} alt="Evidencia" className="max-w-full max-h-[80vh] rounded-xl" />
        </div>
      )}
    </div>
  );
}
