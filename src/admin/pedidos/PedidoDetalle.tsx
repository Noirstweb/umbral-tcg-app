import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, mensajeError } from '../../lib/supabase'
import { useAuth } from '../../auth/AuthProvider'
import { formatoCLP, formatoFecha, ACABADOS } from '../../lib/format'
import type { Tables, TablesUpdate } from '../../lib/database.types'
import {
  ESTADO_PEDIDO, ESTADO_PAGO, METODO_ENTREGA, PROVEEDOR_PAGO, TRANSPORTISTAS, MOTIVOS_CANCELACION,
  puedeCancelar, textoEtiqueta, linkWhatsApp, type EstadoPedido,
} from '../../lib/pedidos'

type Pedido = Tables<'pedidos'>
type Item = Tables<'pedido_items'>
type Pago = Tables<'pagos'>
type Evento = Tables<'pedido_eventos'>

export default function PedidoDetalle() {
  const { id } = useParams()
  const { esDueno, session } = useAuth()
  const [p, setP] = useState<Pedido | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [nombresStaff, setNombresStaff] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // formularios de acción
  const [transportista, setTransportista] = useState(TRANSPORTISTAS[0])
  const [otroTransportista, setOtroTransportista] = useState('')
  const [seguimiento, setSeguimiento] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELACION[0])
  const [motivoOtro, setMotivoOtro] = useState('')
  const [transf, setTransf] = useState<{ monto: string; ref: string } | null>(null)
  const [nota, setNota] = useState('')
  const [notaInterna, setNotaInterna] = useState('')
  const [docNumero, setDocNumero] = useState('')

  const cargar = useCallback(async () => {
    if (!id) return
    const [rp, ri, rg, re, rs] = await Promise.all([
      supabase.from('pedidos').select('*').eq('id', id).maybeSingle(),
      supabase.from('pedido_items').select('*').eq('pedido_id', id),
      supabase.from('pagos').select('*').eq('pedido_id', id).order('created_at'),
      supabase.from('pedido_eventos').select('*').eq('pedido_id', id).order('created_at'),
      supabase.from('staff').select('user_id, nombre'),
    ])
    setCargando(false)
    const err = rp.error ?? ri.error ?? rg.error ?? re.error
    if (err) return setError(mensajeError(err))
    if (!rp.data) return setError('No encontré ese pedido.')
    setP(rp.data); setItems(ri.data ?? []); setPagos(rg.data ?? []); setEventos(re.data ?? [])
    setNombresStaff(Object.fromEntries((rs.data ?? []).map((s) => [s.user_id, s.nombre])))
    setNotaInterna(rp.data.nota_interna ?? ''); setDocNumero(rp.data.documento_numero ?? '')
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  async function actualizar(cambios: TablesUpdate<'pedidos'>, mensaje: string) {
    if (!p) return
    setOcupado(true); setError(null); setOk(null)
    const { data, error } = await supabase.from('pedidos').update(cambios).eq('id', p.id).select('id')
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    if (!data?.length) return setError('No tienes permiso para modificar este pedido.')
    setOk(mensaje); setCancelando(false)
    await cargar()
  }

  const cambiarEstado = (estado: EstadoPedido, extra: TablesUpdate<'pedidos'> = {}, mensaje?: string) =>
    actualizar({ estado, ...extra }, mensaje ?? `Pedido marcado como «${ESTADO_PEDIDO[estado].texto}».`)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const t = transportista === 'Otro' ? otroTransportista.trim() : transportista
    if (!t) return setError('Escribe el nombre del transportista.')
    if (seguimiento.trim().length < 3) return setError('Escribe el número de seguimiento que te dio el transportista.')
    await cambiarEstado('enviado', { transportista: t, numero_seguimiento: seguimiento.trim() }, `Pedido enviado con ${t}. El cliente recibirá el número de seguimiento.`)
  }

  async function cancelar(e: FormEvent) {
    e.preventDefault()
    const m = motivo === 'Otro' ? motivoOtro.trim() : motivo
    if (m.length < 5) return setError('Escribe el motivo de la cancelación (queda en el historial).')
    const pagado = p && p.estado !== 'pendiente_pago'
    await cambiarEstado('cancelado', { motivo_cancelacion: m },
      pagado ? 'Pedido cancelado. El stock volvió al inventario y el pago quedó marcado «Hay que reembolsar».' : 'Pedido cancelado. El stock volvió al inventario.')
  }

  async function confirmarTransferencia(e: FormEvent) {
    e.preventDefault()
    if (!p || !transf) return
    const monto = Number(transf.monto.replace(/\D/g, ''))
    setOcupado(true); setError(null); setOk(null)
    const { error } = await supabase.rpc('confirmar_transferencia', { p_pedido: p.id, p_monto: monto, p_referencia: transf.ref })
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    setTransf(null); setOk('Transferencia confirmada. El pedido quedó pagado y listo para preparar.')
    await cargar()
  }

  async function marcarReembolsado(pago: Pago) {
    if (!window.confirm(`¿Ya devolviste ${formatoCLP(pago.monto)} al cliente? Esto deja el pago como «Reembolsado».`)) return
    setOcupado(true); setError(null); setOk(null)
    const { data, error } = await supabase.from('pagos').update({ estado: 'reembolsado', reembolsado_en: new Date().toISOString() }).eq('id', pago.id).select('id')
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    if (!data?.length) return setError('Solo el dueño puede marcar reembolsos.')
    setOk('Pago marcado como reembolsado.')
    await cargar()
  }

  async function agregarNota(e: FormEvent) {
    e.preventDefault()
    if (!p || !session) return
    const texto = nota.trim()
    if (texto.length < 2) return
    setOcupado(true); setError(null)
    const { error } = await supabase.from('pedido_eventos').insert({
      pedido_id: p.id, estado_anterior: p.estado, estado_nuevo: p.estado, nota: texto, autor_id: session.user.id, visible_cliente: false,
    })
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    setNota('')
    await cargar()
  }

  async function copiarEtiqueta() {
    if (!p) return
    try { await navigator.clipboard.writeText(textoEtiqueta(p)); setOk('Datos de despacho copiados. Pégalos en la etiqueta o en el sitio del transportista.') }
    catch { setError('No pude copiar al portapapeles en este navegador.') }
  }

  if (cargando) return <p className="muted">Cargando pedido…</p>
  if (!p) return <><p className="error">{error ?? 'No encontré ese pedido.'}</p><Link to="/admin/pedidos">← Volver a pedidos</Link></>

  const est = ESTADO_PEDIDO[p.estado]
  const esRetiro = p.metodo_entrega === 'retiro'
  const unidades = items.reduce((s, i) => s + i.cantidad, 0)
  const wa = linkWhatsApp(p.contacto_telefono, `Hola ${p.contacto_nombre.split(' ')[0]}, te escribimos de Umbral TCG por tu pedido #${p.numero}.`)
  const esPrueba = (p.nota_interna ?? '').startsWith('[PRUEBA]')

  return (
    <>
      <p><Link to="/admin/pedidos">← Pedidos</Link></p>
      <header className="cabecera">
        <div>
          <h1>Pedido #{p.numero} <span className={`pill grande ${est.clase}`}>{est.texto}</span></h1>
          <p className="muted">Creado el {formatoFecha(p.created_at)} · {unidades} {unidades === 1 ? 'unidad' : 'unidades'} · {formatoCLP(p.total)}</p>
        </div>
        <div className="fila-botones">
          {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer">WhatsApp al cliente</a>}
          {!esRetiro && <button className="btn" onClick={copiarEtiqueta}>Copiar datos de despacho</button>}
        </div>
      </header>

      {esPrueba && <p className="aviso-prueba">Pedido de prueba creado para revisar el panel. Se borra antes de abrir la tienda.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}

      {/* Próximo paso */}
      <section className="card accion">
        <h2>Próximo paso</h2>
        <p className="muted">{est.ayuda}</p>

        {p.estado === 'pendiente_pago' && (
          <>
            {p.expira_en && <p>Se cancela solo si no paga antes del <strong>{formatoFecha(p.expira_en)}</strong>.</p>}
            {esDueno && !transf && <button className="btn primario" onClick={() => setTransf({ monto: String(p.total), ref: '' })}>Confirmar transferencia recibida</button>}
            {esDueno && transf && (
              <form className="grilla" onSubmit={confirmarTransferencia}>
                <label>Monto recibido
                  <input inputMode="numeric" value={transf.monto} onChange={(e) => setTransf({ ...transf, monto: e.target.value })} />
                  <span className="ayuda">Debe ser exactamente {formatoCLP(p.total)}</span>
                </label>
                <label className="ancho-2">N° de operación o referencia
                  <input value={transf.ref} onChange={(e) => setTransf({ ...transf, ref: e.target.value })} placeholder="Ej: 004512398 (aparece en tu cartola)" autoFocus />
                </label>
                <div className="fila-botones">
                  <button className="btn primario" disabled={ocupado}>Confirmar pago</button>
                  <button type="button" className="btn" onClick={() => setTransf(null)}>Volver</button>
                </div>
              </form>
            )}
            {!esDueno && <p className="muted chico">Solo el dueño puede confirmar transferencias.</p>}
          </>
        )}

        {p.estado === 'pagado' && (
          <button className="btn primario" disabled={ocupado} onClick={() => cambiarEstado('preparando')}>Empezar a preparar</button>
        )}

        {p.estado === 'preparando' && esRetiro && (
          <button className="btn primario" disabled={ocupado} onClick={() => cambiarEstado('listo_para_retiro', {}, 'Listo para retiro. Se le avisará al cliente que puede pasar a buscarlo.')}>Marcar listo para retiro</button>
        )}

        {p.estado === 'preparando' && !esRetiro && (
          <form className="grilla" onSubmit={enviar}>
            <label>Transportista
              <select value={transportista} onChange={(e) => setTransportista(e.target.value)}>
                {TRANSPORTISTAS.map((t) => <option key={t}>{t}</option>)}
                <option>Otro</option>
              </select>
            </label>
            {transportista === 'Otro' && <label>¿Cuál?<input value={otroTransportista} onChange={(e) => setOtroTransportista(e.target.value)} /></label>}
            <label className="ancho-2">N° de seguimiento
              <input value={seguimiento} onChange={(e) => setSeguimiento(e.target.value)} placeholder="El que te dio el transportista" />
            </label>
            <div className="fila-botones"><button className="btn primario" disabled={ocupado}>Marcar como enviado</button></div>
          </form>
        )}

        {(p.estado === 'listo_para_retiro' || p.estado === 'enviado') && (
          <button className="btn primario" disabled={ocupado} onClick={() => cambiarEstado('entregado', {}, '¡Pedido entregado!')}>
            {p.estado === 'listo_para_retiro' ? 'El cliente lo retiró' : 'Marcar como entregado'}
          </button>
        )}

        {p.estado === 'entregado' && <p>Entregado el {formatoFecha(p.entregado_en)}.</p>}
        {p.estado === 'cancelado' && <p>Cancelado el {formatoFecha(p.cancelado_en)}. Motivo: <strong>{p.motivo_cancelacion}</strong></p>}

        {puedeCancelar(p.estado) && !cancelando && (
          <p className="separado"><button className="btn-link peligro" onClick={() => setCancelando(true)}>Cancelar este pedido…</button></p>
        )}
        {cancelando && (
          <form className="cancelar" onSubmit={cancelar}>
            <p><strong>Cancelar pedido #{p.numero}</strong>. El stock vuelve al inventario{p.estado !== 'pendiente_pago' ? ' y el pago queda marcado para reembolsar' : ''}. No se puede deshacer.</p>
            <div className="grilla">
              <label className="ancho-2">Motivo
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  {MOTIVOS_CANCELACION.map((m) => <option key={m}>{m}</option>)}
                  <option>Otro</option>
                </select>
              </label>
              {motivo === 'Otro' && <label className="ancho-2">Escribe el motivo<input value={motivoOtro} onChange={(e) => setMotivoOtro(e.target.value)} /></label>}
            </div>
            <div className="fila-botones" style={{ marginTop: '.75rem' }}>
              <button className="btn peligro" disabled={ocupado}>Sí, cancelar pedido</button>
              <button type="button" className="btn" onClick={() => setCancelando(false)}>No, volver</button>
            </div>
          </form>
        )}
      </section>

      <div className="detalle-grid">
        <div>
          <section className="card sin-padding">
            <h2 className="titulo-card">Productos</h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className="link-fuerte">{i.nombre}</span>
                        <div className="muted chico">
                          {[i.set_nombre, i.numero_carta, i.idioma, i.estado_carta, i.acabado && i.acabado !== 'normal' ? ACABADOS[i.acabado] : null].filter(Boolean).join(' · ')}
                        </div>
                        <div className="mono chico muted">{i.sku}{i.es_preventa && <span className="pill e-alerta" style={{ marginLeft: 6 }}>Preventa</span>}</div>
                      </td>
                      <td>{i.cantidad}</td>
                      <td>{formatoCLP(i.precio_unitario)}</td>
                      <td>{formatoCLP(i.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="totales">
              <dt>Subtotal</dt><dd>{formatoCLP(p.subtotal)}</dd>
              <dt>Envío</dt><dd>{p.costo_envio === 0 ? (esRetiro ? 'Retiro' : 'Gratis') : formatoCLP(p.costo_envio)}</dd>
              {p.descuento > 0 && <><dt>Descuento{p.cupon_codigo ? ` (${p.cupon_codigo})` : ''}</dt><dd>−{formatoCLP(p.descuento)}</dd></>}
              <dt className="total">Total</dt><dd className="total">{formatoCLP(p.total)}</dd>
            </dl>
          </section>

          <section className="card">
            <h2>Historial</h2>
            <ol className="historial">
              {eventos.map((e) => (
                <li key={e.id} className={e.estado_anterior === e.estado_nuevo ? 'nota' : ''}>
                  <div>
                    {e.estado_anterior === e.estado_nuevo
                      ? <strong>Nota interna</strong>
                      : <span className={`pill ${ESTADO_PEDIDO[e.estado_nuevo].clase}`}>{ESTADO_PEDIDO[e.estado_nuevo].texto}</span>}
                    <span className="muted chico"> · {formatoFecha(e.created_at)}{e.autor_id ? ` · ${nombresStaff[e.autor_id] ?? 'Equipo'}` : e.estado_anterior === null ? ' · Cliente' : ' · Sistema'}</span>
                  </div>
                  {e.nota && <p>{e.nota}</p>}
                </li>
              ))}
            </ol>
            <form className="fila-botones" onSubmit={agregarNota}>
              <input className="crece" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Agregar una nota interna (el cliente no la ve)…" maxLength={1000} />
              <button className="btn" disabled={ocupado || nota.trim().length < 2}>Agregar nota</button>
            </form>
          </section>
        </div>

        <div>
          <section className="card">
            <h2>Cliente</h2>
            <p className="link-fuerte">{p.contacto_nombre}</p>
            <p><a href={`mailto:${p.contacto_email}`}>{p.contacto_email}</a><br />{p.contacto_telefono}</p>
            {p.nota_cliente && <p className="nota-cliente"><strong>Nota del cliente:</strong> {p.nota_cliente}</p>}
          </section>

          <section className="card">
            <h2>{METODO_ENTREGA[p.metodo_entrega]}</h2>
            {esRetiro ? (
              <p>Retira: <strong>{p.retiro_nombre}</strong></p>
            ) : (
              <address>
                <strong>{p.envio_destinatario}</strong><br />
                {p.envio_calle} {p.envio_numero}{p.envio_depto ? `, ${p.envio_depto}` : ''}<br />
                {p.envio_comuna}, {p.envio_region}<br />
                Tel: {p.envio_telefono}
                {p.envio_referencias && <><br /><span className="muted">Ref.: {p.envio_referencias}</span></>}
              </address>
            )}
            {p.transportista && <p className="separado">{p.transportista} · <span className="mono">{p.numero_seguimiento}</span><br /><span className="muted chico">Enviado el {formatoFecha(p.enviado_en)}</span></p>}
          </section>

          <section className="card">
            <h2>Pagos</h2>
            {pagos.length === 0 && <p className="muted">Todavía no hay pagos registrados.</p>}
            {pagos.map((g) => (
              <div key={g.id} className="pago">
                <div className="fila-entre">
                  <strong>{PROVEEDOR_PAGO[g.proveedor]}</strong>
                  <span className={`pill ${ESTADO_PAGO[g.estado].clase}`}>{ESTADO_PAGO[g.estado].texto}</span>
                </div>
                <div className="muted chico">{formatoCLP(g.monto)} · {formatoFecha(g.created_at)} · ref. <span className="mono">{g.proveedor_pago_id}</span></div>
                {g.estado === 'requiere_reembolso' && (esDueno
                  ? <button className="btn chico-btn" disabled={ocupado} onClick={() => marcarReembolsado(g)}>Ya lo reembolsé</button>
                  : <p className="chico aviso">El dueño debe devolver este pago.</p>)}
                {g.estado === 'requiere_revision' && <p className="chico aviso">El monto no coincide o el pedido ya estaba pagado (posible doble cobro). Revísalo en {PROVEEDOR_PAGO[g.proveedor]}.</p>}
                {g.reembolsado_en && <p className="chico muted">Reembolsado el {formatoFecha(g.reembolsado_en)}</p>}
              </div>
            ))}
          </section>

          <section className="card">
            <h2>Documento: {p.tipo_documento === 'factura' ? 'Factura' : 'Boleta'}</h2>
            {p.tipo_documento === 'factura' && (
              <dl className="datos">
                <dt>RUT</dt><dd>{p.factura_rut}</dd>
                <dt>Razón social</dt><dd>{p.factura_razon_social}</dd>
                <dt>Giro</dt><dd>{p.factura_giro}</dd>
                <dt>Dirección</dt><dd>{p.factura_direccion}</dd>
              </dl>
            )}
            <form className="fila-botones" onSubmit={(e) => { e.preventDefault(); actualizar({ documento_numero: docNumero.trim() || null, documento_emitido_en: docNumero.trim() ? (p.documento_emitido_en ?? new Date().toISOString()) : null }, 'N° de documento guardado.') }}>
              <input className="crece" value={docNumero} onChange={(e) => setDocNumero(e.target.value)} placeholder={`N° de ${p.tipo_documento} emitida (SII)`} />
              <button className="btn" disabled={ocupado || docNumero === (p.documento_numero ?? '')}>Guardar</button>
            </form>
          </section>

          <section className="card">
            <h2>Nota interna del pedido</h2>
            <textarea rows={3} value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)} placeholder="Algo que el equipo deba saber de este pedido" />
            <div className="fila-botones" style={{ marginTop: '.5rem' }}>
              <button className="btn" disabled={ocupado || notaInterna === (p.nota_interna ?? '')} onClick={() => actualizar({ nota_interna: notaInterna.trim() || null }, 'Nota guardada.')}>Guardar nota</button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
