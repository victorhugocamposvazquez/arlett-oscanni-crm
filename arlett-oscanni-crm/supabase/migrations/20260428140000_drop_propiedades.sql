-- Retira el módulo de inmuebles (CRM orientado a centro de belleza).
-- Idempotente: en proyectos nuevos la tabla no existía; en bases antiguas se elimina.
drop table if exists public.propiedades cascade;
