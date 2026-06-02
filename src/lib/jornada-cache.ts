import { Beneficiario } from './supabase';

const CACHE_KEY = 'jornada_beneficiarios';
const META_KEY = 'jornada_meta';

export interface JornadaMeta {
  cantidad: number;
  fecha: string; // ISO string
  usuario_id: string;
}

export function guardarBeneficiariosCache(
  beneficiarios: Beneficiario[],
  usuarioId: string
): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(beneficiarios));
    const meta: JornadaMeta = {
      cantidad: beneficiarios.length,
      fecha: new Date().toISOString(),
      usuario_id: usuarioId,
    };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    console.error('No se pudo guardar jornada en cache');
  }
}

export function obtenerBeneficiariosCache(usuarioId: string): Beneficiario[] {
  try {
    const meta = obtenerJornadaMeta();
    // Only return cache if it belongs to the current user
    if (!meta || meta.usuario_id !== usuarioId) return [];
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function obtenerJornadaMeta(): JornadaMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function obtenerBeneficiarioPorId(
  id: string,
  usuarioId: string
): Beneficiario | null {
  const beneficiarios = obtenerBeneficiariosCache(usuarioId);
  return beneficiarios.find((b) => b.id === id) || null;
}

/**
 * Mark a beneficiario as visited in the local cache.
 * Called after a successful online save or offline save
 * so the home list reflects the change immediately.
 */
export function marcarVisitadoEnCache(beneficiarioId: string): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const beneficiarios: Beneficiario[] = JSON.parse(raw);
    const updated = beneficiarios.map((b) =>
      b.id === beneficiarioId ? { ...b, visitado: true } : b
    );
    localStorage.setItem(CACHE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function limpiarJornadaCache(): void {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(META_KEY);
}
