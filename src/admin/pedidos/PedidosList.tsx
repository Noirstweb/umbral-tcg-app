import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, mensajeError } from '../../lib/supabase'
import { formatoCLP, formatoFecha } from '../../lib/format'
import { ESTADO_PEDIDO, ESTADO_PAGO, FILTROS, METODO_ENTREGA, type EstadoPedido, type EstadoPago } from '../../lib/pedidos'
import type { Enums } from '../../lib/database.types'

const POR_PAGINA = 50

type Fila = {
  id: string; numero: number; created_at: string; estado: EstadoPedido; contacto_nombre: string; contacto_email: string
  metodo_entrega: Enums<'metodo_entrega'>; envio_comuna: string | null; total: number; tipo_documento: Enums<'tipo_documento'>
  expira_en: string | null
  pedido_items: { cantidad: number }[]
  pagos: { estado: EstadoPago }[]
}

export default function PedidosList() {
  const [params, setParams] = useSearchParams()
  const filtro = params.get('f') ?? 'atender'
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(0)
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState(0)
  const [conteos, setConteos] = useState<Record<string, number>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Conteo por pestaña (una consulta liviana por estado)
  useEffect(() => {
    let activo = true
    Promise.all(FILTROS.filter((f) => f.estados).map(async (f) => {
      const { count } = await supabase.from('pedidos').select('id', { count: 'exact', head: true }).in('estado', f.estados!)
      return [f.clave, count ?? 0] as const
    })).then((pares) => { if (activo) setConteos(Object.fromEntries(pares)) })
    return () => { activo = false }
  }, [filas])

  useEffect(() => { setPagina(0) }, [filtro, busqueda])

  useEffect(() => {
    let activo = true
    const t = setTimeout(async () => {
      setCargando(true); setError(null)
      let q = supabase
        .from('pedidos')
        .select('id, numero, created_at, estado, contacto_nombre, contacto_email, metodo_entrega, envio_comuna, total, tipo_documento, expira_en, pedido_items(cantidad), pagos(estado)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
      const estados = FILTROS.find((f) => f.clave === filtro)?.estados
      if (estados) q = q.in('estado', estados)
      const b = busqueda.trim().replace(/[,()]/g, ' ')
      if (b) {
        const num = b.replace(/^#/, '')
        q = /^\d+$/.test(num)
          ? q.eq('numero', Number(num))
          : q.or(`contacto_nombre.ilike.%${b}%,contacto_email.ilike.%${b}%,envio_comuna.ilike.%${b}%`)
      }
      const { data, count, error } = await q
      if (!activo) return
      setCargando(false)
      if (error) return setError(mensajeError(error))
      setFilas((data ?? []) as unknown as Fila[])
      setTotal(count ?? 0)
    }, 250)
    return () => { activo = false; clearTimeout(t) }
  }, [filtro, busqueda, pagina])

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Pedidos</h1>
          <p className="muted">Los pedidos «Por atender» ya están pagados y esperan que los prepares o entregues.</p>
        </div>
      </header>

      <nav className="pestanas" aria-label="Estado de los pedidos">
        {FILTROS.map((f) => (
          <button key={f.clave} className={`pestana ${filtro === f.clave ? 'activa' : ''}`} onClick={() => setParams(f.clave === 'atender' ? {} : { f: f.clave })}>
            {f.texto}{f.estados && conteos[f.clave] != null && <span className={`contador ${f.clave === 'atender' && conteos[f.clave] > 0 ? 'fuerte' : ''}`}>{conteos[f.clave]}</span>}
          </button>
        ))}
      </nav>

      <section className="card filtros filtros-pedidos">
        <input type="search" placeholder="Buscar por número (#1034), nombre, correo o comuna…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar pedidos" />
      </section>

      {error && <p className="error">{error}</p>}

      <section className="card sin-padding tabla-scroll">
        <table className="tabla tabla-pedidos">
          <thead>
            <tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Productos</th><th>Total</th><th>Pago</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={7} className="muted centro">Cargando…</td></tr>}
            {!cargando && filas.length === 0 && <tr><td colSpan={7} className="muted centro">No hay pedidos aquí.</td></tr>}
            {!cargando && filas.map((p) => {
              const unidades = p.pedido_items.reduce((s, i) => s + i.cantidad, 0)
              const pago = p.pagos.find((x) => x.estado === 'requiere_reembolso' || x.estado === 'requiere_revision') ?? p.pagos.find((x) => x.estado === 'aprobado') ?? p.pagos[0]
              return (
                <tr key={p.id}>
                  <td>
                    <Link to={`/admin/pedidos/${p.id}`} className="link-fuerte">#{p.numero}</Link>
                    <div className="muted chico">{formatoFecha(p.created_at)}</div>
                  </td>
                  <td>{p.contacto_nombre}<div className="muted chico">{p.contacto_email}</div></td>
                  <td>{METODO_ENTREGA[p.metodo_entrega]}<div className="muted chico">{p.envio_comuna ?? '—'}</div></td>
                  <td>{unidades} {unidades === 1 ? 'unidad' : 'unidades'}</td>
                  <td>{formatoCLP(p.total)}{p.tipo_documento === 'factura' && <div className="chico aviso">Factura</div>}</td>
                  <td>{pago ? <span className={`pill ${ESTADO_PAGO[pago.estado].clase}`}>{ESTADO_PAGO[pago.estado].texto}</span> : <span className="muted chico">Sin pago</span>}</td>
                  <td><span className={`pill ${ESTADO_PEDIDO[p.estado].clase}`}>{ESTADO_PEDIDO[p.estado].texto}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <nav className="paginacion" aria-label="Paginación">
        <button className="btn" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span className="muted">Página {pagina + 1} de {paginas} · {total} pedidos</span>
        <button className="btn" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </nav>
    </>
  )
}
