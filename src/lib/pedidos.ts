import type { Enums } from './database.types'

export type EstadoPedido = Enums<'estado_pedido'>
export type EstadoPago = Enums<'estado_pago'>

export const ESTADO_PEDIDO: Record<EstadoPedido, { texto: string; clase: string; ayuda: string }> = {
  pendiente_pago: { texto: 'Pendiente de pago', clase: 'e-pendiente', ayuda: 'El cliente aún no paga. Si no paga a tiempo se cancela solo y el stock vuelve.' },
  pagado: { texto: 'Pagado', clase: 'e-pagado', ayuda: 'Pago recibido. Hay que preparar el pedido.' },
  preparando: { texto: 'Preparando', clase: 'e-preparando', ayuda: 'Se está armando el paquete.' },
  listo_para_retiro: { texto: 'Listo para retiro', clase: 'e-listo', ayuda: 'Esperando que el cliente lo retire en tienda.' },
  enviado: { texto: 'Enviado', clase: 'e-enviado', ayuda: 'Va en camino con el transportista.' },
  entregado: { texto: 'Entregado', clase: 'e-entregado', ayuda: 'El cliente ya lo tiene.' },
  cancelado: { texto: 'Cancelado', clase: 'e-cancelado', ayuda: 'No se entrega. El stock ya volvió al inventario.' },
}

export const ESTADO_PAGO: Record<EstadoPago, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'e-pendiente' },
  aprobado: { texto: 'Aprobado', clase: 'e-entregado' },
  rechazado: { texto: 'Rechazado', clase: 'e-cancelado' },
  reembolsado: { texto: 'Reembolsado', clase: 'e-gris' },
  requiere_reembolso: { texto: 'Hay que reembolsar', clase: 'e-alerta' },
  requiere_revision: { texto: 'Revisar', clase: 'e-alerta' },
}

export const METODO_ENTREGA: Record<Enums<'metodo_entrega'>, string> = {
  retiro: 'Retiro en tienda',
  envio_santiago: 'Envío Santiago',
  envio_regiones: 'Envío a regiones',
}

export const PROVEEDOR_PAGO: Record<Enums<'proveedor_pago'>, string> = {
  mercadopago: 'Mercado Pago',
  webpay: 'Webpay',
  transferencia: 'Transferencia',
}

export const TRANSPORTISTAS = ['Starken', 'Chilexpress', 'Blue Express', 'Correos de Chile', 'Despacho propio']

export const MOTIVOS_CANCELACION = [
  'El cliente pidió cancelar',
  'Sin stock real del producto',
  'El cliente no retiró el pedido',
  'Pago no completado',
  'Dirección de envío inválida',
]

/** Pestañas del listado: qué estados agrupa cada una */
export const FILTROS: { clave: string; texto: string; estados: EstadoPedido[] | null }[] = [
  { clave: 'atender', texto: 'Por atender', estados: ['pagado', 'preparando', 'listo_para_retiro'] },
  { clave: 'pendientes', texto: 'Pendientes de pago', estados: ['pendiente_pago'] },
  { clave: 'enviados', texto: 'En camino', estados: ['enviado'] },
  { clave: 'entregados', texto: 'Entregados', estados: ['entregado'] },
  { clave: 'cancelados', texto: 'Cancelados', estados: ['cancelado'] },
  { clave: 'todos', texto: 'Todos', estados: null },
]

export const puedeCancelar = (e: EstadoPedido) => ['pendiente_pago', 'pagado', 'preparando', 'listo_para_retiro'].includes(e)

/** Texto para pegar en la etiqueta o en el sistema del transportista */
export function textoEtiqueta(p: {
  numero: number; envio_destinatario: string | null; envio_telefono: string | null; envio_calle: string | null
  envio_numero: string | null; envio_depto: string | null; envio_comuna: string | null; envio_region: string | null; envio_referencias: string | null
}) {
  return [
    `Pedido #${p.numero}`,
    `Destinatario: ${p.envio_destinatario ?? ''}`,
    `Teléfono: ${p.envio_telefono ?? ''}`,
    `Dirección: ${[p.envio_calle, p.envio_numero].filter(Boolean).join(' ')}${p.envio_depto ? `, ${p.envio_depto}` : ''}`,
    `Comuna: ${p.envio_comuna ?? ''}`,
    `Región: ${p.envio_region ?? ''}`,
    p.envio_referencias ? `Referencias: ${p.envio_referencias}` : '',
  ].filter(Boolean).join('\n')
}

/** wa.me necesita solo dígitos con código de país */
export function linkWhatsApp(telefono: string | null, texto?: string) {
  if (!telefono) return null
  let d = telefono.replace(/\D/g, '')
  if (d.length === 9 && d.startsWith('9')) d = `56${d}`
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
