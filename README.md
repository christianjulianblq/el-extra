# SEDECO · El Extra — Control de visitas

PWA (Next.js + Supabase) para registrar visitas a beneficiarios, con modo sin conexión.

## Puesta en marcha
1. Supabase > SQL Editor: ejecutar `supabase/schema.sql` (borra tablas anteriores) y después el SQL de datos.
2. Storage: bucket público `evidencias` con política INSERT para `anon`.
3. `.env.local` (y variables en Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. `npm install && npm run dev` (Node 20+).

## Seguridad
Las tablas tienen RLS sin políticas: la app solo accede por funciones RPC (`login`, `mis_beneficiarios`,
`registrar_visita`, `admin_*`) que validan un token de sesión. Contraseñas cifradas con bcrypt; en el primer
ingreso cada usuario debe cambiar la suya. El admin puede generar una nueva desde Panel Admin > Usuarios.
