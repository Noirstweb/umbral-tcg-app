import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import type { Tables } from '../lib/database.types'
import { formatoFecha } from '../lib/format'

type Alerta = Tables<'v_alertas'>

const TITULO_ALERTA: Record<string, string> = {
  pago_por_revisar: 'Pago por revisar',
  aviso_fallido: 'Aviso al cliente no enviado',
  stock_bajo: 'Stock bajo',
}

export default function Inicio() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [resumen, setResumen] = useState({ productos: 0, variantes: 0, sinStock: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [a, p, v, s] = await Promise.all([
        supabase.from('v_alertas').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('productos').select('id', { count: 'exact', head: true }),
        supabase.from('producto_variantes').select('id', { count: 'exact', head: true }),
        supabase.from('producto_variantes').select('id', { count: 'exact', head: true }).eq('stock', 0).eq('visible', true),
      ])
      const fallo = a.error ?? p.error ?? v.error ?? s.error
      if (fallo) return setError(mensajeError(fallo))
      setAlertas(a.data ?? [])
      setResumen({ productos: p.count ?? 0, variantes: v.count ?? 0, sinStock: s.count ?? 0 })
    })()
  }, [])

  return (
    <>
      <header className="cabecera"><h1>Inicio</h1></header>
      {error && <p className="error">{error}</p>}
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
                  <td>{a.numero ? `#${a.numero}` : '—'}</td>
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
          <Link className="btn primario" to="/admin/productos/nuevo">Nuevo producto</Link>
          <Link className="btn" to="/admin/importar">Cargar stock por Excel</Link>
        </div>
      </section>
    </>
  )
}
