import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensajeError, urlFoto } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'
import { formatoCLP, ETIQUETA_TIPO } from '../../lib/format'

const POR_PAGINA = 50

type Fila = Tables<'productos'> & {
  juegos: { nombre: string } | null
  sets: { nombre: string; codigo: string | null } | null
  producto_variantes: Pick<Tables<'producto_variantes'>, 'id' | 'sku' | 'stock' | 'precio' | 'precio_oferta' | 'visible' | 'stock_minimo'>[]
  producto_imagenes: Pick<Tables<'producto_imagenes'>, 'storage_path' | 'es_principal' | 'variante_id' | 'orden'>[]
}

export default function ProductosList() {
  const [juegos, setJuegos] = useState<Tables<'juegos'>[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [juego, setJuego] = useState('')
  const [tipo, setTipo] = useState('')
  const [soloSinStock, setSoloSinStock] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('juegos').select('*').order('orden').then(({ data }) => setJuegos(data ?? []))
  }, [])

  useEffect(() => { setPagina(0) }, [busqueda, juego, tipo, soloSinStock])

  useEffect(() => {
    let activo = true
    const t = setTimeout(async () => {
      setCargando(true); setError(null)
      const q = busqueda.trim()

      // Búsqueda por nombre o por SKU de cualquier variante
      let idsPorSku: string[] | null = null
      if (q) {
        const { data, error } = await supabase.from('producto_variantes').select('producto_id').ilike('sku', `%${q}%`).limit(500)
        if (error) { if (activo) { setError(mensajeError(error)); setCargando(false) } return }
        idsPorSku = [...new Set((data ?? []).map((d) => d.producto_id))]
      }

      let consulta = supabase
        .from('productos')
        .select(
          '*, juegos(nombre), sets(nombre, codigo), producto_variantes(id, sku, stock, precio, precio_oferta, visible, stock_minimo), producto_imagenes(storage_path, es_principal, variante_id, orden)',
          { count: 'exact' },
        )
        .order('updated_at', { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)

      if (juego) consulta = consulta.eq('juego_id', juego)
      if (tipo) consulta = consulta.eq('tipo', tipo as Tables<'productos'>['tipo'])
      if (q) {
        const nombre = `nombre.ilike.%${q.replace(/[,()]/g, ' ')}%`
        consulta = idsPorSku && idsPorSku.length ? consulta.or(`${nombre},id.in.(${idsPorSku.join(',')})`) : consulta.or(nombre)
      }

      const { data, count, error } = await consulta
      if (!activo) return
      setCargando(false)
      if (error) return setError(mensajeError(error))
      setFilas((data ?? []) as unknown as Fila[])
      setTotal(count ?? 0)
    }, 250)
    return () => { activo = false; clearTimeout(t) }
  }, [busqueda, juego, tipo, pagina])

  const visibles = useMemo(
    () => (soloSinStock ? filas.filter((f) => f.producto_variantes.some((v) => v.visible && v.stock === 0)) : filas),
    [filas, soloSinStock],
  )

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <>
      <header className="cabecera">
        <h1>Productos</h1>
        <div className="fila-botones">
          <Link className="btn" to="/admin/importar">Carga por Excel</Link>
          <Link className="btn primario" to="/admin/productos/nuevo">Nuevo producto</Link>
        </div>
      </header>

      <section className="card filtros">
        <input type="search" placeholder="Buscar por nombre o SKU…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar" />
        <select value={juego} onChange={(e) => setJuego(e.target.value)} aria-label="Juego">
          <option value="">Todos los juegos</option>
          {juegos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(ETIQUETA_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={soloSinStock} onChange={(e) => setSoloSinStock(e.target.checked)} /> Con variantes agotadas</label>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="card sin-padding tabla-scroll">
        <table className="tabla">
          <thead>
            <tr><th></th><th>Producto</th><th>Juego / set</th><th>Tipo</th><th>Variantes</th><th>Stock</th><th>Precio</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={8} className="muted centro">Cargando…</td></tr>}
            {!cargando && visibles.length === 0 && <tr><td colSpan={8} className="muted centro">No hay productos con esos filtros.</td></tr>}
            {!cargando && visibles.map((p) => {
              const foto = [...p.producto_imagenes].sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || a.orden - b.orden)[0]
              const stock = p.producto_variantes.reduce((s, v) => s + v.stock, 0)
              const precios = p.producto_variantes.map((v) => v.precio_oferta ?? v.precio)
              const min = precios.length ? Math.min(...precios) : null
              const max = precios.length ? Math.max(...precios) : null
              const agotadas = p.producto_variantes.filter((v) => v.visible && v.stock === 0).length
              return (
                <tr key={p.id}>
                  <td className="col-foto">{foto ? <img src={urlFoto(foto.storage_path)} alt="" loading="lazy" /> : <span className="sin-foto">Sin foto</span>}</td>
                  <td>
                    <Link to={`/admin/productos/${p.id}`} className="link-fuerte">{p.nombre}</Link>
                    <div className="muted chico">{p.numero_carta ?? p.slug}</div>
                  </td>
                  <td>{p.juegos?.nombre}<div className="muted chico">{p.sets?.nombre ?? '—'}</div></td>
                  <td><span className={`etiqueta t-${p.tipo}`}>{ETIQUETA_TIPO[p.tipo]}</span></td>
                  <td>{p.producto_variantes.length}{agotadas > 0 && <div className="chico aviso">{agotadas} agotada{agotadas > 1 ? 's' : ''}</div>}</td>
                  <td>{stock}</td>
                  <td>{min == null ? '—' : min === max ? formatoCLP(min) : `${formatoCLP(min)} – ${formatoCLP(max)}`}</td>
                  <td>{p.visible ? <span className="pill ok">Visible</span> : <span className="pill">Oculto</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <nav className="paginacion" aria-label="Paginación">
        <button className="btn" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
        <span className="muted">Página {pagina + 1} de {paginas} · {total} productos</span>
        <button className="btn" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
      </nav>
    </>
  )
}
