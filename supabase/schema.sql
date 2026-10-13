-- ============================================================
-- SEDECO · El Extra — esquema v2 (seguro)
-- Ejecutar en Supabase > SQL Editor. BORRA las tablas anteriores.
-- Las tablas quedan bloqueadas (RLS sin políticas): la app solo
-- accede mediante las funciones RPC de abajo, que validan sesión.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

drop table if exists visitas, asignaciones, beneficiarios, sesiones, sub_padrinos cascade;
drop function if exists registrar_visita(uuid,uuid,text,text,text,text,text);

create table sub_padrinos (
  id uuid default gen_random_uuid() primary key,
  nombre text not null unique,
  usuario text not null unique,
  password_hash text not null,
  es_admin boolean not null default false,
  must_change boolean not null default true,
  departamento text,
  created_at timestamptz default now()
);
create table beneficiarios (
  id uuid default gen_random_uuid() primary key,
  nombre text not null unique,
  direccion text,
  telefono text,
  departamento text,
  delegacion text,
  latitud double precision,
  longitud double precision,
  visitado boolean not null default false,
  created_at timestamptz default now()
);
create table asignaciones (
  id uuid default gen_random_uuid() primary key,
  sub_padrino_id uuid not null references sub_padrinos(id) on delete cascade,
  beneficiario_id uuid not null references beneficiarios(id) on delete cascade,
  unique (sub_padrino_id, beneficiario_id)
);
create table visitas (
  id uuid default gen_random_uuid() primary key,
  beneficiario_id uuid not null unique references beneficiarios(id) on delete cascade,
  sub_padrino_id uuid not null references sub_padrinos(id) on delete cascade,
  nombre_completo text not null,
  curp text, telefono text, foto_url text, notas text,
  fecha_hora timestamptz default now(),
  created_at timestamptz default now()
);
create table sesiones (
  token uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references sub_padrinos(id) on delete cascade,
  expira timestamptz not null default now() + interval '30 days'
);
create index on asignaciones(sub_padrino_id);
create index on asignaciones(beneficiario_id);

alter table sub_padrinos enable row level security;
alter table beneficiarios enable row level security;
alter table asignaciones enable row level security;
alter table visitas enable row level security;
alter table sesiones enable row level security;

-- ---------- helpers internos (no expuestos) ----------
create or replace function _gen_pw() returns text language sql
set search_path = public, extensions as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', get_byte(gen_random_bytes(1),0) % 31 + 1, 1), '')
  from generate_series(1,8)
$$;

