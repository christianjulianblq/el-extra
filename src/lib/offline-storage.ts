const STORAGE_KEY = 'visitas_pendientes';

export interface VisitaPendiente {
  local_id: string;
  beneficiario_id: string;
  sub_padrino_id: string;
  nombre_completo: string;
  curp: string | null;
  telefono: string | null;
  foto_base64: string | null;
  notas: string | null;
  fecha_hora: string;
}

function generarLocalId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function guardarPendienteOffline(
  data: Omit<VisitaPendiente, 'local_id' | 'fecha_hora'>
): VisitaPendiente {
  const pendiente: VisitaPendiente = {
    ...data,
    local_id: generarLocalId(),
    fecha_hora: new Date().toISOString(),
  };

  const pendientes = obtenerPendientesOffline();
  pendientes.push(pendiente);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendientes));
  } catch {
    // localStorage full — try removing oldest synced entries or warn
    console.error('No se pudo guardar en localStorage');
  }

  return pendiente;
}

export function obtenerPendientesOffline(): VisitaPendiente[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function eliminarPendienteSincronizado(local_id: string): void {
  const pendientes = obtenerPendientesOffline().filter(
    (p) => p.local_id !== local_id
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pendientes));
}

export function contarPendientes(): number {
  return obtenerPendientesOffline().length;
}
