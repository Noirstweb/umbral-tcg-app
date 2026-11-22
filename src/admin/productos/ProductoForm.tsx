import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, mensajeError } from '../../lib/supabase'
import type { Tables, TablesInsert } from '../../lib/database.types'
import { slugify, sugerirSku, ETIQUETA_TIPO, ESTADOS_CARTA, ACABADOS, IDIOMAS, formatoFecha } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import Fotos from './Fotos'

type Producto = Tables<'productos'>
type Variante = Tables<'producto_variantes'>
type Tipo = Producto['tipo']

/** Variante en edición: los números se manejan como texto hasta guardar. */
type VarEdit = {
  key: string
  id?: string
  sku: string
  idioma: string
  estado_carta: string
  acabado: string
  precio: string
  precio_oferta: string
  stock: string
  stock_minimo: string
  limite_por_pedido: string
  visible: boolean
  original?: Variante
}

const nuevaVariante = (): VarEdit => ({
  key: crypto.randomUUID(), sku: '', idioma: 'Español', estado_carta: '', acabado: 'normal',
  precio: '', precio_oferta: '', stock: '0', stock_minimo: '0', limite_por_pedido: '', visible: true,
})

const aEdit = (v: Variante): VarEdit => ({
  key: v.id, id: v.id, sku: v.sku, idioma: v.idioma, estado_carta: v.estado_carta ?? '', acabado: v.acabado,
  precio: String(v.precio), precio_oferta: v.precio_oferta == null ? '' : String(v.precio_oferta),
  stock: String(v.stock), stock_minimo: String(v.stock_minimo),
  limite_por_pedido: v.limite_por_pedido == null ? '' : String(v.limite_por_pedido), visible: v.visible, original: v,
})

const entero = (s: string) => (s.trim() === '' ? null : /^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN)

