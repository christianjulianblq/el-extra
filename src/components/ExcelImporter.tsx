'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { rpc } from '@/lib/supabase';

interface Credencial { nombre: string; usuario: string; password: string }
interface Resultado { beneficiarios: number; subpadrinos: number; credenciales: Credencial[] }

const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const PH = ['', 'SN', 'S/N'];

export default function ExcelImporter({ onComplete }: { onComplete?: () => void }) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<Resultado | null>(null);
  const [error, setError] = useState('');
  const [departamento, setDepartamento] = useState('');

  const descargar = (cred: Credencial[]) => {
    const csv = ['Nombre,Usuario,Contraseña inicial', ...cred.map((c) => `"${c.nombre}",${c.usuario},${c.password}`)].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'credenciales_nuevas.csv';
    a.click();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows: Record<string, unknown>[] = [];
      for (const name of wb.SheetNames) rows.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name]));
      if (!rows.length) throw new Error('El archivo está vacío');

      const keys = Object.keys(rows[0]);
      const col = (...p: string[]) => keys.find((k) => p.some((x) => norm(k).toLowerCase().includes(x)));
      const cNombre = col('nombre');
      const cSP = col('sub padrino', 'subpadrino');
      if (!cNombre || !cSP) throw new Error('Faltan columnas "NOMBRE COMPLETO" y "Sub Padrino". Columnas: ' + keys.join(', '));
      const cTel = col('telefono'), cCol = col('colonia'), cCalle = col('calle');
      const cExt = col('no. ext', 'ext'), cInt = col('no. int', 'int'), cDel = col('delegacion');

      const payload = rows
        .filter((r) => r[cNombre] && r[cSP])
        .map((r) => {
          const calle = norm(r[cCalle!]), ext = norm(r[cExt!]), int = norm(r[cInt!]), colonia = norm(r[cCol!]);
          let dir = [calle, !PH.includes(ext.toUpperCase()) && !calle.includes(ext) ? ext : ''].filter(Boolean).join(' ');
          if (!PH.includes(int.toUpperCase())) dir += ` Int. ${int}`;
          if (colonia) dir += `, Col. ${colonia}`;
          return {
            nombre: norm(r[cNombre]).toUpperCase(),
            telefono: String(r[cTel!] ?? '').replace(/\D/g, '') || null,
            direccion: dir + ', Querétaro',
            delegacion: norm(r[cDel!]) || null,
            departamento: departamento.trim() || null,
            subpadrino: norm(r[cSP]).toUpperCase(),
          };
        });
      if (!payload.length) throw new Error('No se encontraron filas con nombre y sub padrino');

      setResult(await rpc<Resultado>('admin_importar', { p_rows: payload }));
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
      <p className="text-sm text-gray-600">
        Sube un Excel con las columnas <b>NOMBRE COMPLETO, TELÉFONO, Colonia, Calle, No. Ext., No. Int., Delegación, Sub Padrino</b>.
        Los beneficiarios ya existentes no se duplican; los sub padrinos nuevos reciben usuario y contraseña inicial.
      </p>
      <input value={departamento} onChange={(e) => setDepartamento(e.target.value)}
        placeholder="Departamento (opcional, ej. DIE)"
        className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-900" />
      <label className={`block text-center bg-blue-700 text-white py-3 rounded-xl font-medium cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
        {importing ? 'Importando...' : 'Elegir archivo .xlsx'}
        <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
      </label>
      {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {result && (
        <div className="bg-green-50 text-green-800 px-4 py-3 rounded-xl text-sm space-y-2">
          <p>{result.beneficiarios} beneficiarios nuevos · {result.subpadrinos} sub padrinos nuevos</p>
          {result.credenciales.length > 0 && (
            <>
              <button onClick={() => descargar(result.credenciales)} className="underline font-medium">
                Descargar credenciales (CSV) — solo se muestran ahora
              </button>
              <ul className="text-xs font-mono">
                {result.credenciales.map((c) => <li key={c.usuario}>{c.usuario} / {c.password}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
