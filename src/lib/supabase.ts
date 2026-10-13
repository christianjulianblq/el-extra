import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as ReturnType<typeof createClient>);

export const SESSION_KEY = 'el_extra_sesion';

export interface Usuario {
  id: string;
  nombre: string;
  usuario: string;
  es_admin: boolean;
  must_change: boolean;
}

export interface Beneficiario {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  visitado: boolean;
  departamento?: string | null;
  subpadrino?: string | null;
}

export function getToken(): string | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.token ?? null;
  } catch {
    return null;
  }
}

/** Llama una función RPC pasando el token de sesión. Lanza Error con el mensaje de la BD. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, { p_token: getToken(), ...args });
  if (error) {
    if (error.message.includes('No autorizado') && typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = '/login';
    }
    throw new Error(error.message);
  }
  return data as T;
}
