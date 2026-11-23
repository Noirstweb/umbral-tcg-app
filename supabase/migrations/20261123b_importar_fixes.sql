-- Aplicado después de 20261123_sku_automatico.sql (parches sobre importar_variantes):
-- 1) Inicializa los records ex/pr en cada fila (PL/pgSQL evalúa todos los campos del IF y fallaba con filas sin SKU).
-- 2) Identifica el producto existente por nombre normalizado (+ set y número si vienen), no solo por slug,
--    para no duplicar productos cuyo slug se creó distinto (ej. "dragon-demo-ex-pkd1-001").
--    Si hay más de un producto con ese nombre, la fila da error pidiendo set_codigo, numero_carta o producto_slug.
-- 3) Set inexistente: mensaje claro con la lista de sets (antes decía "falta el juego").
-- 4) armar_sku: el número de carta sin prefijo de set (OPD1-015 -> 015) y sin repetir el nombre del juego
--    en la abreviatura (Pokemon Delta Reign -> POK-DEL-REI-EN, no POK-POK-…).
-- Las versiones vigentes completas se obtienen con pg_get_functiondef sobre
--   public.importar_variantes(text,text,jsonb,boolean) y privado.armar_sku(text,text,text,text,text,text,text,text,text[],uuid)

create or replace function privado.norm_texto(t text) returns text language sql immutable set search_path to '' as $$
  select trim(regexp_replace(lower(translate(coalesce(t, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9]+', ' ', 'g'))
$$;
create or replace function privado.norm_numero(t text) returns text language sql immutable set search_path to '' as $$
  select ltrim(regexp_replace(upper(regexp_replace(split_part(coalesce(t, ''), '/', 1), '^.*-', '')), '[^A-Z0-9]', '', 'g'), '0')
$$;

-- 5) Sets nuevos desde el Excel: columna set_nombre. Si set_codigo no existe y viene set_nombre + juego,
--    la importación crea el set (la vista previa lo marca con "Crea el set X").
-- 6) Formato de códigos (migración sets_juegos_formato):
create or replace function privado.normalizar_set() returns trigger language plpgsql set search_path to '' as $$
begin
  new.codigo := nullif(upper(trim(new.codigo)), '');
  new.nombre := trim(new.nombre);
  return new;
end $$;
drop trigger if exists sets_normalizar on public.sets;
create trigger sets_normalizar before insert or update on public.sets for each row execute function privado.normalizar_set();
alter table public.sets add constraint sets_codigo_formato check (codigo is null or codigo ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$');
alter table public.sets add constraint sets_nombre_largo check (length(nombre) between 2 and 120);
alter table public.juegos add constraint juegos_id_formato check (id ~ '^[a-z0-9]{2,30}$');
alter table public.juegos add constraint juegos_nombre_largo check (length(trim(nombre)) between 2 and 60);
