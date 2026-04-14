'use client';

import { useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase, Beneficiario } from '@/lib/supabase';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function VisitaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { usuario, loading: authLoading } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form fields
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [curp, setCurp] = useState('');
  const [telefono, setTelefono] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !usuario) {
      router.push('/login');
    }
  }, [usuario, authLoading, router]);

  useEffect(() => {
    const fetchBeneficiario = async () => {
      const { data } = await supabase
        .from('beneficiarios')
        .select('*')
        .eq('id', id)
        .single();

      if (data) {
        setBeneficiario(data);
        setNombreCompleto(data.nombre);
        setTelefono(data.telefono || '');
      }
      setLoading(false);
    };

    fetchBeneficiario();
  }, [id]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFoto(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();

      img.onload = () => {
        const maxSize = 800;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob!], file.name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.7
        );
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuario || !beneficiario) return;

    setError('');
    setSaving(true);

    try {
      // Upload photo if exists
      let fotoUrl: string | null = null;
      if (foto) {
        const compressed = await compressImage(foto);
        const fileName = `${id}_${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidencias')
          .upload(fileName, compressed, { contentType: 'image/jpeg' });

        if (uploadError) {
          throw new Error('Error al subir la foto: ' + uploadError.message);
        }

        const { data: urlData } = supabase.storage
          .from('evidencias')
          .getPublicUrl(uploadData.path);

        fotoUrl = urlData.publicUrl;
      }

      // Call the atomic function to register the visit
      const { data, error: rpcError } = await supabase.rpc('registrar_visita', {
        p_beneficiario_id: id,
        p_sub_padrino_id: usuario.id,
        p_nombre_completo: nombreCompleto,
        p_curp: curp || null,
        p_telefono: telefono || null,
        p_foto_url: fotoUrl,
      });

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || 'No se pudo registrar la visita');
      }

      setSuccess(true);
      setTimeout(() => router.push('/'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!beneficiario) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Beneficiario no encontrado</p>
          <button onClick={() => router.push('/')} className="mt-4 text-blue-600 underline">
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (beneficiario.visitado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-2xl p-8 shadow-lg max-w-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800">Ya fue visitado</h2>
          <p className="text-gray-500 mt-2">Este beneficiario ya tiene una visita registrada.</p>
          <button
            onClick={() => router.push('/')}
            className="mt-6 bg-blue-700 text-white px-6 py-3 rounded-xl font-medium"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-white rounded-2xl p-8 shadow-lg max-w-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-800">Visita registrada</h2>
          <p className="text-gray-500 mt-2">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <header className="bg-blue-700 text-white px-4 py-4 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-blue-600 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold">Registrar Visita</h1>
            <p className="text-blue-200 text-xs truncate">{beneficiario.nombre}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Beneficiary info card */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-800 text-lg">{beneficiario.nombre}</h2>
          {beneficiario.direccion && (
            <p className="text-sm text-gray-500 mt-1">{beneficiario.direccion}</p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            {beneficiario.telefono && (
              <a
                href={`tel:${beneficiario.telefono}`}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-green-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Llamar
              </a>
            )}
            {beneficiario.direccion && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(beneficiario.direccion)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-medium text-sm hover:bg-blue-700 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Abrir Mapa
              </a>
            )}
          </div>
        </div>

        {/* Map */}
        {beneficiario.latitud && beneficiario.longitud && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-medium text-gray-700 mb-2 text-sm">Ubicación</h3>
            <MapView lat={beneficiario.latitud} lng={beneficiario.longitud} nombre={beneficiario.nombre} />
          </div>
        )}

        {/* Visit form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
          <h3 className="font-bold text-gray-800">Datos de la visita</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre completo *
            </label>
            <input
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CURP
            </label>
            <input
              type="text"
              value={curp}
              onChange={(e) => setCurp(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 uppercase focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={18}
              placeholder="XXXX000000XXXXXX00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="10 dígitos"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Foto de evidencia
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition"
            >
              {fotoPreview ? (
                <img
                  src={fotoPreview}
                  alt="Preview"
                  className="max-h-48 mx-auto rounded-lg"
                />
              ) : (
                <div className="text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-sm">Tomar foto o seleccionar imagen</p>
                </div>
              )}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !nombreCompleto.trim()}
            className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-bold hover:bg-green-700 active:bg-green-800 transition disabled:opacity-50"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                Guardando...
              </span>
            ) : (
              'Registrar Visita'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
