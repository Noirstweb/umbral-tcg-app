-- Etapa 3 · Panel de pedidos
-- 1) Un pedido solo pasa a "pagado" con un pago registrado (pasarela o transferencia confirmada por el dueño),
--    nunca por un cambio manual de estado desde el panel.
-- 2) Transferencias: el dueño confirma una transferencia (monto exacto) y queda registrada como pago.
-- 3) Cancelar un pedido ya pagado deja el pago como "requiere_reembolso" (aparece en alertas).
-- 4) El historial guarda transportista y seguimiento al enviar, y avisa "listo para retiro".

create or replace function privado.cambio_estado()
returns trigger language plpgsql security definer set search_path to '' as $function$
declare ok boolean; it record; nuevo integer;
        reactivar boolean := coalesce(current_setting('app.reactivar_pedido', true), '') = 'on';
        pago_ok boolean := coalesce(current_setting('app.pago_confirmado', true), '') = 'on';
begin
  if new.subtotal <> old.subtotal or new.descuento <> old.descuento or new.costo_envio <> old.costo_envio or new.total <> old.total then
    raise exception 'Los montos de un pedido no se modifican'; end if;
  if old.estado is distinct from new.estado then
    ok := case old.estado
      when 'pendiente_pago' then (new.estado = 'pagado' and pago_ok) or new.estado = 'cancelado'
      when 'pagado' then new.estado in ('preparando','cancelado')
      when 'preparando' then new.estado in ('listo_para_retiro','enviado','cancelado')
      when 'listo_para_retiro' then new.estado in ('entregado','cancelado')
      when 'enviado' then new.estado = 'entregado'
      when 'cancelado' then (new.estado = 'pagado' and reactivar)
      else false end;
    if not ok then
      if old.estado = 'pendiente_pago' and new.estado = 'pagado' then
        raise exception 'Un pedido solo queda pagado cuando se registra el pago (pasarela o transferencia confirmada)';
      end if;
      raise exception 'No se puede pasar un pedido de % a %', old.estado, new.estado;
    end if;
    if new.estado = 'pagado' then new.pagado_en := coalesce(new.pagado_en, now()); end if;
    if new.estado = 'listo_para_retiro' then new.listo_retiro_en := coalesce(new.listo_retiro_en, now()); end if;
    if new.estado = 'enviado' then new.enviado_en := coalesce(new.enviado_en, now()); end if;
    if new.estado = 'entregado' then new.entregado_en := coalesce(new.entregado_en, now()); end if;
    if new.estado = 'cancelado' then new.cancelado_en := coalesce(new.cancelado_en, now()); end if;
    if old.estado = 'cancelado' then new.cancelado_en := null; new.motivo_cancelacion := null; end if;

    perform set_config('app.origen_stock', 'pedido', true);
    if new.estado = 'cancelado' then
      for it in select variante_id, cantidad from public.pedido_items where pedido_id = new.id and variante_id is not null loop
        update public.producto_variantes set stock = stock + it.cantidad where id = it.variante_id returning stock into nuevo;
        insert into public.movimientos_stock(variante_id, cambio, stock_resultante, motivo, pedido_id, autor_id)
          values (it.variante_id, it.cantidad, nuevo,
                  (case when old.estado = 'pendiente_pago' then 'liberacion' else 'cancelacion' end)::public.motivo_stock,
                  new.id, auth.uid());
      end loop;
      -- si ya se había cobrado, el dinero hay que devolverlo
      if old.estado <> 'pendiente_pago' then
        update public.pagos set estado = 'requiere_reembolso' where pedido_id = new.id and estado = 'aprobado';
      end if;
    elsif old.estado = 'cancelado' and new.estado = 'pagado' then
      for it in select variante_id, cantidad from public.pedido_items where pedido_id = new.id and variante_id is not null loop
        update public.producto_variantes set stock = stock - it.cantidad where id = it.variante_id and stock >= it.cantidad returning stock into nuevo;
        if not found then raise exception 'SIN_STOCK_REACTIVAR'; end if;
        insert into public.movimientos_stock(variante_id, cambio, stock_resultante, motivo, pedido_id)
          values (it.variante_id, -it.cantidad, nuevo, 'reactivacion', new.id);
      end loop;
    end if;
    perform set_config('app.origen_stock', '', true);
  end if;
  return new;
end; $function$;

