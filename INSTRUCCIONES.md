# El Extra - Sistema de Control de Visitas

## Requisitos
- Node.js 18+
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) (gratis)

---

## 1. Configurar Supabase

### 1.1 Crear proyecto
1. Ve a https://supabase.com y crea un nuevo proyecto
2. Anota la **URL** y la **anon key** (Settings > API)

### 1.2 Ejecutar el esquema de base de datos
1. Ve a **SQL Editor** en tu proyecto de Supabase
2. Copia el contenido de `supabase/schema.sql`
3. Ejecuta el SQL

### 1.3 Crear el bucket de almacenamiento (fotos)
1. Ve a **Storage** en Supabase
2. Crea un nuevo bucket llamado `evidencias`
3. Marca la opción **Public bucket**
4. En Policies, agrega una política para permitir INSERT (upload) a todos:
   - Policy name: `Allow uploads`
   - Operation: `INSERT`
   - Target roles: `anon`
   - WITH CHECK: `true`

### 1.4 Habilitar Realtime
1. Ve a **Database > Replication**
2. Activa la replicación para las tablas:
   - `beneficiarios`
   - `visitas`

### 1.5 Crear usuario admin
En el **SQL Editor**, ejecuta:
```sql
INSERT INTO sub_padrinos (nombre, pin, es_admin)
VALUES ('ADMIN', '0000', true);
```
Cambia el nombre y pin por los que desees.

---

## 2. Configurar el proyecto local

### 2.1 Instalar dependencias
```bash
cd el-extra
npm install
```

### 2.2 Configurar variables de entorno
Copia el archivo de ejemplo y edítalo:
```bash
cp .env.local.example .env.local
```
Edita `.env.local` con tus datos de Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 2.3 Ejecutar en desarrollo
```bash
npm run dev
```
Abre http://localhost:3000

---

## 3. Importar datos del Excel

1. Inicia sesión como admin
2. Ve al **Panel Admin** (botón "Admin" en header)
3. Selecciona la pestaña **Importar Excel**
4. Sube el archivo `.xlsx`
5. El sistema automáticamente:
   - Extrae todos los sub padrinos únicos (separa los que están en la misma celda con coma)
   - Crea los beneficiarios con su dirección y teléfono
   - Crea las asignaciones (relación muchos a muchos)
   - Normaliza nombres (quita acentos, mayúsculas)
   - PIN por defecto para todos: `1234`

### Formato esperado del Excel
El sistema detecta automáticamente las columnas. Las principales son:
| Columna | Descripción |
|---------|-------------|
| Nombre Completo | Nombre del beneficiario |
| Colonia | Parte de la dirección |
| Calle | Parte de la dirección |
| No. Ext. | Número exterior |
| No. Int. | Número interior |
| Teléfono beneficiario | Teléfono de contacto |
| SUB PADRINO (ASIGNACIÓN) | Nombres separados por coma |

---

## 4. Desplegar en Vercel

### 4.1 Subir a GitHub
```bash
git init
git add .
git commit -m "Initial commit - El Extra"
git remote add origin https://github.com/tu-usuario/el-extra.git
git push -u origin main
```

### 4.2 Conectar con Vercel
1. Ve a https://vercel.com
2. Importa el repositorio desde GitHub
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

---

## 5. Uso del sistema

### Para Sub Padrinos
1. Abrir la app en el celular
2. Ingresar nombre y PIN (default: 1234)
3. Ver lista de beneficiarios asignados
4. Tocar un beneficiario pendiente para:
   - Llamar (botón verde)
   - Ver en Google Maps (botón azul)
   - Registrar visita (formulario con foto)
5. Al registrar, el beneficiario se marca como VISITADO en tiempo real

### Para Administradores
1. Ingresar con credenciales de admin
2. Botón "Admin" en el header
3. Ver estadísticas: total, visitados, pendientes
4. Filtrar visitas por sub padrino
5. Ver fotos de evidencia
6. Importar nuevos datos desde Excel

### Instalar como PWA
En el celular:
1. Abrir la app en Chrome
2. Menú > "Añadir a pantalla de inicio"
3. La app se instala como si fuera nativa

---

## Estructura de archivos

```
el-extra/
├── public/
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service worker
│   ├── offline.html       # Página offline
│   ├── icon-192.png       # Ícono PWA
│   └── icon-512.png       # Ícono PWA grande
├── src/
│   ├── app/
│   │   ├── layout.tsx     # Layout raíz
│   │   ├── page.tsx       # Página principal (lista)
│   │   ├── globals.css    # Estilos globales
│   │   ├── login/
│   │   │   └── page.tsx   # Login
│   │   ├── visita/
│   │   │   └── [id]/
│   │   │       └── page.tsx  # Formulario de visita
│   │   └── admin/
│   │       └── page.tsx   # Panel admin
│   ├── components/
│   │   ├── MapView.tsx         # Mapa con Leaflet
│   │   ├── ExcelImporter.tsx   # Importador de Excel
│   │   └── ServiceWorkerRegistrar.tsx
│   └── lib/
│       ├── supabase.ts    # Cliente Supabase + tipos
│       └── auth-context.tsx # Contexto de autenticación
├── supabase/
│   └── schema.sql         # Esquema completo de BD
├── .env.local.example     # Variables de entorno
└── INSTRUCCIONES.md       # Este archivo
```
