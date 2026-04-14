'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

interface ExcelImporterProps {
  onComplete?: () => void;
}

interface ImportProgress {
  step: string;
  current: number;
  total: number;
}

export default function ExcelImporter({ onComplete }: ExcelImporterProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<{
    beneficiarios: number;
    subPadrinos: number;
    asignaciones: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState('');

  const normalizeString = (s: string): string => {
    return s
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (rows.length === 0) {
        throw new Error('El archivo está vacío');
      }

      // Detect columns
      const firstRow = rows[0];
      const keys = Object.keys(firstRow);

      // Map columns - flexible detection
      const findCol = (patterns: string[]) =>
        keys.find((k) =>
          patterns.some((p) => k.toLowerCase().includes(p.toLowerCase()))
        );

      const colNombre = findCol(['Nombre Completo', 'nombre completo', 'NOMBRE']);
      const colCURP = findCol(['CURP', 'curp']);
      const colColonia = findCol(['Colonia', 'colonia']);
      const colCalle = findCol(['Calle', 'calle']);
      const colNoExt = findCol(['No. Ext', 'no ext', 'num ext', 'exterior']);
      const colNoInt = findCol(['No. Int', 'no int', 'num int', 'interior']);
      const colTel = findCol(['Teléfono', 'telefono', 'tel']);
      const colSubPadrino = findCol(['SUB PADRINO', 'sub padrino', 'subpadrino']);
      const colDelegacion = findCol(['Delegaciones', 'delegacion', 'Delegación']);

      if (!colNombre) {
        throw new Error('No se encontró la columna de nombre. Columnas disponibles: ' + keys.join(', '));
      }

      // ---- Step 1: Extract unique sub padrinos ----
      setProgress({ step: 'Extrayendo sub padrinos...', current: 0, total: rows.length });

      const subPadrinosMap = new Map<string, string>(); // normalized -> original name

      for (const row of rows) {
        const cell = row[colSubPadrino || ''];
        if (!cell) continue;

        const names = String(cell).split(',');
        for (const rawName of names) {
          const trimmed = rawName.trim();
          if (!trimmed) continue;
          const norm = normalizeString(trimmed);
          if (!subPadrinosMap.has(norm)) {
            // Keep the version with best casing
            subPadrinosMap.set(norm, trimmed.toUpperCase());
          }
        }
      }

      // Insert sub padrinos
      setProgress({ step: 'Creando sub padrinos...', current: 0, total: subPadrinosMap.size });

      const spInsertData = [...subPadrinosMap.values()].map((nombre) => ({
        nombre,
        pin: '1234',
        es_admin: false,
      }));

      // Upsert sub padrinos in batches
      const spIdMap = new Map<string, string>(); // normalized name -> id
      const batchSize = 50;
      const errors: string[] = [];

      for (let i = 0; i < spInsertData.length; i += batchSize) {
        const batch = spInsertData.slice(i, i + batchSize);
        for (const sp of batch) {
          const { data: existing } = await supabase
            .from('sub_padrinos')
            .select('id, nombre')
            .ilike('nombre', sp.nombre)
            .maybeSingle();

          if (existing) {
            spIdMap.set(normalizeString(sp.nombre), existing.id);
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from('sub_padrinos')
              .insert(sp)
              .select('id')
              .single();

            if (insertErr) {
              errors.push(`Sub padrino "${sp.nombre}": ${insertErr.message}`);
            } else if (inserted) {
              spIdMap.set(normalizeString(sp.nombre), inserted.id);
            }
          }
        }
        setProgress({ step: 'Creando sub padrinos...', current: Math.min(i + batchSize, spInsertData.length), total: spInsertData.length });
      }

      // ---- Step 2: Insert beneficiarios ----
      setProgress({ step: 'Creando beneficiarios...', current: 0, total: rows.length });

      const beneficiariosCreated: { id: string; rowIndex: number }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const nombre = String(row[colNombre || ''] || '').trim();
        if (!nombre) continue;

        // Build address
        const parts = [
          row[colCalle || ''],
          row[colNoExt || ''] ? `#${row[colNoExt || '']}` : null,
          row[colNoInt || ''] ? `Int. ${row[colNoInt || '']}` : null,
          row[colColonia || ''],
          row[colDelegacion || ''],
        ]
          .filter(Boolean)
          .map((p) => String(p).trim());

        const direccion = parts.join(', ') || null;
        const telefono = row[colTel || ''] ? String(row[colTel || '']).replace(/\D/g, '') : null;

        const { data: ben, error: benErr } = await supabase
          .from('beneficiarios')
          .insert({
            nombre,
            direccion,
            telefono: telefono && telefono.length >= 10 ? telefono : null,
          })
          .select('id')
          .single();

        if (benErr) {
          errors.push(`Beneficiario "${nombre}": ${benErr.message}`);
        } else if (ben) {
          beneficiariosCreated.push({ id: ben.id, rowIndex: i });
        }

        if (i % 20 === 0) {
          setProgress({ step: 'Creando beneficiarios...', current: i, total: rows.length });
        }
      }

      setProgress({ step: 'Creando beneficiarios...', current: rows.length, total: rows.length });

      // ---- Step 3: Create assignments ----
      setProgress({ step: 'Creando asignaciones...', current: 0, total: beneficiariosCreated.length });

      let asignacionCount = 0;

      for (let i = 0; i < beneficiariosCreated.length; i++) {
        const { id: benId, rowIndex } = beneficiariosCreated[i];
        const row = rows[rowIndex];
        const cell = row[colSubPadrino || ''];
        if (!cell) continue;

        const names = String(cell).split(',');
        for (const rawName of names) {
          const trimmed = rawName.trim();
          if (!trimmed) continue;
          const norm = normalizeString(trimmed);
          const spId = spIdMap.get(norm);

          if (spId) {
            const { error: asigErr } = await supabase
              .from('asignaciones')
              .insert({ sub_padrino_id: spId, beneficiario_id: benId });

            if (asigErr && !asigErr.message.includes('duplicate')) {
              errors.push(`Asignación ${trimmed} -> ben: ${asigErr.message}`);
            } else {
              asignacionCount++;
            }
          }
        }

        if (i % 20 === 0) {
          setProgress({ step: 'Creando asignaciones...', current: i, total: beneficiariosCreated.length });
        }
      }

      setResult({
        beneficiarios: beneficiariosCreated.length,
        subPadrinos: spIdMap.size,
        asignaciones: asignacionCount,
        errors,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-800 mb-2">Importar datos desde Excel</h3>
        <p className="text-sm text-gray-500 mb-4">
          Sube un archivo .xlsx con las columnas: Nombre Completo, Colonia, Calle, No. Ext,
          Teléfono beneficiario, SUB PADRINO (ASIGNACIÓN). Los sub padrinos múltiples
          separados por coma se normalizan automáticamente.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleImport}
          disabled={importing}
          className="hidden"
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="w-full bg-blue-700 text-white py-4 rounded-xl text-lg font-semibold hover:bg-blue-800 transition disabled:opacity-50"
        >
          {importing ? 'Importando...' : 'Seleccionar archivo Excel'}
        </button>

        {progress && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-1">{progress.step}</p>
            <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {progress.current} / {progress.total}
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 rounded-xl p-4 shadow-sm">
          <h4 className="font-bold text-green-800 mb-2">Importación completada</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>{result.subPadrinos} sub padrinos creados</li>
            <li>{result.beneficiarios} beneficiarios importados</li>
            <li>{result.asignaciones} asignaciones creadas</li>
          </ul>
          {result.errors.length > 0 && (
            <div className="mt-3 bg-yellow-50 rounded-lg p-3">
              <p className="text-sm font-medium text-yellow-800">
                {result.errors.length} advertencias:
              </p>
              <ul className="text-xs text-yellow-700 mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {onComplete && (
            <button
              onClick={onComplete}
              className="mt-4 w-full bg-green-600 text-white py-3 rounded-xl font-medium"
            >
              Ver visitas
            </button>
          )}
        </div>
      )}
    </div>
  );
}