create or replace function _gen_usuario(p_nombre text) returns text language plpgsql
set search_path = public, extensions as $$
declare t text[]; b text; u text; i int := 2;
begin
  t := regexp_split_to_array(trim(regexp_replace(lower(translate(p_nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[^a-z ]','','g')),'\s+');
  t := array(select x from unnest(t) x where length(x) > 1);
  if cardinality(t) = 0 then b := 'usuario';
  elsif cardinality(t) = 1 then b := t[1];
  else b := t[1] || '.' || t[cardinality(t)]; end if;
  u := b;
  while exists (select 1 from sub_padrinos where usuario = u) loop u := b || i; i := i + 1; end loop;
  return u;
end $$;

create or replace function _perfil(u sub_padrinos) returns jsonb language sql as $$
  select jsonb_build_object('id',u.id,'nombre',u.nombre,'usuario',u.usuario,'es_admin',u.es_admin,'must_change',u.must_change)
$$;

create or replace function _auth(p_token uuid) returns sub_padrinos language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  select sp.* into u from sesiones s join sub_padrinos sp on sp.id = s.usuario_id
   where s.token = p_token and s.expira > now();
  if u.id is null then raise exception 'No autorizado'; end if;
  return u;
end $$;

create or replace function _importar(p_rows jsonb) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare r jsonb; v_sp uuid; v_b uuid; v_u text; v_pw text; v_nom text;
        creds jsonb := '[]'; nb int := 0; ns int := 0;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_nom := upper(trim(r->>'subpadrino'));
    select id into v_sp from sub_padrinos where upper(nombre) = v_nom;
    if v_sp is null then
      v_u  := coalesce(nullif(r->>'usuario',''), _gen_usuario(v_nom));
      v_pw := coalesce(nullif(r->>'password',''), _gen_pw());
      insert into sub_padrinos(nombre, usuario, password_hash, departamento)
        values (v_nom, v_u, crypt(v_pw, gen_salt('bf')), r->>'departamento') returning id into v_sp;
      creds := creds || jsonb_build_object('nombre', v_nom, 'usuario', v_u, 'password', v_pw);
      ns := ns + 1;
    end if;
    select id into v_b from beneficiarios where nombre = upper(trim(r->>'nombre'));
    if v_b is null then
      insert into beneficiarios(nombre, direccion, telefono, departamento, delegacion)
        values (upper(trim(r->>'nombre')), r->>'direccion', r->>'telefono', r->>'departamento', r->>'delegacion')
        returning id into v_b;
      nb := nb + 1;
    end if;
    insert into asignaciones(sub_padrino_id, beneficiario_id) values (v_sp, v_b) on conflict do nothing;
  end loop;
  return jsonb_build_object('beneficiarios', nb, 'subpadrinos', ns, 'credenciales', creds);
end $$;

revoke all on function _gen_pw(), _gen_usuario(text), _perfil(sub_padrinos), _auth(uuid), _importar(jsonb) from public, anon, authenticated;

-- ---------- API pública (RPC) ----------
create or replace function login(p_usuario text, p_password text) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos; t uuid;
begin
  select * into u from sub_padrinos where lower(usuario) = lower(trim(p_usuario));
  if u.id is null or u.password_hash <> crypt(p_password, u.password_hash) then
    return jsonb_build_object('error', 'Usuario o contraseña incorrectos');
  end if;
  delete from sesiones where expira < now();
  insert into sesiones(usuario_id) values (u.id) returning token into t;
  return jsonb_build_object('token', t, 'usuario', _perfil(u));
end $$;

create or replace function cambiar_password(p_token uuid, p_actual text, p_nueva text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  u := _auth(p_token);
  if u.password_hash <> crypt(p_actual, u.password_hash) then
    return jsonb_build_object('error', 'La contraseña actual es incorrecta');
  end if;
  if length(coalesce(p_nueva,'')) < 6 then
    return jsonb_build_object('error', 'La nueva contraseña debe tener al menos 6 caracteres');
  end if;
  if p_nueva = p_actual then
    return jsonb_build_object('error', 'La nueva contraseña debe ser distinta a la actual');
  end if;
  update sub_padrinos set password_hash = crypt(p_nueva, gen_salt('bf')), must_change = false
   where id = u.id returning * into u;
  return jsonb_build_object('ok', true, 'usuario', _perfil(u));
end $$;

create or replace function mis_beneficiarios(p_token uuid) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  u := _auth(p_token);
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.nombre) from (
    select b.id, b.nombre, b.direccion, b.telefono, b.latitud, b.longitud, b.visitado, b.departamento,
      (select string_agg(sp.nombre, ', ') from asignaciones a join sub_padrinos sp on sp.id = a.sub_padrino_id
        where a.beneficiario_id = b.id) as subpadrino
    from beneficiarios b
    where u.es_admin or exists (select 1 from asignaciones a where a.beneficiario_id = b.id and a.sub_padrino_id = u.id)
  ) x), '[]'::jsonb);
end $$;

create or replace function registrar_visita(
  p_token uuid, p_beneficiario_id uuid, p_nombre_completo text, p_curp text,
  p_telefono text, p_foto_url text, p_notas text default null, p_fecha timestamptz default now()
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u sub_padrinos; v_visitado boolean; v_id uuid;
begin
  u := _auth(p_token);
  if not u.es_admin and not exists (select 1 from asignaciones where sub_padrino_id = u.id and beneficiario_id = p_beneficiario_id) then
    return jsonb_build_object('success', false, 'error', 'No tienes asignado este beneficiario');
  end if;
  select visitado into v_visitado from beneficiarios where id = p_beneficiario_id for update;
  if v_visitado is null then return jsonb_build_object('success', false, 'error', 'Beneficiario no encontrado'); end if;
  if v_visitado then return jsonb_build_object('success', false, 'error', 'Este beneficiario ya fue visitado'); end if;
  insert into visitas(beneficiario_id, sub_padrino_id, nombre_completo, curp, telefono, foto_url, notas, fecha_hora)
    values (p_beneficiario_id, u.id, p_nombre_completo, p_curp, p_telefono, p_foto_url, p_notas, coalesce(p_fecha, now()))
    returning id into v_id;
  update beneficiarios set visitado = true where id = p_beneficiario_id;
  return jsonb_build_object('success', true, 'visita_id', v_id);
end $$;

create or replace function admin_visitas(p_token uuid) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  u := _auth(p_token);
  if not u.es_admin then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'nombre_completo', v.nombre_completo, 'curp', v.curp, 'telefono', v.telefono,
      'foto_url', v.foto_url, 'notas', v.notas, 'fecha_hora', v.fecha_hora,
      'direccion', b.direccion, 'subpadrino', sp.nombre) order by v.fecha_hora desc)
    from visitas v join beneficiarios b on b.id = v.beneficiario_id
    join sub_padrinos sp on sp.id = v.sub_padrino_id), '[]'::jsonb);
end $$;

create or replace function admin_usuarios(p_token uuid) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  u := _auth(p_token);
  if not u.es_admin then raise exception 'No autorizado'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'usuario', s.usuario,
      'departamento', s.departamento, 'must_change', s.must_change, 'es_admin', s.es_admin,
      'beneficiarios', (select count(*) from asignaciones a where a.sub_padrino_id = s.id)) order by s.nombre)
    from sub_padrinos s), '[]'::jsonb);
end $$;

create or replace function admin_reset_password(p_token uuid, p_usuario_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u sub_padrinos; pw text := _gen_pw();
begin
  u := _auth(p_token);
  if not u.es_admin then raise exception 'No autorizado'; end if;
  update sub_padrinos set password_hash = crypt(pw, gen_salt('bf')), must_change = true where id = p_usuario_id;
  delete from sesiones where usuario_id = p_usuario_id;
  return jsonb_build_object('password', pw);
end $$;

create or replace function admin_importar(p_token uuid, p_rows jsonb) returns jsonb language plpgsql security definer
set search_path = public, extensions as $$
declare u sub_padrinos;
begin
  u := _auth(p_token);
  if not u.es_admin then raise exception 'No autorizado'; end if;
  return _importar(p_rows);
end $$;

-- Bucket de fotos: crear "evidencias" (público) en Storage con política INSERT para anon.
