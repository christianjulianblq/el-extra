'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function CambiarPasswordPage() {
  const { usuario, loading, cambiarPassword, logout } = useAuth();
  const router = useRouter();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !usuario) router.replace('/login');
  }, [loading, usuario, router]);

  if (loading || !usuario) return null;
  const obligatorio = usuario.must_change;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (nueva.length < 6) return setError('La nueva contraseña debe tener al menos 6 caracteres');
    if (nueva !== confirmar) return setError('Las contraseñas no coinciden');
    setSaving(true);
    const res = await cambiarPassword(actual, nueva);
    setSaving(false);
    if (res.success) router.replace('/');
    else setError(res.error || 'No se pudo cambiar la contraseña');
  };

  const input =
    'w-full px-4 py-3 border border-gray-300 rounded-xl text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 to-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <h1 className="text-xl font-bold text-gray-800 text-center">
          {obligatorio ? 'Crea tu contraseña' : 'Cambiar contraseña'}
        </h1>
        <p className="text-gray-500 text-sm text-center mt-1 mb-6">
          {obligatorio
            ? `Hola ${usuario.nombre.split(' ')[0]}, por seguridad debes cambiar tu contraseña inicial antes de continuar.`
            : usuario.nombre}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" className={input} placeholder="Contraseña actual" value={actual}
            onChange={(e) => setActual(e.target.value)} required autoComplete="current-password" />
          <input type="password" className={input} placeholder="Nueva contraseña (mín. 6)" value={nueva}
            onChange={(e) => setNueva(e.target.value)} required autoComplete="new-password" />
          <input type="password" className={input} placeholder="Repite la nueva contraseña" value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)} required autoComplete="new-password" />
          {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm text-center">{error}</div>}
          <button type="submit" disabled={saving}
            className="w-full bg-blue-700 text-white py-4 rounded-xl text-lg font-semibold hover:bg-blue-800 transition disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar contraseña'}
          </button>
          {obligatorio ? (
            <button type="button" onClick={logout} className="w-full text-sm text-gray-500 underline">Salir</button>
          ) : (
            <button type="button" onClick={() => router.push('/')} className="w-full text-sm text-gray-500 underline">Cancelar</button>
          )}
        </form>
      </div>
    </div>
  );
}
