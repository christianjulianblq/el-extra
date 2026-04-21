-- ============================================
-- SCHEMA: El Extra - Sistema de Control de Visitas
-- ============================================

-- 1. Tabla de sub padrinos (usuarios)
CREATE TABLE sub_padrinos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL DEFAULT 'SEDECO1',
  es_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de beneficiarios
CREATE TABLE beneficiarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  latitud DOUBLE PRECISION,
  longitud DOUBLE PRECISION,
  visitado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Relación muchos a muchos: sub_padrinos <-> beneficiarios
CREATE TABLE asignaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_padrino_id UUID NOT NULL REFERENCES sub_padrinos(id) ON DELETE CASCADE,
  beneficiario_id UUID NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sub_padrino_id, beneficiario_id)
);

-- 4. Tabla de visitas (registros de evidencia)
CREATE TABLE visitas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  beneficiario_id UUID NOT NULL REFERENCES beneficiarios(id) ON DELETE CASCADE,
  sub_padrino_id UUID NOT NULL REFERENCES sub_padrinos(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  curp TEXT,
  telefono TEXT,
  foto_url TEXT,
  fecha_hora TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Garantizar que solo haya UNA visita por beneficiario (control de duplicados)
  UNIQUE(beneficiario_id)
);

-- ============================================
-- ÍNDICES
-- ============================================
CREATE INDEX idx_asignaciones_sub_padrino ON asignaciones(sub_padrino_id);
CREATE INDEX idx_asignaciones_beneficiario ON asignaciones(beneficiario_id);
CREATE INDEX idx_visitas_beneficiario ON visitas(beneficiario_id);
CREATE INDEX idx_visitas_sub_padrino ON visitas(sub_padrino_id);
CREATE INDEX idx_beneficiarios_visitado ON beneficiarios(visitado);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE sub_padrinos ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;

-- Políticas públicas (usamos anon key con validación en app)
-- En producción, se recomienda usar Supabase Auth con JWT
CREATE POLICY "Acceso público lectura sub_padrinos"
  ON sub_padrinos FOR SELECT USING (true);

CREATE POLICY "Acceso público lectura beneficiarios"
  ON beneficiarios FOR SELECT USING (true);

CREATE POLICY "Acceso público lectura asignaciones"
  ON asignaciones FOR SELECT USING (true);

CREATE POLICY "Acceso público lectura visitas"
  ON visitas FOR SELECT USING (true);

CREATE POLICY "Insertar visitas"
  ON visitas FOR INSERT WITH CHECK (true);

CREATE POLICY "Actualizar beneficiarios"
  ON beneficiarios FOR UPDATE USING (true);

-- Políticas para admin (insertar/actualizar datos)
CREATE POLICY "Admin insertar sub_padrinos"
  ON sub_padrinos FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin insertar beneficiarios"
  ON beneficiarios FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin insertar asignaciones"
  ON asignaciones FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin eliminar beneficiarios"
  ON beneficiarios FOR DELETE USING (true);

CREATE POLICY "Admin eliminar asignaciones"
  ON asignaciones FOR DELETE USING (true);

CREATE POLICY "Admin eliminar visitas"
  ON visitas FOR DELETE USING (true);

-- ============================================
-- FUNCIÓN: Registrar visita con validación atómica
-- Previene duplicados a nivel de base de datos
-- ============================================
CREATE OR REPLACE FUNCTION registrar_visita(
  p_beneficiario_id UUID,
  p_sub_padrino_id UUID,
  p_nombre_completo TEXT,
  p_curp TEXT,
  p_telefono TEXT,
  p_foto_url TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_visitado BOOLEAN;
  v_visita visitas%ROWTYPE;
BEGIN
  -- Verificar si ya fue visitado (con bloqueo de fila)
  SELECT visitado INTO v_visitado
  FROM beneficiarios
  WHERE id = p_beneficiario_id
  FOR UPDATE;

  IF v_visitado = TRUE THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Este beneficiario ya fue visitado'
    );
  END IF;

  -- Insertar la visita
  INSERT INTO visitas (beneficiario_id, sub_padrino_id, nombre_completo, curp, telefono, foto_url)
  VALUES (p_beneficiario_id, p_sub_padrino_id, p_nombre_completo, p_curp, p_telefono, p_foto_url)
  RETURNING * INTO v_visita;

  -- Marcar como visitado
  UPDATE beneficiarios SET visitado = TRUE WHERE id = p_beneficiario_id;

  RETURN json_build_object(
    'success', true,
    'visita_id', v_visita.id
  );
END;
$$;

-- ============================================
-- STORAGE: Bucket para fotos de evidencia
-- Ejecutar en Supabase Dashboard > Storage
-- ============================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('evidencias', 'evidencias', true);

-- ============================================
-- REALTIME: Habilitar para las tablas necesarias
-- Ejecutar en Supabase Dashboard > Database > Replication
-- ============================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE beneficiarios;
-- ALTER PUBLICATION supabase_realtime ADD TABLE visitas;