export default function ProductoForm() {
  const { id } = useParams()
  const esNuevo = !id || id === 'nuevo'
  const navigate = useNavigate()
  const { esDueno } = useAuth()

  const [juegos, setJuegos] = useState<Tables<'juegos'>[]>([])
  const [sets, setSets] = useState<Tables<'sets'>[]>([])
  const [cargando, setCargando] = useState(!esNuevo)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [actualizado, setActualizado] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [tipo, setTipo] = useState<Tipo>('single')
  const [juegoId, setJuegoId] = useState('')
  const [setId, setSetId] = useState('')
  const [numero, setNumero] = useState('')
  const [rareza, setRareza] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaLanz, setFechaLanz] = useState('')
  const [visible, setVisible] = useState(true)
  const [destacado, setDestacado] = useState(false)
  const [variantes, setVariantes] = useState<VarEdit[]>([nuevaVariante()])
  const [eliminadas, setEliminadas] = useState<VarEdit[]>([])

  useEffect(() => {
    supabase.from('juegos').select('*').order('orden').then(({ data }) => {
      setJuegos(data ?? [])
      if (esNuevo && data?.length) setJuegoId((j) => j || data[0].id)
    })
  }, [esNuevo])

  useEffect(() => {
    if (!juegoId) return setSets([])
    supabase.from('sets').select('*').eq('juego_id', juegoId).order('fecha_lanzamiento', { ascending: false })
      .then(({ data }) => setSets(data ?? []))
  }, [juegoId])

  useEffect(() => {
    if (esNuevo) return
    ;(async () => {
      const { data, error } = await supabase.from('productos').select('*, producto_variantes(*)').eq('id', id!).maybeSingle()
      setCargando(false)
      if (error) return setError(mensajeError(error))
      if (!data) return setError('Este producto no existe o fue eliminado.')
      const p = data as Producto & { producto_variantes: Variante[] }
      setNombre(p.nombre); setSlug(p.slug); setSlugTocado(true); setTipo(p.tipo); setJuegoId(p.juego_id)
      setSetId(p.set_id ?? ''); setNumero(p.numero_carta ?? ''); setRareza(p.rareza ?? ''); setDescripcion(p.descripcion ?? '')
      setFechaLanz(p.fecha_lanzamiento ?? ''); setVisible(p.visible); setDestacado(p.destacado); setActualizado(p.updated_at)
      const vs = [...p.producto_variantes].sort((a, b) => a.sku.localeCompare(b.sku)).map(aEdit)
      setVariantes(vs.length ? vs : [nuevaVariante()])
    })()
  }, [id, esNuevo])

  // Slug automático mientras no lo editen a mano
  const setCodigo = sets.find((s) => s.id === setId)?.codigo ?? ''
  useEffect(() => {
    if (!slugTocado) setSlug(slugify([nombre, setCodigo, numero].filter(Boolean).join(' ')))
  }, [nombre, setCodigo, numero, slugTocado])

  const esSingle = tipo === 'single'

  function cambiarVar(key: string, campo: keyof VarEdit, valor: string | boolean) {
    setVariantes((vs) => vs.map((v) => (v.key === key ? { ...v, [campo]: valor } : v)))
  }

  function skuSugerido(v: VarEdit) {
    const idiomaCorto = { Español: 'ES', Inglés: 'EN', Japonés: 'JP', Portugués: 'PT', 'Sin idioma': '' }[v.idioma] ?? v.idioma.slice(0, 2)
    const base = esSingle ? [setCodigo, numero.split('/')[0]] : [setCodigo || nombre.split(' ').slice(0, 2).join(' ')]
    return sugerirSku([...base, idiomaCorto, esSingle ? v.estado_carta : '', v.acabado !== 'normal' ? (v.acabado === 'foil' ? 'F' : 'RH') : ''])
  }

  function quitarVar(v: VarEdit) {
    if (v.id && !esDueno) return setError('Solo el dueño puede eliminar variantes existentes. Puedes ocultarla desmarcando "Visible".')
    if (v.id && !window.confirm(`¿Eliminar la variante ${v.sku}? Si tiene ventas, mejor ocúltala.`)) return
    setVariantes((vs) => vs.filter((x) => x.key !== v.key))
    if (v.id) setEliminadas((es) => [...es, v])
  }

  const errores = useMemo(() => {
    const errs: string[] = []
    if (nombre.trim().length < 2) errs.push('El nombre es obligatorio.')
    if (!juegoId) errs.push('Elige el juego.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errs.push('El slug solo puede tener minúsculas, números y guiones.')
    if (variantes.length === 0) errs.push('Agrega al menos una variante.')
    const skus = new Set<string>()
    const combos = new Set<string>()
    variantes.forEach((v, i) => {
      const n = `Variante ${i + 1}`
      const sku = v.sku.trim().toUpperCase()
      if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(sku)) errs.push(`${n}: SKU vacío o con caracteres inválidos.`)
      if (skus.has(sku)) errs.push(`${n}: SKU repetido.`)
      skus.add(sku)
      const combo = `${v.idioma}|${esSingle ? v.estado_carta : ''}|${v.acabado}`
      if (combos.has(combo)) errs.push(`${n}: ya hay otra variante con el mismo idioma${esSingle ? ', estado' : ''} y acabado.`)
      combos.add(combo)
      const precio = entero(v.precio), oferta = entero(v.precio_oferta), stock = entero(v.stock), min = entero(v.stock_minimo), lim = entero(v.limite_por_pedido)
      if (precio == null || Number.isNaN(precio) || precio <= 0) errs.push(`${n}: precio inválido (número entero en pesos, mayor a 0).`)
      if (Number.isNaN(oferta)) errs.push(`${n}: precio oferta inválido.`)
      if (oferta != null && !Number.isNaN(oferta) && precio != null && oferta >= precio) errs.push(`${n}: el precio oferta debe ser menor al precio.`)
      if (stock == null || Number.isNaN(stock)) errs.push(`${n}: stock inválido.`)
      if (min == null || Number.isNaN(min)) errs.push(`${n}: stock mínimo inválido.`)
      if (Number.isNaN(lim) || lim === 0) errs.push(`${n}: el límite por pedido debe ser un número mayor a 0 o quedar vacío.`)
      if (esSingle && !v.estado_carta) errs.push(`${n}: los singles necesitan estado (NM, LP, MP, HP o DMG).`)
    })
    return errs
  }, [nombre, juegoId, slug, variantes, esSingle])

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null); setOk(null)
    if (errores.length) return setError(errores[0])
    setGuardando(true)
    try {
      const datos: TablesInsert<'productos'> = {
        nombre: nombre.trim(), slug, tipo, juego_id: juegoId, set_id: setId || null,
        numero_carta: numero.trim() || null, rareza: rareza.trim() || null, descripcion: descripcion.trim() || null,
        fecha_lanzamiento: fechaLanz || null, visible, destacado,
      }
      let productoId = id!
      if (esNuevo) {
        const { data, error } = await supabase.from('productos').insert(datos).select('id').single()
        if (error) throw error
        productoId = data.id
      } else {
        const { error } = await supabase.from('productos').update(datos).eq('id', productoId)
        if (error) throw error
      }

      // Eliminar primero, para liberar combinaciones idioma/estado/acabado que se reutilicen
      for (const v of eliminadas) {
        const { error } = await supabase.from('producto_variantes').delete().eq('id', v.id!)
        if (error) throw new Error(`No se pudo eliminar ${v.sku}: ${mensajeError(error)}`)
      }

      for (const v of variantes) {
        const fila = {
          sku: v.sku.trim().toUpperCase(), idioma: v.idioma, estado_carta: esSingle ? (v.estado_carta as Variante['estado_carta']) : null,
          acabado: v.acabado, precio: entero(v.precio)!, precio_oferta: entero(v.precio_oferta), stock: entero(v.stock)!,
          stock_minimo: entero(v.stock_minimo)!, limite_por_pedido: entero(v.limite_por_pedido), visible: v.visible,
        }
        if (v.id) {
          const o = v.original!
          const cambio = (Object.keys(fila) as (keyof typeof fila)[]).some((k) => fila[k] !== o[k])
          if (!cambio) continue
          const { error } = await supabase.from('producto_variantes').update(fila).eq('id', v.id)
          if (error) throw new Error(`${fila.sku}: ${mensajeError(error)}`)
        } else {
          const { error } = await supabase.from('producto_variantes').insert({ ...fila, producto_id: productoId })
          if (error) throw new Error(`${fila.sku}: ${mensajeError(error)}`)
        }
      }

      if (esNuevo) {
        navigate(`/admin/productos/${productoId}`, { replace: true, state: { creado: true } })
      } else {
        // Recargar desde la base para quedar sincronizados (ids nuevos, stock real)
        const { data } = await supabase.from('productos').select('updated_at, producto_variantes(*)').eq('id', productoId).single()
        if (data) {
          setVariantes((data.producto_variantes as Variante[]).sort((a, b) => a.sku.localeCompare(b.sku)).map(aEdit))
          setActualizado(data.updated_at)
        }
        setEliminadas([])
        setOk('Cambios guardados.')
      }
    } catch (err) {
      setError(mensajeError(err))
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarProducto() {
    if (!window.confirm(`¿Eliminar "${nombre}" con todas sus variantes y fotos? Esto no se puede deshacer. Si ya tuvo ventas, mejor ocúltalo.`)) return
    const { data: fotos } = await supabase.from('producto_imagenes').select('storage_path').eq('producto_id', id!)
    const { error } = await supabase.from('productos').delete().eq('id', id!)
    if (error) return setError(mensajeError(error))
    if (fotos?.length) await supabase.storage.from('productos').remove(fotos.map((f) => f.storage_path))
    navigate('/admin/productos', { replace: true })
  }

  if (cargando) return <p className="muted">Cargando…</p>

  return (
    <form onSubmit={guardar} noValidate>
      <header className="cabecera">
        <div>
          <Link to="/admin/productos" className="muted chico">← Productos</Link>
          <h1>{esNuevo ? 'Nuevo producto' : nombre || 'Producto'}</h1>
          {actualizado && <p className="muted chico">Última modificación: {formatoFecha(actualizado)}</p>}
        </div>
        <div className="fila-botones">
          {!esNuevo && esDueno && <button type="button" className="btn peligro" onClick={eliminarProducto}>Eliminar</button>}
          <button className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}</button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}

      <section className="card">
        <h2>Datos del producto</h2>
        <div className="grilla">
          <label className="ancho-2">Nombre *<input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Dragón Demo ex" /></label>
          <label>Tipo *
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)}>
              {Object.entries(ETIQUETA_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>Juego *
            <select value={juegoId} onChange={(e) => { setJuegoId(e.target.value); setSetId('') }}>
              {juegos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
            </select>
          </label>
          <label>Set / expansión
            <select value={setId} onChange={(e) => setSetId(e.target.value)}>
              <option value="">Sin set</option>
              {sets.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.codigo ? ` (${s.codigo})` : ''}</option>)}
            </select>
          </label>
          {esSingle && <label>Número de carta<input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="001/198" /></label>}
          {esSingle && <label>Rareza<input value={rareza} onChange={(e) => setRareza(e.target.value)} placeholder="Ultra Rara" /></label>}
          {tipo === 'preventa' && <label>Fecha de lanzamiento<input type="date" value={fechaLanz} onChange={(e) => setFechaLanz(e.target.value)} /></label>}
          <label className="ancho-2">URL (slug) *
            <input value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTocado(true) }} />
            <span className="ayuda">Así se verá en la tienda: /producto/{slug || '…'}</span>
          </label>
          <label className="ancho-total">Descripción<textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visible en la tienda</label>
          <label className="check"><input type="checkbox" checked={destacado} onChange={(e) => setDestacado(e.target.checked)} /> Destacado en el inicio</label>
        </div>
      </section>

      <section className="card">
        <div className="cabecera-seccion">
          <h2>Variantes</h2>
          <button type="button" className="btn" onClick={() => setVariantes((vs) => [...vs, nuevaVariante()])}>+ Agregar variante</button>
        </div>
        <p className="muted chico">
          Cada variante es una versión que se vende por separado, con su propio SKU, precio y stock
          {esSingle ? ' (por ejemplo, Español NM, Español LP e Inglés NM foil).' : ' (por ejemplo, la versión en español y en inglés).'}
          {' '}Los cambios de stock quedan registrados con tu usuario.
        </p>
        <div className="tabla-scroll">
          <table className="tabla variantes">
            <thead>
              <tr>
                <th>SKU *</th><th>Idioma</th>{esSingle && <th>Estado *</th>}<th>Acabado</th>
                <th>Precio *</th><th>Oferta</th><th>Stock *</th><th>Mín.</th><th>Máx./pedido</th><th>Visible</th><th></th>
              </tr>
            </thead>
            <tbody>
              {variantes.map((v) => (
                <tr key={v.key}>
                  <td>
                    <input className="in-sku" value={v.sku} onChange={(e) => cambiarVar(v.key, 'sku', e.target.value.toUpperCase())} aria-label="SKU" />
                    {!v.sku && <button type="button" className="btn-link chico" onClick={() => cambiarVar(v.key, 'sku', skuSugerido(v))}>Sugerir</button>}
                  </td>
                  <td>
                    <select value={v.idioma} onChange={(e) => cambiarVar(v.key, 'idioma', e.target.value)} aria-label="Idioma">
                      {[...new Set([...IDIOMAS, v.idioma])].map((i) => <option key={i}>{i}</option>)}
                    </select>
                  </td>
                  {esSingle && (
                    <td>
                      <select value={v.estado_carta} onChange={(e) => cambiarVar(v.key, 'estado_carta', e.target.value)} aria-label="Estado">
                        <option value="">—</option>
                        {ESTADOS_CARTA.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                  )}
                  <td>
                    <select value={v.acabado} onChange={(e) => cambiarVar(v.key, 'acabado', e.target.value)} aria-label="Acabado">
                      {Object.entries(ACABADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                  </td>
                  <td><input className="in-num" inputMode="numeric" value={v.precio} onChange={(e) => cambiarVar(v.key, 'precio', e.target.value.replace(/\D/g, ''))} aria-label="Precio" /></td>
                  <td><input className="in-num" inputMode="numeric" value={v.precio_oferta} onChange={(e) => cambiarVar(v.key, 'precio_oferta', e.target.value.replace(/\D/g, ''))} aria-label="Precio oferta" /></td>
                  <td>
                    <input className="in-num" inputMode="numeric" value={v.stock} onChange={(e) => cambiarVar(v.key, 'stock', e.target.value.replace(/\D/g, ''))} aria-label="Stock" />
                    {v.original && String(v.original.stock) !== v.stock && <div className="chico aviso">antes {v.original.stock}</div>}
                  </td>
                  <td><input className="in-num corto" inputMode="numeric" value={v.stock_minimo} onChange={(e) => cambiarVar(v.key, 'stock_minimo', e.target.value.replace(/\D/g, ''))} aria-label="Stock mínimo" /></td>
                  <td><input className="in-num corto" inputMode="numeric" value={v.limite_por_pedido} onChange={(e) => cambiarVar(v.key, 'limite_por_pedido', e.target.value.replace(/\D/g, ''))} aria-label="Máximo por pedido" placeholder="—" /></td>
                  <td className="centro"><input type="checkbox" checked={v.visible} onChange={(e) => cambiarVar(v.key, 'visible', e.target.checked)} aria-label="Visible" /></td>
                  <td><button type="button" className="btn-link peligro" onClick={() => quitarVar(v)} aria-label={`Quitar ${v.sku || 'variante'}`} title="Quitar variante">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {errores.length > 0 && (
          <ul className="lista-errores">{errores.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
        )}
      </section>

      {esNuevo ? (
        <section className="card"><h2>Fotos</h2><p className="muted">Crea el producto primero; después podrás subir sus fotos aquí mismo.</p></section>
      ) : (
        <Fotos productoId={id!} variantes={variantes.filter((v) => v.id).map((v) => ({ id: v.id!, sku: v.sku }))} />
      )}
    </form>
  )
}
