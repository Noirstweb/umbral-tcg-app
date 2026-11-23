import { useCallback, useEffect, useState } from 'react'
import { supabase, mensajeError } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'
import { formatoCLP, formatoFecha } from '../../lib/format'
import { leerArchivo, descargarPlantilla, exportarInventario, type FilaImport } from './excel'

type Modo = 'ambos' | 'crear' | 'actualizar'
type Detalle = {
  fila: number; sku: string | null; nombre?: string | null; sku_generado?: boolean; producto_nuevo?: boolean; accion: 'crear' | 'actualizar' | 'sin_cambios' | 'error'; errores?: string[]
  stock_antes?: number | null; stock_nuevo?: number | null; precio_antes?: number | null; precio_nuevo?: number | null
  oferta_antes?: number | null; oferta_nueva?: number | null
}
type Resultado = { simulado: boolean; filas: number; crear: number; actualizar: number; sin_cambios: number; errores: number; detalle: Detalle[] }
type Carga = Tables<'cargas_excel'> & { staff: { nombre: string } | null }

const MODOS: Record<Modo, string> = {
  ambos: 'Crear nuevos y actualizar existentes',
  crear: 'Solo crear productos nuevos',
  actualizar: 'Solo actualizar lo que ya existe (no crea nada)',
}
const ETIQUETA_ACCION: Record<Detalle['accion'], string> = { crear: 'Crear', actualizar: 'Actualizar', sin_cambios: 'Sin cambios', error: 'Error' }

