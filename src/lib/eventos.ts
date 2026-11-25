// Aviso simple entre pantallas: cuando cambia un pedido, el menú actualiza su contador.
const EVENTO = 'umbral:pedidos-cambiaron'

export const avisarCambioPedidos = () => window.dispatchEvent(new Event(EVENTO))

export function alCambiarPedidos(fn: () => void) {
  window.addEventListener(EVENTO, fn)
  return () => window.removeEventListener(EVENTO, fn)
}
