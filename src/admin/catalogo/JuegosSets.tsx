import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, mensajeError } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'
import { useAuth } from '../../auth/AuthProvider'

type Juego = Tables<'juegos'>
type SetFila = Tables<'sets'> & { productos: { count: number }[] }
type SetEdit = { id?: string; juego_id: string; nombre: string; codigo: string; fecha_lanzamiento: string }

const vacio = (juego = ''): SetEdit => ({ juego_id: juego, nombre: '', codigo: '', fecha_lanzamiento: '' })
const fecha = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const codigoJuego = (nombre: string) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)

export default function JuegosSets() {
  const { esDueno } = useAuth()
  const [juegos, setJuegos] = useState<Juego[]>([])
  const [sets, setSets] = useState<SetFila[]>([])
  const [filtroJuego, setFiltroJuego] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState<SetEdit | null>(null)
  const [nuevoJuego, setNuevoJuego] = useState<{ nombre: string; id: string; tocado: boolean } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [j, s] = await Promise.all([
      supabase.from('juegos').select('*').order('orden').order('nombre'),
      supabase.from('sets').select('*, productos(count)').order('fecha_lanzamiento', { ascending: false, nullsFirst: false }).order('nombre'),
    ])
    if (j.error || s.error) return setError(mensajeError(j.error ?? s.error))
    setJuegos(j.data ?? [])
    setSets((s.data ?? []) as unknown as SetFila[])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const nombreJuego = (id: string) => juegos.find((j) => j.id === id)?.nombre ?? id
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return sets.filter((s) => (!filtroJuego || s.juego_id === filtroJuego)
      && (!q || s.nombre.toLowerCase().includes(q) || (s.codigo ?? '').toLowerCase().includes(q)))
  }, [sets, filtroJuego, busqueda])
  const setsPorJuego = (id: string) => sets.filter((s) => s.juego_id === id).length

  async function guardarSet(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null); setOk(null)
    const datos = {
      juego_id: form.juego_id, nombre: form.nombre.trim(), codigo: form.codigo.trim().toUpperCase() || null,
      fecha_lanzamiento: form.fecha_lanzamiento || null,
    }
    if (!datos.juego_id) return setError('Elige el juego.')
    if (datos.nombre.length < 2) return setError('Escribe el nombre del set.')
    if (!datos.codigo) return setError('Escribe el código del set (ej. SV10, OP09). Es el que se usa en el Excel.')
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(datos.codigo)) return setError('El código solo puede tener letras, números, - y _ (máx. 20).')
    setOcupado(true)
    const { error } = form.id
      ? await supabase.from('sets').update(datos).eq('id', form.id)
      : await supabase.from('sets').insert(datos)
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    setOk(form.id ? `Set ${datos.codigo} actualizado.` : `Set ${datos.codigo} creado. Ya puedes usarlo en productos y en el Excel.`)
    setForm(null)
    cargar()
  }

  async function eliminarSet(s: SetFila) {
    const n = s.productos?.[0]?.count ?? 0
    const aviso = n ? `\n\n${n} producto(s) usan este set y quedarán "sin set" (no se borran).` : ''
    if (!window.confirm(`¿Eliminar el set ${s.codigo ?? ''} ${s.nombre}?${aviso}`)) return
    setError(null); setOk(null)
    const { data, error } = await supabase.from('sets').delete().eq('id', s.id).select('id')
    if (error) return setError(mensajeError(error))
    if (!data?.length) return setError('No tienes permiso para eliminar sets (solo el dueño).')
    setOk(`Set ${s.codigo ?? s.nombre} eliminado.`)
    cargar()
  }

  async function guardarJuego(e: FormEvent) {
    e.preventDefault()
    if (!nuevoJuego) return
    setError(null); setOk(null)
    const datos = { id: nuevoJuego.id, nombre: nuevoJuego.nombre.trim(), orden: juegos.length + 1 }
    if (datos.nombre.length < 2) return setError('Escribe el nombre del juego.')
    if (!/^[a-z0-9]{2,30}$/.test(datos.id)) return setError('El código del juego solo puede tener minúsculas y números. Ej: lorcana')
    setOcupado(true)
    const { error } = await supabase.from('juegos').insert(datos)
    setOcupado(false)
    if (error) return setError(mensajeError(error))
    setOk(`Juego ${datos.nombre} creado (código "${datos.id}").`)
    setNuevoJuego(null)
    cargar()
  }

  async function eliminarJuego(j: Juego) {
    if (!window.confirm(`¿Eliminar el juego ${j.nombre}? Solo se puede si no tiene productos ni sets.`)) return
    setError(null); setOk(null)
    const { data, error } = await supabase.from('juegos').delete().eq('id', j.id).select('id')
    if (error) return setError(mensajeError(error))
    if (!data?.length) return setError('No tienes permiso para eliminar juegos (solo el dueño).')
    setOk(`Juego ${j.nombre} eliminado.`)
    cargar()
  }

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Juegos y sets</h1>
          <p className="muted">Cuando sale una expansión nueva, créala aquí (o desde el Excel con la columna set_nombre).</p>
        </div>
        <div className="fila-botones">
          <button className="btn primario" onClick={() => { setForm(vacio(filtroJuego || juegos[0]?.id || '')); setOk(null); setError(null) }}>Nuevo set</button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {ok && <p className="ok" role="status">{ok}</p>}

      {form && (
        <form className="card" onSubmit={guardarSet}>
          <h2>{form.id ? `Editar set ${form.codigo}` : 'Nuevo set'}</h2>
          <div className="grilla">
            <label>Juego *
              <select value={form.juego_id} onChange={(e) => setForm({ ...form, juego_id: e.target.value })}>
                <option value="">Elige…</option>
                {juegos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
            </label>
            <label className="ancho-2">Nombre del set *
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Rivales Predestinados" autoFocus />
            </label>
            <label>Código *
              <input className="mono" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="Ej: SV10" maxLength={20} />
              <span className="ayuda">El que va en la columna set_codigo del Excel y en el SKU</span>
            </label>
            <label>Fecha de lanzamiento
              <input type="date" value={form.fecha_lanzamiento} onChange={(e) => setForm({ ...form, fecha_lanzamiento: e.target.value })} />
            </label>
          </div>
          <div className="fila-botones" style={{ marginTop: '1rem' }}>
            <button className="btn primario" disabled={ocupado}>{ocupado ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Crear set'}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="card filtros">
        <input type="search" placeholder="Buscar set por nombre o código…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar set" />
        <select value={filtroJuego} onChange={(e) => setFiltroJuego(e.target.value)} aria-label="Juego">
          <option value="">Todos los juegos</option>
          {juegos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select>
      </section>

      <section className="card sin-padding tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Set</th><th>Juego</th><th>Lanzamiento</th><th>Productos</th><th></th></tr></thead>
          <tbody>
            {visibles.length === 0 && <tr><td colSpan={6} className="muted centro">No hay sets con esos filtros.</td></tr>}
            {visibles.map((s) => {
              const n = s.productos?.[0]?.count ?? 0
              return (
                <tr key={s.id}>
                  <td className="mono">{s.codigo ?? '—'}</td>
                  <td className="link-fuerte">{s.nombre}</td>
                  <td>{nombreJuego(s.juego_id)}</td>
                  <td>{fecha(s.fecha_lanzamiento)}</td>
                  <td>{n > 0 ? <Link to={`/admin/productos?set=${s.id}`}>{n}</Link> : <span className="muted">0</span>}</td>
                  <td>
                    <div className="fila-botones">
                      <button className="btn-link" onClick={() => { setForm({ id: s.id, juego_id: s.juego_id, nombre: s.nombre, codigo: s.codigo ?? '', fecha_lanzamiento: s.fecha_lanzamiento ?? '' }); setOk(null); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Editar</button>
                      {esDueno && <button className="btn-link peligro" onClick={() => eliminarSet(s)}>Eliminar</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="cabecera-seccion">
          <h2>Juegos</h2>
          {!nuevoJuego && <button className="btn" onClick={() => setNuevoJuego({ nombre: '', id: '', tocado: false })}>+ Agregar juego</button>}
        </div>
        {nuevoJuego && (
          <form onSubmit={guardarJuego} className="grilla" style={{ marginBottom: '1rem', alignItems: 'end' }}>
            <label className="ancho-2">Nombre del juego
              <input value={nuevoJuego.nombre} autoFocus placeholder="Ej: Disney Lorcana"
                onChange={(e) => setNuevoJuego({ ...nuevoJuego, nombre: e.target.value, id: nuevoJuego.tocado ? nuevoJuego.id : codigoJuego(e.target.value) })} />
            </label>
            <label>Código
              <input className="mono" value={nuevoJuego.id} onChange={(e) => setNuevoJuego({ ...nuevoJuego, id: codigoJuego(e.target.value), tocado: true })} placeholder="lorcana" />
              <span className="ayuda">Para la columna juego del Excel</span>
            </label>
            <div className="fila-botones">
              <button className="btn primario" disabled={ocupado}>Crear juego</button>
              <button type="button" className="btn" onClick={() => setNuevoJuego(null)}>Cancelar</button>
            </div>
          </form>
        )}
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Juego</th><th>Código (para el Excel)</th><th>Sets</th><th></th></tr></thead>
            <tbody>
              {juegos.map((j) => (
                <tr key={j.id}>
                  <td className="link-fuerte">{j.nombre}</td>
                  <td className="mono">{j.id}</td>
                  <td>{setsPorJuego(j.id)}</td>
                  <td>{esDueno && <button className="btn-link peligro" onClick={() => eliminarJuego(j)}>Eliminar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
