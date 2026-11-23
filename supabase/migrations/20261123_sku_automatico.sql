-- SKU automático: si una variante llega sin SKU (desde el panel o el Excel), la base lo genera.
-- Regla: [PRE|ACC]-[SET o juego]-[número de carta o abreviatura del nombre]-[idioma]-[estado]-[F|RH]
-- Ej: PKD1-001-EN-LP-F · PKD2-SOB-EXP-DEM-ES · ACC-FUN-NEG. Si ya existe se agrega -2, -3…

create or replace function privado.armar_sku(
  p_tipo text, p_nombre text, p_numero text, p_juego text, p_set text,
  p_idioma text, p_estado text, p_acabado text,
  p_reservados text[] default '{}', p_excluir uuid default null)
returns text language plpgsql volatile security definer set search_path to '' as $$
declare
  partes text[] := '{}'; w text; n int := 0; base text; cand text; k int := 1; idi text;
  stop text[] := array['DE','DEL','LA','LAS','EL','LOS','Y','THE','OF','A','AN','EN','CON','PARA','POR','AND','UN','UNA'];
begin
  if p_tipo = 'preventa' then partes := array_append(partes, 'PRE'); end if;
  if p_tipo = 'accesorio' and p_set is null then partes := array_append(partes, 'ACC'); end if;
  if p_set is not null then partes := array_append(partes, upper(p_set));
  elsif coalesce(p_tipo, '') <> 'accesorio' and p_juego is not null then partes := array_append(partes, upper(left(p_juego, 3)));
  end if;

  if p_tipo = 'single' and nullif(trim(p_numero), '') is not null then
    partes := array_append(partes, regexp_replace(upper(regexp_replace(split_part(p_numero, '/', 1), '^.*-', '')), '[^A-Z0-9]', '', 'g'));
  else
    foreach w in array regexp_split_to_array(
      upper(translate(coalesce(p_nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^A-Z0-9]+') loop
      continue when w = '' or w = any(stop);
      partes := array_append(partes, case when w ~ '^[0-9]+$' then w else left(w, 3) end);
      n := n + 1;
      exit when n = 3;
    end loop;
  end if;

  idi := case p_idioma
    when 'Español' then 'ES' when 'Inglés' then 'EN' when 'Japonés' then 'JP' when 'Portugués' then 'PT'
    when 'Chino' then 'CN' when 'Coreano' then 'KR' when 'Francés' then 'FR' when 'Alemán' then 'DE'
    when 'Italiano' then 'IT' when 'Sin idioma' then null
    else upper(left(translate(coalesce(p_idioma, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), 2)) end;
  partes := array_append(partes, idi);
  if p_tipo = 'single' then partes := array_append(partes, upper(p_estado)); end if;
  if p_acabado = 'foil' then partes := array_append(partes, 'F');
  elsif p_acabado = 'reverse_holo' then partes := array_append(partes, 'RH'); end if;

  base := upper(array_to_string(partes, '-'));            -- array_to_string ignora los NULL
  base := regexp_replace(base, '[^A-Z0-9_-]', '', 'g');
  base := regexp_replace(base, '-{2,}', '-', 'g');
  base := trim(both '-' from left(base, 40));
  if base is null or base = '' then base := 'VAR'; end if;

  cand := base;
  while cand = any(p_reservados)
     or exists (select 1 from public.producto_variantes v where v.sku = cand and v.id is distinct from p_excluir) loop
    k := k + 1;
    cand := base || '-' || k;
  end loop;
  return cand;
end $$;

create or replace function privado.asignar_sku()
returns trigger language plpgsql security definer set search_path to '' as $$
declare p record;
begin
  if new.sku is null or trim(new.sku) = '' then
    select pr.tipo::text as tipo, pr.nombre, pr.numero_carta, pr.juego_id, s.codigo
      into p from public.productos pr left join public.sets s on s.id = pr.set_id where pr.id = new.producto_id;
    new.sku := privado.armar_sku(p.tipo, p.nombre, p.numero_carta, p.juego_id, p.codigo,
                                 new.idioma, new.estado_carta::text, new.acabado, '{}', new.id);
  else
    new.sku := upper(trim(new.sku));
  end if;
  return new;
end $$;

revoke all on function privado.armar_sku(text,text,text,text,text,text,text,text,text[],uuid) from public, anon, authenticated;
revoke all on function privado.asignar_sku() from public, anon, authenticated;

-- "a_" para que corra antes que variantes_validar (los triggers BEFORE corren en orden alfabético)
drop trigger if exists variantes_a_sku on public.producto_variantes;
create trigger variantes_a_sku before insert or update of sku on public.producto_variantes
  for each row execute function privado.asignar_sku();

-- Importación: el SKU pasa a ser opcional.
--  * Con SKU: se busca por SKU (igual que antes).
--  * Sin SKU: se identifica la carta por nombre+set+número (o producto_slug) + idioma + estado + acabado.
--    Si existe se actualiza; si no, se crea con SKU generado.
--  * Si el producto ya existe, la fila hereda tipo, juego y set (basta nombre/set/número, idioma, estado, precio, stock).
--  * Si falta el juego se deduce del set; si falta el tipo y viene estado, es single.
create or replace function public.importar_variantes(p_archivo text, p_modo text, p_filas jsonb, p_simular boolean default true)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  f jsonb; i integer := 0; errs text[]; resultados jsonb := '[]'; v_errores jsonb := '[]';
  n_crear integer := 0; n_act integer := 0; n_err integer := 0; n_sin integer := 0;
  v_sku text; v_generado boolean; v_tipo text; v_juego text; v_set uuid; v_setcod text; v_nombre text;
  v_slug text; v_num text; v_rareza text; v_idioma text; v_estado text; v_acabado text; v_visible_txt text;
  v_precio integer; v_oferta integer; v_oferta_dada boolean; v_stock integer; v_min integer; v_visible boolean;
  ex record; pr record; existe boolean; prod_id uuid; prod_nuevo boolean; var_id uuid; carga uuid;
  skus_vistos text[] := '{}'; claves_vistas text[] := '{}'; v_clave text; nuevos jsonb := '{}'; accion text;
  v_nombre_mostrar text; v_juegos text[];
  n_precio integer; n_oferta integer; n_stock integer; n_min integer; n_visible boolean;
begin
  if not privado.es_staff() then raise exception 'Solo el equipo de la tienda puede importar'; end if;
  if p_modo not in ('crear','actualizar','ambos') then raise exception 'Modo inválido'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato de filas inválido'; end if;
  if jsonb_array_length(p_filas) = 0 then raise exception 'El archivo no tiene filas'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Máximo 5.000 filas por archivo'; end if;

  if not p_simular then
    insert into public.cargas_excel(autor_id, archivo, modo, filas_total)
      values (auth.uid(), left(coalesce(p_archivo, 'sin nombre'), 200), p_modo, jsonb_array_length(p_filas)) returning id into carga;
    perform set_config('app.origen_stock', 'excel', true);
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    i := i + 1; errs := '{}'; accion := null; existe := false; v_generado := false;
    prod_id := null; prod_nuevo := false; v_clave := null; v_slug := null; v_nombre_mostrar := null;

    v_sku := upper(nullif(trim(f->>'sku'), ''));
    v_tipo := lower(nullif(trim(f->>'tipo'), ''));
    v_juego := lower(nullif(trim(f->>'juego'), ''));
    v_setcod := upper(nullif(trim(f->>'set_codigo'), ''));
    v_nombre := nullif(trim(f->>'nombre'), '');
    v_num := nullif(trim(f->>'numero_carta'), '');
    v_rareza := nullif(trim(f->>'rareza'), '');
    v_idioma := coalesce(nullif(trim(f->>'idioma'), ''), 'Español');
    v_estado := upper(nullif(trim(f->>'estado'), ''));
    v_acabado := lower(coalesce(nullif(trim(f->>'acabado'), ''), 'normal'));
    v_visible_txt := lower(nullif(trim(f->>'visible'), ''));
    v_visible := case when v_visible_txt is null then null else v_visible_txt in ('si','sí','s','true','1','yes','x') end;
    v_precio := null; v_oferta := null; v_stock := null; v_min := null;
    v_oferta_dada := nullif(trim(f->>'precio_oferta'), '') is not null;
    begin v_precio := nullif(regexp_replace(f->>'precio', '[^0-9]', '', 'g'), '')::integer; exception when others then errs := array_append(errs, 'precio inválido'); end;
    begin v_oferta := nullif(regexp_replace(f->>'precio_oferta', '[^0-9]', '', 'g'), '')::integer; exception when others then errs := array_append(errs, 'precio oferta inválido'); end;
    if nullif(trim(f->>'stock'), '') is not null then
      if trim(f->>'stock') ~ '^-?[0-9]+$' then v_stock := trim(f->>'stock')::integer; else errs := array_append(errs, 'stock debe ser un número entero'); end if;
    end if;
    if nullif(trim(f->>'stock_minimo'), '') is not null then
      if trim(f->>'stock_minimo') ~ '^[0-9]+$' then v_min := trim(f->>'stock_minimo')::integer; else errs := array_append(errs, 'stock mínimo debe ser un número entero'); end if;
    end if;

    if v_sku is not null and v_sku !~ '^[A-Z0-9][A-Z0-9_-]*$' then
      errs := array_append(errs, 'SKU con caracteres inválidos (solo letras, números, - y _)');
    end if;
    if v_precio is not null and v_precio <= 0 then errs := array_append(errs, 'el precio debe ser mayor a 0'); end if;
    if v_stock is not null and v_stock < 0 then errs := array_append(errs, 'el stock no puede ser negativo'); end if;
    if v_acabado not in ('normal','foil','reverse_holo') then errs := array_append(errs, 'acabado debe ser normal, foil o reverse_holo'); end if;
    if v_estado is not null and v_estado not in ('NM','LP','MP','HP','DMG') then
      errs := array_append(errs, 'estado debe ser NM, LP, MP, HP o DMG'); v_estado := null;
    end if;

    -- 1) Buscar por SKU
    if v_sku is not null then
      select va.id, va.sku, va.producto_id, va.precio, va.precio_oferta, va.stock, va.stock_minimo, va.visible, p.nombre
        into ex from public.producto_variantes va join public.productos p on p.id = va.producto_id where va.sku = v_sku;
      existe := found;
    end if;

    -- 2) Si no está por SKU, identificar el producto (slug) y, sin SKU, la variante por idioma/estado/acabado
    if not existe then
      v_slug := lower(nullif(trim(f->>'producto_slug'), ''));
      if v_slug is null and v_nombre is not null then
        v_slug := concat_ws('-', v_nombre, v_setcod, v_num);
        v_slug := lower(regexp_replace(translate(v_slug, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]+', '-', 'g'));
        v_slug := trim(both '-' from v_slug);
      end if;

      if v_slug is null or v_slug = '' then
        v_slug := null;
        if v_sku is null then errs := array_append(errs, 'falta el SKU o el nombre: no sé qué producto es');
        elsif p_modo <> 'actualizar' then errs := array_append(errs, 'el SKU no existe y falta el nombre para crearlo');
        end if;
      else
        select p.id, p.tipo::text as tipo, p.juego_id, p.set_id, p.nombre, p.numero_carta, s.codigo as set_codigo
          into pr from public.productos p left join public.sets s on s.id = p.set_id where p.slug = v_slug;
        if found then
          prod_id := pr.id;
        elsif nuevos ? v_slug then
          -- producto que crea una fila anterior de este mismo archivo
          prod_nuevo := true;
          select (nuevos->v_slug->>'tipo') as tipo, (nuevos->v_slug->>'juego') as juego_id,
                 (nuevos->v_slug->>'set')::uuid as set_id, (nuevos->v_slug->>'nombre') as nombre,
                 (nuevos->v_slug->>'num') as numero_carta, (nuevos->v_slug->>'setcod') as set_codigo
            into pr;
        end if;

        if prod_id is not null or prod_nuevo then
          if v_tipo is not null and v_tipo <> pr.tipo then
            errs := array_append(errs, format('ese producto ya existe como %s, no como %s', pr.tipo, v_tipo));
          end if;
          v_tipo := pr.tipo; v_juego := pr.juego_id; v_set := pr.set_id; v_setcod := pr.set_codigo;
          v_nombre := pr.nombre; v_num := pr.numero_carta;
        end if;

        if prod_id is not null then
          select va.id, va.sku, va.producto_id, va.precio, va.precio_oferta, va.stock, va.stock_minimo, va.visible, pr.nombre as nombre
            into ex from public.producto_variantes va
           where va.producto_id = prod_id and va.idioma = v_idioma and va.acabado = v_acabado
             and va.estado_carta is not distinct from v_estado::public.estado_carta;
          if found then
            if v_sku is null then
              existe := true; v_sku := ex.sku;          -- encontrada sin SKU: se actualiza
            else
              errs := array_append(errs, format('esa carta con ese idioma, estado y acabado ya existe con SKU %s', ex.sku));
            end if;
          end if;
        end if;
        v_clave := v_slug || '|' || v_idioma || '|' || coalesce(v_estado, '') || '|' || v_acabado;
      end if;
    end if;

    if existe then
      if p_modo = 'crear' then errs := array_append(errs, format('ya existe (SKU %s); usa "crear y actualizar" o "solo actualizar"', ex.sku));
      else accion := 'actualizar'; end if;
      v_nombre_mostrar := ex.nombre;
    elsif p_modo = 'actualizar' then
      if v_sku is not null or v_slug is not null then errs := array_append(errs, 'no existe en la tienda; usa "crear y actualizar" o "solo crear"'); end if;
      v_nombre_mostrar := v_nombre;
    elsif v_slug is not null then
      accion := 'crear';
      if v_tipo is null and v_estado is not null then v_tipo := 'single'; end if;
      if v_tipo is null or v_tipo not in ('sellado','single','accesorio','preventa') then errs := array_append(errs, 'tipo debe ser sellado, single, accesorio o preventa'); end if;
      if v_precio is null then errs := array_append(errs, 'falta el precio'); end if;
      if v_stock is null and not ('stock debe ser un número entero' = any(errs)) then errs := array_append(errs, 'falta el stock'); end if;
      if prod_id is null and not prod_nuevo then
        if v_nombre is null then errs := array_append(errs, 'falta el nombre'); end if;
        if v_juego is null and v_setcod is not null then
          select array_agg(s.juego_id) into v_juegos from public.sets s where upper(s.codigo) = v_setcod;
          if cardinality(v_juegos) = 1 then v_juego := v_juegos[1]; end if;
        end if;
        if v_juego is null then errs := array_append(errs, 'falta el juego');
        else
          select j.id into v_juego from public.juegos j where j.id = v_juego or lower(j.nombre) = v_juego;
          if not found then errs := array_append(errs, format('el juego "%s" no existe', f->>'juego')); v_juego := null; end if;
        end if;
        v_set := null;
        if v_setcod is not null and v_juego is not null then
          select s.id into v_set from public.sets s where upper(s.codigo) = v_setcod and s.juego_id = v_juego;
          if not found then errs := array_append(errs, format('el set "%s" no existe para ese juego', v_setcod)); end if;
        end if;
      end if;
      if v_tipo = 'single' and v_estado is null and not ('estado debe ser NM, LP, MP, HP o DMG' = any(errs)) then errs := array_append(errs, 'los singles necesitan estado: NM, LP, MP, HP o DMG'); end if;
      if v_tipo is not null and v_tipo <> 'single' and v_estado is not null then errs := array_append(errs, 'solo los singles llevan estado'); end if;
      v_nombre_mostrar := v_nombre;
    end if;

    if v_clave is not null and v_clave = any(claves_vistas) then
      errs := array_append(errs, 'fila repetida en el archivo (misma carta, idioma, estado y acabado)');
    elsif v_sku is not null and v_sku = any(skus_vistos) then
      errs := array_append(errs, 'SKU repetido en el archivo');
    end if;

    -- SKU automático para las nuevas sin SKU (reserva los ya usados en el archivo)
    if accion = 'crear' and v_sku is null and cardinality(errs) = 0 then
      v_sku := privado.armar_sku(v_tipo, v_nombre, v_num, v_juego, v_setcod, v_idioma, v_estado, v_acabado, skus_vistos);
      v_generado := true;
    end if;
    if v_sku is not null then skus_vistos := array_append(skus_vistos, v_sku); end if;

    -- valores finales (al actualizar, vacío = conservar; oferta 0 = quitar oferta)
    if accion = 'actualizar' then
      n_precio := coalesce(v_precio, ex.precio);
      n_oferta := case when not v_oferta_dada then ex.precio_oferta when v_oferta = 0 then null else v_oferta end;
      n_stock := coalesce(v_stock, ex.stock);
      n_min := coalesce(v_min, ex.stock_minimo);
      n_visible := coalesce(v_visible, ex.visible);
    else
      n_precio := v_precio; n_oferta := nullif(v_oferta, 0); n_stock := v_stock; n_min := coalesce(v_min, 0); n_visible := coalesce(v_visible, true);
    end if;
    if n_oferta is not null and n_precio is not null and n_oferta >= n_precio then errs := array_append(errs, 'el precio oferta debe ser menor al precio'); end if;

    if cardinality(errs) > 0 then
      n_err := n_err + 1;
      v_errores := v_errores || jsonb_build_object('fila', i + 1, 'sku', v_sku, 'nombre', coalesce(v_nombre_mostrar, v_nombre), 'errores', to_jsonb(errs));
      resultados := resultados || jsonb_build_object('fila', i + 1, 'sku', v_sku, 'nombre', coalesce(v_nombre_mostrar, v_nombre), 'accion', 'error', 'errores', to_jsonb(errs));
      continue;
    end if;

    if v_clave is not null then claves_vistas := array_append(claves_vistas, v_clave); end if;
    if accion = 'crear' then
      if prod_id is null and not prod_nuevo then
        nuevos := nuevos || jsonb_build_object(v_slug, jsonb_build_object('tipo', v_tipo, 'juego', v_juego, 'set', v_set,
                    'setcod', v_setcod, 'nombre', v_nombre, 'num', v_num));
      end if;
    end if;

    if accion = 'actualizar' and ex.precio = n_precio and ex.precio_oferta is not distinct from n_oferta
       and ex.stock = n_stock and ex.stock_minimo = n_min and ex.visible = n_visible then
      n_sin := n_sin + 1;
      resultados := resultados || jsonb_build_object('fila', i + 1, 'sku', v_sku, 'nombre', v_nombre_mostrar, 'accion', 'sin_cambios');
      continue;
    end if;

    resultados := resultados || jsonb_build_object('fila', i + 1, 'sku', v_sku, 'nombre', v_nombre_mostrar, 'accion', accion,
      'sku_generado', v_generado, 'producto_nuevo', accion = 'crear' and prod_id is null and not prod_nuevo,
      'stock_antes', case when accion = 'actualizar' then ex.stock end, 'stock_nuevo', n_stock,
      'precio_antes', case when accion = 'actualizar' then ex.precio end, 'precio_nuevo', n_precio,
      'oferta_antes', case when accion = 'actualizar' then ex.precio_oferta end, 'oferta_nueva', n_oferta);
    if accion = 'crear' then n_crear := n_crear + 1; else n_act := n_act + 1; end if;

    if not p_simular then
      if accion = 'actualizar' then
        update public.producto_variantes
           set precio = n_precio, precio_oferta = n_oferta, stock = n_stock, stock_minimo = n_min, visible = n_visible
         where id = ex.id;
        if n_stock <> ex.stock then
          insert into public.movimientos_stock(variante_id, cambio, stock_resultante, motivo, carga_id, autor_id)
            values (ex.id, n_stock - ex.stock, n_stock, 'carga_excel', carga, auth.uid());
        end if;
      else
        if prod_id is null then
          select p.id into prod_id from public.productos p where p.slug = v_slug;
          if not found then
            insert into public.productos(slug, tipo, juego_id, set_id, nombre, numero_carta, rareza)
              values (v_slug, v_tipo::public.tipo_producto, v_juego, v_set, v_nombre, v_num, v_rareza)
              returning id into prod_id;
          end if;
        end if;
        insert into public.producto_variantes(producto_id, sku, idioma, estado_carta, acabado, precio, precio_oferta, stock, stock_minimo, visible)
          values (prod_id, v_sku, v_idioma, v_estado::public.estado_carta, v_acabado, n_precio, n_oferta, n_stock, n_min, n_visible)
          returning id into var_id;
        if n_stock > 0 then
          insert into public.movimientos_stock(variante_id, cambio, stock_resultante, motivo, carga_id, autor_id)
            values (var_id, n_stock, n_stock, 'carga_excel', carga, auth.uid());
        end if;
      end if;
    end if;
  end loop;

  if not p_simular then
    update public.cargas_excel set creados = n_crear, actualizados = n_act, con_error = n_err, errores = v_errores where id = carga;
    perform set_config('app.origen_stock', '', true);
  end if;

  return jsonb_build_object('simulado', p_simular, 'carga_id', carga, 'filas', i,
    'crear', n_crear, 'actualizar', n_act, 'sin_cambios', n_sin, 'errores', n_err, 'detalle', resultados);
end; $function$;
