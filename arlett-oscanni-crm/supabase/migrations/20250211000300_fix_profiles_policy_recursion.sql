-- -----------------------------------------------------------------------------
-- FIX: Infinite recursion en políticas de profiles
-- Usa función SECURITY DEFINER para comprobar rol admin sin disparar RLS.
-- -----------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Eliminar políticas que causan recursión
drop policy if exists "Admin puede todo en profiles" on public.profiles;
drop policy if exists "Admin puede todo en clientes" on public.clientes;
drop policy if exists "Admin puede todo en facturas" on public.facturas;
drop policy if exists "Acceso factura_lineas según factura" on public.factura_lineas;
drop policy if exists "Admin puede todo en presupuestos" on public.presupuestos;
drop policy if exists "Acceso presupuesto_lineas según presupuesto" on public.presupuesto_lineas;
drop policy if exists "Admin puede todo en pagos" on public.pagos;

-- Recrear políticas usando is_admin()
create policy "Admin puede todo en profiles"
  on public.profiles for all
  using (public.is_admin());

create policy "Admin puede todo en clientes"
  on public.clientes for all
  using (public.is_admin());

create policy "Admin puede todo en facturas"
  on public.facturas for all
  using (public.is_admin());

create policy "Acceso factura_lineas según factura"
  on public.factura_lineas for all
  using (
    exists (
      select 1 from public.facturas f
      where f.id = factura_lineas.factura_id
      and (f.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Admin puede todo en presupuestos"
  on public.presupuestos for all
  using (public.is_admin());

create policy "Acceso presupuesto_lineas según presupuesto"
  on public.presupuesto_lineas for all
  using (
    exists (
      select 1 from public.presupuestos p
      where p.id = presupuesto_lineas.presupuesto_id
      and (p.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Admin puede todo en pagos"
  on public.pagos for all
  using (public.is_admin());
