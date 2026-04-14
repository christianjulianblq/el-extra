import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as unknown as ReturnType<typeof createClient>);

// Tipos
export interface SubPadrino {
  id: string;
  nombre: string;
  pin: string;
  es_admin: boolean;
}

export interface Beneficiario {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  visitado: boolean;
}

export interface Asignacion {
  id: string;
  sub_padrino_id: string;
  beneficiario_id: string;
}

export interface Visita {
  id: string;
  beneficiario_id: string;
  sub_padrino_id: string;
  nombre_completo: string;
  curp: string | null;
  telefono: string | null;
  foto_url: string | null;
  fecha_hora: string;
}

export interface BeneficiarioConEstado extends Beneficiario {
  visita?: Visita | null;
}
