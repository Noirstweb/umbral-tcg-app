-- Pulido etapa 3 (revisión de seguridad y casos borde)

-- 1) El panel solo puede cambiar las columnas de gestión del pedido (no contacto, montos, cliente ni token).
revoke insert, update on public.pedidos from anon, authenticated;
grant update (estado, transportista, numero_seguimiento, motivo_cancelacion, nota_interna, documento_numero, documento_emitido_en)
  on public.pedidos to authenticated;

-- 2) Pagos: desde el panel solo se marca un reembolso (monto, proveedor y referencia no se tocan).
revoke insert, update, delete on public.pagos from anon, authenticated;
grant update (estado, reembolsado_en) on public.pagos to authenticated;

create or replace function privado.validar_cambio_pago()
returns trigger language plpgsql set search_path to '' as $$
begin
  if auth.uid() is not null then  -- cambio hecho por una persona desde el panel
    if not (old.estado in ('requiere_reembolso', 'requiere_revision') and new.estado = 'reembolsado') then
      raise exception 'Desde el panel solo se puede marcar como reembolsado un pago pendiente de devolución';
    end if;
    new.reembolsado_en := now();
  end if;
  return new;
end $$;
revoke all on function privado.validar_cambio_pago() from public, anon, authenticated;
drop trigger if exists pagos_validar_cambio on public.pagos;
create trigger pagos_validar_cambio before update on public.pagos for each row execute function privado.validar_cambio_pago();

-- 3) Cancelar un pedido ya cobrado implica devolver dinero: solo el dueño.
do $$
declare d text; a text := $x$    if not ok then$x$;
begin
  d := pg_get_functiondef('privado.cambio_estado()'::regprocedure);
  if position(a in d) = 0 then raise exception 'no encontré el punto de parche'; end if;
  d := replace(d, a, $x$    if ok and new.estado = 'cancelado' and old.estado <> 'pendiente_pago'
       and auth.uid() is not null and not privado.es_dueno() then
      raise exception 'Solo el dueño puede cancelar un pedido que ya está pagado (hay que devolver el dinero)';
    end if;
$x$ || a);
  execute d;
end $$;

-- 4) Transferencia que llega tarde: si el pedido se canceló sin cobro (p. ej. expiró), el dueño lo reactiva al confirmarla.
create or replace function public.confirmar_transferencia(p_pedido uuid, p_monto integer, p_referencia text)
returns text language plpgsql security definer set search_path to '' as $function$
declare ped record; ref text := nullif(trim(p_referencia), '');
begin
  if not privado.es_dueno() then raise exception 'Solo el dueño puede confirmar transferencias'; end if;
  if ref is null or length(ref) < 3 then raise exception 'Escribe el número de operación o una referencia de la transferencia'; end if;
  select * into ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido no existe'; end if;
  if ped.estado not in ('pendiente_pago', 'cancelado') then
    raise exception 'El pedido #% ya está pagado (está %)', ped.numero, ped.estado;
  end if;
  if ped.estado = 'cancelado' and exists (select 1 from public.pagos where pedido_id = p_pedido and estado in ('aprobado', 'requiere_reembolso', 'reembolsado')) then
    raise exception 'El pedido #% ya tuvo un pago; no se puede reactivar con otra transferencia', ped.numero;
  end if;
  if p_monto is distinct from ped.total then
    raise exception 'El monto transferido ($%) no coincide con el total del pedido ($%)', p_monto, ped.total;
  end if;
  if exists (select 1 from public.pagos where proveedor = 'transferencia' and proveedor_pago_id = left(ref, 80)) then
    raise exception 'Esa referencia de transferencia ya está registrada en otro pago';
  end if;

  if ped.estado = 'pendiente_pago' then
    perform set_config('app.pago_confirmado', 'on', true);
  else
    perform set_config('app.reactivar_pedido', 'on', true);
  end if;
  begin
    update public.pedidos set estado = 'pagado' where id = p_pedido;
  exception when others then
    perform set_config('app.pago_confirmado', 'off', true);
    perform set_config('app.reactivar_pedido', 'off', true);
    if sqlerrm = 'SIN_STOCK_REACTIVAR' then
      raise exception 'Ya no hay stock para reactivar el pedido #%: devuelve la transferencia al cliente', ped.numero;
    end if;
    raise;
  end;
  perform set_config('app.pago_confirmado', 'off', true);
  perform set_config('app.reactivar_pedido', 'off', true);

  insert into public.pagos(pedido_id, proveedor, proveedor_pago_id, estado, monto, respuesta)
    values (p_pedido, 'transferencia', left(ref, 80), 'aprobado', p_monto,
            jsonb_build_object('confirmado_por', auth.uid(), 'confirmado_en', now(), 'reactivado', ped.estado = 'cancelado'));
  return 'aprobado';
end; $function$;
revoke all on function public.confirmar_transferencia(uuid, integer, text) from public, anon;
grant execute on function public.confirmar_transferencia(uuid, integer, text) to authenticated;

-- 5) Un cliente puede editar su ficha, pero no sus etiquetas internas ni a quién pertenece.
create or replace function privado.proteger_cliente()
returns trigger language plpgsql set search_path to '' as $$
begin
  if auth.uid() is not null and not privado.es_staff() then
    if new.etiquetas is distinct from old.etiquetas or new.user_id is distinct from old.user_id or new.email is distinct from old.email then
      raise exception 'No puedes modificar ese dato de tu ficha';
    end if;
  end if;
  return new;
end $$;
revoke all on function privado.proteger_cliente() from public, anon, authenticated;
drop trigger if exists clientes_proteger on public.clientes;
create trigger clientes_proteger before update on public.clientes for each row execute function privado.proteger_cliente();
