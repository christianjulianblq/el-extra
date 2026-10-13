import { supabase, rpc } from './supabase';
import {
  obtenerPendientesOffline,
  eliminarPendienteSincronizado,
  VisitaPendiente,
} from './offline-storage';

// Convert base64 data URL to File
function base64ToFile(base64: string, fileName: string): File {
  const [header, data] = base64.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return new File([arr], fileName, { type: mime });
}

async function sincronizarUna(pendiente: VisitaPendiente): Promise<boolean> {
  try {
    // Upload photo if exists
    let fotoUrl: string | null = null;
    if (pendiente.foto_base64) {
      const fileName = `${pendiente.beneficiario_id}_${Date.now()}.jpg`;
      const file = base64ToFile(pendiente.foto_base64, fileName);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evidencias')
        .upload(fileName, file, { contentType: 'image/jpeg' });

      if (uploadError) {
        console.error('Error subiendo foto offline:', uploadError.message);
        return false;
      }

      const { data: urlData } = supabase.storage
        .from('evidencias')
        .getPublicUrl(uploadData.path);
      fotoUrl = urlData.publicUrl;
    }

    const result = await rpc<{ success: boolean; error?: string }>('registrar_visita', {
      p_beneficiario_id: pendiente.beneficiario_id,
      p_nombre_completo: pendiente.nombre_completo,
      p_curp: pendiente.curp,
      p_telefono: pendiente.telefono,
      p_foto_url: fotoUrl,
      p_notas: pendiente.notas,
      p_fecha: pendiente.fecha_hora,
    });

    if (!result.success) {
      // Ya visitado / no asignado: no tiene caso reintentar, se descarta de la cola
      if (result.error?.includes('ya fue visitado') || result.error?.includes('No tienes asignado')) {
        eliminarPendienteSincronizado(pendiente.local_id);
        return true;
      }
      console.error('RPC no exitoso:', result.error);
      return false;
    }

    // Success — remove from queue
    eliminarPendienteSincronizado(pendiente.local_id);
    return true;
  } catch (err) {
    console.error('Error sincronizando visita offline:', err);
    return false;
  }
}

let syncing = false;

export async function sincronizarPendientes(): Promise<number> {
  if (syncing) return 0;
  if (!navigator.onLine) return 0;

  const pendientes = obtenerPendientesOffline();
  if (pendientes.length === 0) return 0;

  syncing = true;
  let sincronizadas = 0;
  try {
    for (const pendiente of pendientes) {
      const ok = await sincronizarUna(pendiente);
      if (ok) sincronizadas++;
      else break; // Stop on first failure (likely still offline)
    }
  } finally {
    syncing = false;
  }
  return sincronizadas;
}