-- registrar_pago marca el pago como confirmado antes de cambiar el estado
create or replace function public.registrar_pago(p_pedido uuid, p_proveedor public.proveedor_pago, p_pago_id text, p_aprobado boolean, p_monto integer, p_respuesta jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path to '' as $function$
declare ped record; existente record; res public.estado_pago;
begin
  select * into ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido no existe'; end if;
  select * into existente from public.pagos where proveedor = p_proveedor and proveedor_pago_id = p_pago_id;
  if found and existente.estado <> 'pendiente' then return 'ya_registrado:' || existente.estado; end if;

  if not p_aprobado then
    res := 'rechazado';
  elsif p_monto <> ped.total then
    res := 'requiere_revision';
  elsif ped.estado = 'pendiente_pago' then
    perform set_config('app.pago_confirmado', 'on', true);
    update public.pedidos set estado = 'pagado' where id = p_pedido;
    perform set_config('app.pago_confirmado', 'off', true);
    res := 'aprobado';
  elsif ped.estado = 'cancelado' then
    begin
      perform set_config('app.reactivar_pedido', 'on', true);
      update public.pedidos set estado = 'pagado' where id = p_pedido;
      perform set_config('app.reactivar_pedido', 'off', true);
      res := 'aprobado';
    exception when others then
      perform set_config('app.reactivar_pedido', 'off', true);
      res := 'requiere_reembolso';
      insert into public.notificaciones(pedido_id, tipo, destinatario) values (p_pedido, 'requiere_reembolso', ped.contacto_email);
    end;
  else
    res := 'requiere_revision'; -- el pedido ya estaba pagado: posible doble cobro
  end if;

  insert into public.pagos(pedido_id, proveedor, proveedor_pago_id, estado, monto, respuesta)
    values (p_pedido, p_proveedor, p_pago_id, res, p_monto, coalesce(p_respuesta, '{}'))
    on conflict (proveedor, proveedor_pago_id) do update set estado = excluded.estado, monto = excluded.monto, respuesta = excluded.respuesta;
  return res::text;
end; $function$;
revoke all on function public.registrar_pago(uuid, public.proveedor_pago, text, boolean, integer, jsonb) from public, anon, authenticated;

-- Transferencia bancaria confirmada a mano por el dueño (lo más común en tiendas chicas)
create or replace function public.confirmar_transferencia(p_pedido uuid, p_monto integer, p_referencia text)
returns text language plpgsql security definer set search_path to '' as $function$
declare ped record; ref text := nullif(trim(p_referencia), '');
begin
  if not privado.es_dueno() then raise exception 'Solo el dueño puede confirmar transferencias'; end if;
  if ref is null or length(ref) < 3 then raise exception 'Escribe el número de operación o una referencia de la transferencia'; end if;
  select * into ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if ped.estado <> 'pendiente_pago' then raise exception 'El pedido #% no está pendiente de pago (está %)', ped.numero, ped.estado; end if;
  if p_monto is distinct from ped.total then
    raise exception 'El monto transferido ($%) no coincide con el total del pedido ($%)', p_monto, ped.total;
  end if;
  if exists (select 1 from public.pagos where proveedor = 'transferencia' and proveedor_pago_id = ref) then
    raise exception 'Esa referencia de transferencia ya está registrada en otro pago';
  end if;
  insert into public.pagos(pedido_id, proveedor, proveedor_pago_id, estado, monto, respuesta)
    values (p_pedido, 'transferencia', left(ref, 80), 'aprobado', p_monto, jsonb_build_object('confirmado_por', auth.uid(), 'confirmado_en', now()));
  perform set_config('app.pago_confirmado', 'on', true);
  update public.pedidos set estado = 'pagado' where id = p_pedido;
  perform set_config('app.pago_confirmado', 'off', true);
  return 'aprobado';
end; $function$;
revoke all on function public.confirmar_transferencia(uuid, integer, text) from public, anon;
grant execute on function public.confirmar_transferencia(uuid, integer, text) to authenticated;

-- Historial más útil para el cliente y el equipo
create or replace function privado.registrar_evento()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.pedido_eventos(pedido_id, estado_anterior, estado_nuevo, nota, autor_id) values (new.id, null, new.estado, 'Pedido creado', auth.uid());
    insert into public.notificaciones(pedido_id, tipo, destinatario) values (new.id, 'pedido_creado', new.contacto_email);
  else
    insert into public.pedido_eventos(pedido_id, estado_anterior, estado_nuevo, nota, autor_id)
      values (new.id, old.estado, new.estado,
              case new.estado
                when 'cancelado' then new.motivo_cancelacion
                when 'enviado' then concat_ws(' · ', new.transportista, 'seguimiento ' || new.numero_seguimiento)
                when 'listo_para_retiro' then 'Listo para retiro en tienda'
                when 'pagado' then case when old.estado = 'cancelado' then 'Pago recibido después de la expiración: pedido reactivado' end
              end,
              auth.uid());
    insert into public.notificaciones(pedido_id, tipo, destinatario)
      values (new.id, case new.estado when 'pagado' then 'pago_aprobado' else new.estado::text end, new.contacto_email);
  end if;
  return null;
end; $function$;

-- Notas internas del equipo: solo sobre el estado actual y nunca visibles para el cliente salvo que se marque
drop policy if exists "staff agrega nota" on public.pedido_eventos;
create policy "staff agrega nota" on public.pedido_eventos for insert to authenticated
  with check (
    (select privado.es_staff())
    and autor_id = (select auth.uid())
    and estado_anterior is not distinct from estado_nuevo
    and exists (select 1 from public.pedidos p where p.id = pedido_id and p.estado = estado_nuevo)
    and length(trim(coalesce(nota, ''))) between 2 and 1000
  );