export default function Importar() {
  const [modo, setModo] = useState<Modo>('ambos')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaImport[]>([])
  const [desconocidas, setDesconocidas] = useState<string[]>([])
  const [vista, setVista] = useState<Resultado | null>(null)
  const [final, setFinal] = useState<Resultado | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'cambios' | 'error'>('todas')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Carga[]>([])

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase.from('cargas_excel').select('*, staff(nombre)').order('created_at', { ascending: false }).limit(15)
    setHistorial((data ?? []) as unknown as Carga[])
  }, [])
  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  async function simular(f: FilaImport[], m: Modo, nombre: string) {
    setOcupado('Revisando el archivo…'); setError(null)
    const { data, error } = await supabase.rpc('importar_variantes', { p_archivo: nombre, p_modo: m, p_filas: f, p_simular: true })
    setOcupado(null)
    if (error) return setError(mensajeError(error))
    setVista(data as unknown as Resultado)
  }

  async function elegirArchivo(a: File | null) {
    setArchivo(a); setVista(null); setFinal(null); setFilas([]); setDesconocidas([]); setError(null)
    if (!a) return
    try {
      setOcupado('Leyendo el archivo…')
      const { filas, desconocidas } = await leerArchivo(a)
      setOcupado(null)
      if (filas.length === 0) return setError('El archivo no tiene filas con datos debajo de los encabezados.')
      if (filas.length > 5000) return setError('Máximo 5.000 filas por archivo. Divídelo en varios.')
      setFilas(filas); setDesconocidas(desconocidas)
      await simular(filas, modo, a.name)
    } catch (e) {
      setOcupado(null)
      setError(mensajeError(e))
    }
  }

  async function cambiarModo(m: Modo) {
    setModo(m)
    if (filas.length && archivo) await simular(filas, m, archivo.name)
  }

  async function confirmar() {
    if (!vista || !archivo) return
    const cambios = vista.crear + vista.actualizar
    const aviso = vista.errores ? `\n\n${vista.errores} fila(s) con errores NO se importarán.` : ''
    if (!window.confirm(`Se van a crear ${vista.crear} y actualizar ${vista.actualizar} variante(s) (${cambios} cambios).${aviso}\n\n¿Confirmas?`)) return
    setOcupado('Guardando…'); setError(null)
    const { data, error } = await supabase.rpc('importar_variantes', { p_archivo: archivo.name, p_modo: modo, p_filas: filas, p_simular: false })
    setOcupado(null)
    if (error) return setError(mensajeError(error))
    setFinal(data as unknown as Resultado)
    setVista(null)
    cargarHistorial()
  }

  async function plantilla() {
    setOcupado('Generando plantilla…')
    try {
      const [{ data: juegos }, { data: sets }] = await Promise.all([
        supabase.from('juegos').select('*').order('orden'),
        supabase.from('sets').select('*, juegos(nombre)').order('juego_id'),
      ])
      await descargarPlantilla(juegos ?? [], (sets ?? []).map((s) => ({ ...s, juego: (s as unknown as { juegos: { nombre: string } | null }).juegos?.nombre ?? '' })))
    } catch (e) { setError(mensajeError(e)) }
    setOcupado(null)
  }

  async function exportar() {
    setOcupado('Preparando tu inventario…'); setError(null)
    try { await exportarInventario() } catch (e) { setError(mensajeError(e)) }
    setOcupado(null)
  }

  const res = final ?? vista
  const detalle = (res?.detalle ?? []).filter((d) =>
    filtro === 'todas' ? true : filtro === 'error' ? d.accion === 'error' : d.accion === 'crear' || d.accion === 'actualizar')

  return (
    <>
      <header className="cabecera">
        <h1>Carga de stock por Excel</h1>
        <div className="fila-botones">
          <button className="btn" onClick={exportar} disabled={!!ocupado} title="Descarga todos tus productos en Excel para editarlos y volver a subirlos">Exportar inventario</button>
          <button className="btn" onClick={plantilla} disabled={!!ocupado}>Descargar plantilla</button>
        </div>
      </header>

      <section className="card">
        <ol className="pasos">
          <li><strong>Para actualizar precios o stock:</strong> usa "Exportar inventario", cambia lo que necesites en ese archivo y súbelo.</li>
          <li><strong>Para cargar productos nuevos:</strong> descarga la plantilla y escribe una fila por variante. No necesitas SKU: se generan solos.</li>
          <li>Sube el archivo (.xlsx o .csv). El panel reconoce cada carta por nombre, set, número, idioma, estado y acabado.</li>
          <li>Revisa la vista previa: <strong>nada se guarda hasta que confirmes</strong>.</li>
        </ol>
        <div className="grilla">
          <label className="ancho-2">Qué hacer
            <select value={modo} onChange={(e) => cambiarModo(e.target.value as Modo)} disabled={!!ocupado}>
              {Object.entries(MODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="ancho-2">Archivo
            <input type="file" accept=".xlsx,.csv" disabled={!!ocupado} onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {ocupado && <p className="muted" role="status">{ocupado}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {desconocidas.length > 0 && <p className="aviso chico">Columnas ignoradas (no son de la plantilla): {desconocidas.join(', ')}</p>}
      </section>

      {res && (
        <section className="card">
          <div className="cabecera-seccion">
            <h2>{final ? 'Importación terminada' : `Vista previa · ${archivo?.name}`}</h2>
            {!final && (
              <button className="btn primario" onClick={confirmar} disabled={!!ocupado || res.crear + res.actualizar === 0}>
                Confirmar importación ({res.crear + res.actualizar} cambios)
              </button>
            )}
          </div>
          {final && <p className="ok">Listo: se crearon {final.crear} y se actualizaron {final.actualizar} variantes. Cada cambio de stock quedó registrado con tu usuario.</p>}
          <div className="tarjetas">
            <div className="kpi card"><span className="muted">Filas leídas</span><strong>{res.filas}</strong></div>
            <div className="kpi card"><span className="muted">A crear</span><strong>{res.crear}</strong></div>
            <div className="kpi card"><span className="muted">A actualizar</span><strong>{res.actualizar}</strong></div>
            <div className="kpi card"><span className="muted">Sin cambios</span><strong>{res.sin_cambios}</strong></div>
            <div className={`kpi card ${res.errores ? 'kpi-error' : ''}`}><span className="muted">Con errores</span><strong>{res.errores}</strong></div>
          </div>
          <div className="fila-botones">
            {(['todas', 'cambios', 'error'] as const).map((f) => (
              <button key={f} className={`btn ${filtro === f ? 'activo' : ''}`} onClick={() => setFiltro(f)}>
                {f === 'todas' ? 'Todas' : f === 'cambios' ? 'Solo cambios' : 'Solo errores'}
              </button>
            ))}
          </div>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Fila</th><th>Producto</th><th>SKU</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>
                {detalle.map((d) => (
                  <tr key={d.fila} className={d.accion === 'error' ? 'fila-error' : ''}>
                    <td>{d.fila}</td>
                    <td>{d.nombre ?? '—'}{d.producto_nuevo && <div className="chico aviso">Producto nuevo</div>}</td>
                    <td className="mono">{d.sku ?? '—'}{d.sku_generado && <div className="chico muted">generado</div>}</td>
                    <td><span className={`pill a-${d.accion}`}>{ETIQUETA_ACCION[d.accion]}</span></td>
                    <td>
                      {d.accion === 'error' && <ul className="lista-errores">{d.errores?.map((e) => <li key={e}>{e}</li>)}</ul>}
                      {d.accion === 'crear' && <>Stock {d.stock_nuevo} · {formatoCLP(d.precio_nuevo)}{d.oferta_nueva ? ` (oferta ${formatoCLP(d.oferta_nueva)})` : ''}</>}
                      {d.accion === 'actualizar' && (
                        <>
                          {d.stock_antes !== d.stock_nuevo && <>Stock {d.stock_antes} → <strong>{d.stock_nuevo}</strong> </>}
                          {d.precio_antes !== d.precio_nuevo && <>· Precio {formatoCLP(d.precio_antes)} → <strong>{formatoCLP(d.precio_nuevo)}</strong> </>}
                          {d.oferta_antes !== d.oferta_nueva && <>· Oferta {formatoCLP(d.oferta_antes)} → <strong>{d.oferta_nueva == null ? 'sin oferta' : formatoCLP(d.oferta_nueva)}</strong></>}
                          {d.stock_antes === d.stock_nuevo && d.precio_antes === d.precio_nuevo && d.oferta_antes === d.oferta_nueva && <span className="muted">Cambia stock mínimo o visibilidad</span>}
                        </>
                      )}
                      {d.accion === 'sin_cambios' && <span className="muted">Igual a lo que ya está en la tienda</span>}
                    </td>
                  </tr>
                ))}
                {detalle.length === 0 && <tr><td colSpan={5} className="muted centro">Nada que mostrar con este filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Historial de cargas</h2>
        {historial.length === 0 ? <p className="muted">Todavía no hay cargas.</p> : (
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Archivo</th><th>Quién</th><th>Modo</th><th>Creados</th><th>Actualizados</th><th>Errores</th></tr></thead>
            <tbody>
              {historial.map((c) => (
                <tr key={c.id}>
                  <td>{formatoFecha(c.created_at)}</td><td>{c.archivo}</td><td>{c.staff?.nombre ?? '—'}</td>
                  <td>{c.modo}</td><td>{c.creados}</td><td>{c.actualizados}</td><td className={c.con_error ? 'aviso' : ''}>{c.con_error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
