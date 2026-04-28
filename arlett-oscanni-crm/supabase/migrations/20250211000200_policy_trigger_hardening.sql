-- -----------------------------------------------------------------------------
-- HARDENING DE POLÍTICAS Y TRIGGERS (idempotente)
-- Evita errores tipo "policy already exists" en entornos con estado parcial.
-- -----------------------------------------------------------------------------

alter table if exists public.profiles enable row level security;
alter table if exists public.clientes enable row level security;
alter table if exists public.facturas enable row level security;
alter table if exists public.factura_lineas enable row level security;
alter table if exists public.presupuestos enable row level security;
alter table if exists public.presupuesto_lineas enable row level security;
alter table if exists public.pagos enable row level security;

do $$
begin
  -- profiles
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'Admin puede todo en profiles'
  ) then
    execute 'create policy "Admin puede todo en profiles" on public.profiles for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'Agente ve su propio perfil'
  ) then
    execute 'create policy "Agente ve su propio perfil" on public.profiles for select using (auth.uid() = id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'Agente actualiza su propio perfil'
  ) then
    execute 'create policy "Agente actualiza su propio perfil" on public.profiles for update using (auth.uid() = id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'Usuario inserta su propio perfil'
  ) then
    execute 'create policy "Usuario inserta su propio perfil" on public.profiles for insert with check (auth.uid() = id)';
  end if;

  -- clientes
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clientes' and policyname = 'Admin puede todo en clientes'
  ) then
    execute 'create policy "Admin puede todo en clientes" on public.clientes for all using (exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clientes' and policyname = 'Agente CRUD sus clientes'
  ) then
    execute 'create policy "Agente CRUD sus clientes" on public.clientes for all using (auth.uid() = user_id)';
  end if;

  -- facturas
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'facturas' and policyname = 'Admin puede todo en facturas'
  ) then
    execute 'create policy "Admin puede todo en facturas" on public.facturas for all using (exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'facturas' and policyname = 'Agente CRUD sus facturas'
  ) then
    execute 'create policy "Agente CRUD sus facturas" on public.facturas for all using (auth.uid() = user_id)';
  end if;

  -- factura_lineas
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'factura_lineas' and policyname = 'Acceso factura_lineas según factura'
  ) then
    execute 'create policy "Acceso factura_lineas según factura" on public.factura_lineas for all using (exists (select 1 from public.facturas f where f.id = factura_lineas.factura_id and (f.user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))))';
  end if;

  -- presupuestos
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos' and policyname = 'Admin puede todo en presupuestos'
  ) then
    execute 'create policy "Admin puede todo en presupuestos" on public.presupuestos for all using (exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos' and policyname = 'Agente CRUD sus presupuestos'
  ) then
    execute 'create policy "Agente CRUD sus presupuestos" on public.presupuestos for all using (auth.uid() = user_id)';
  end if;

  -- presupuesto_lineas
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'presupuesto_lineas' and policyname = 'Acceso presupuesto_lineas según presupuesto'
  ) then
    execute 'create policy "Acceso presupuesto_lineas según presupuesto" on public.presupuesto_lineas for all using (exists (select 1 from public.presupuestos p where p.id = presupuesto_lineas.presupuesto_id and (p.user_id = auth.uid() or exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))))';
  end if;

  -- pagos
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pagos' and policyname = 'Admin puede todo en pagos'
  ) then
    execute 'create policy "Admin puede todo en pagos" on public.pagos for all using (exists (select 1 from public.profiles where id = auth.uid() and role = ''admin''))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pagos' and policyname = 'Agente CRUD pagos de sus facturas'
  ) then
    execute 'create policy "Agente CRUD pagos de sus facturas" on public.pagos for all using (auth.uid() = user_id)';
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'agente')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

