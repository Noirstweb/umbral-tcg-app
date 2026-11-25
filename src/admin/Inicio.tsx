import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { formatoCLP, formatoFecha } from '../lib/format'

type Alerta = Tables<'v_alertas'>

const TITULO_ALERTA: Record<string, string> = {
  pago_por_revisar: 'Pago por revisar',
  aviso_fallido: 'Aviso al cliente no enviado',
  stock_bajo: 'Stock bajo',
}

export default function Inicio() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [resumen, setResumen] = useState({ productos: 0, variantes: 0, sinStock: 0, porAtender: 0, pendientes: 0, ventas7: 0, pedidos7: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // Últimos 7 días contando hoy, en hora de Chile
      const desde = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })
      const [a, p, v, s, pa, pe, vd] = await Promise.all([
        supabase.from('v_alertas').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('productos').select('id', { count: 'exact', head: true }),
        supabase.from('producto_variantes').select('id', { count: 'exact', head: true }),
        supabase.from('producto_variantes').select('id', { count: 'exact', head: true }).eq('stock', 0).eq('visible', true),
        supabase.from('pedidos').select('id', { count: 'exact', head: true }).in('estado', ['pagado', 'preparando', 'listo_para_retiro']),
        supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente_pago'),
        supabase.from('v_ventas_diarias').select('*').gte('dia', desde),
      ])
      const fallo = a.error ?? p.error ?? v.error ?? s.error ?? pa.error ?? pe.error ?? vd.error
      if (fallo) return setError(mensajeError(fallo))
      setAlertas(a.data ?? [])
      setResumen({
        productos: p.count ?? 0, variantes: v.count ?? 0, sinStock: s.count ?? 0, porAtender: pa.count ?? 0, pendientes: pe.count ?? 0,
        ventas7: (vd.data ?? []).reduce((t, d) => t + (d.total ?? 0), 0), pedidos7: (vd.data ?? []).reduce((t, d) => t + (d.pedidos ?? 0), 0),
      })
    })()
  }, [])

  return (
    <>
      <header className="cabecera"><h1>Inicio</h1></header>
      {error && <p className="error">{error}</p>}
      <section className="tarjetas">
        <Link to="/admin/pedidos" className={`card kpi kpi-link ${resumen.porAtender ? 'kpi-destacado' : ''}`}><span className="muted">Pedidos por atender</span><strong>{resumen.porAtender}</strong></Link>
        <Link to="/admin/pedidos?f=pendientes" className="card kpi kpi-link"><span className="muted">Esperando pago</span><strong>{resumen.pendientes}</strong></Link>
        <div className="card kpi"><span className="muted">Ventas últimos 7 días</span><strong>{formatoCLP(resumen.ventas7)}</strong><span className="chico muted">{resumen.pedidos7} pedidos pagados</span></div>
      </section>
      <section className="tarjetas">
        <div className="card kpi"><span className="muted">Productos</span><strong>{resumen.productos}</strong></div>
        <div className="card kpi"><span className="muted">Variantes</span><strong>{resumen.variantes}</strong></div>
        <div className="card kpi"><span className="muted">Variantes visibles sin stock</span><strong>{resumen.sinStock}</strong></div>
      </section>

      <section className="card">
        <h2>Alertas</h2>
        {alertas.length === 0 ? (
          <p className="muted">Todo en orden: no hay pagos por revisar, avisos fallidos ni productos bajo el stock mínimo.</p>
        ) : (
          <table className="tabla">
            <thead><tr><th>Tipo</th><th>Detalle</th><th>Pedido</th><th>Fecha</th></tr></thead>
            <tbody>
              {alertas.map((a, i) => (
                <tr key={i} className={a.tipo === 'pago_por_revisar' ? 'fila-error' : ''}>
                  <td>{TITULO_ALERTA[a.tipo ?? ''] ?? a.tipo}</td>
                  <td>{a.detalle}</td>
                  <td>{a.numero && a.pedido_id ? <Link to={`/admin/pedidos/${a.pedido_id}`}>#{a.numero}</Link> : '—'}</td>
                  <td>{formatoFecha(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Atajos</h2>
        <div className="fila-botones">
          <Link className="btn primario" to="/admin/pedidos">Ver pedidos</Link>
          <Link className="btn" to="/admin/productos/nuevo">Nuevo producto</Link>
          <Link className="btn" to="/admin/importar">Cargar stock por Excel</Link>
        </div>
      </section>
    </>
  )
}
