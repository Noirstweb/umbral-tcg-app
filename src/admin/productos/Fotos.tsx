import { useCallback, useEffect, useState } from 'react'
import { supabase, mensajeError, urlFoto, BUCKET_FOTOS } from '../../lib/supabase'
import type { Tables } from '../../lib/database.types'

type Imagen = Tables<'producto_imagenes'>
const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export default function Fotos({ productoId, variantes }: { productoId: string; variantes: { id: string; sku: string }[] }) {
  const [imagenes, setImagenes] = useState<Imagen[]>([])
  const [varianteDestino, setVarianteDestino] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('producto_imagenes').select('*').eq('producto_id', productoId).order('orden').order('created_at')
    if (error) return setError(mensajeError(error))
    setImagenes(data ?? [])
  }, [productoId])

  useEffect(() => { cargar() }, [cargar])

  async function subir(archivos: FileList | null) {
    if (!archivos?.length) return
    setError(null)
    const lista = [...archivos]
    const malos = lista.filter((f) => !TIPOS.includes(f.type) || f.size > MAX_BYTES)
    if (malos.length) return setError(`No se subieron: ${malos.map((f) => f.name).join(', ')}. Solo JPG, PNG o WEBP de hasta 5 MB.`)

    setSubiendo(true)
    const hayPrincipal = imagenes.some((i) => i.es_principal && !i.variante_id)
    let orden = imagenes.length
    for (const [n, archivo] of lista.entries()) {
      const path = `${productoId}/${crypto.randomUUID()}.${EXT[archivo.type]}`
      const { error: errSubida } = await supabase.storage.from(BUCKET_FOTOS).upload(path, archivo, { contentType: archivo.type, upsert: false })
      if (errSubida) { setError(`${archivo.name}: ${mensajeError(errSubida)}`); continue }
      const { error: errFila } = await supabase.from('producto_imagenes').insert({
        producto_id: productoId, variante_id: varianteDestino || null, storage_path: path, orden: orden++,
        es_principal: !varianteDestino && !hayPrincipal && n === 0,
      })
      if (errFila) {
        await supabase.storage.from(BUCKET_FOTOS).remove([path]) // no dejar archivos huérfanos
        setError(`${archivo.name}: ${mensajeError(errFila)}`)
      }
    }
    setSubiendo(false)
    cargar()
  }

  async function marcarPrincipal(img: Imagen) {
    setError(null)
    const { error: e1 } = await supabase.from('producto_imagenes').update({ es_principal: false }).eq('producto_id', productoId).is('variante_id', null)
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from('producto_imagenes').update({ es_principal: true }).eq('id', img.id)
    if (e2) setError(mensajeError(e2))
    cargar()
  }

  async function asignar(img: Imagen, varianteId: string) {
    const { error } = await supabase.from('producto_imagenes')
      .update({ variante_id: varianteId || null, es_principal: varianteId ? false : img.es_principal }).eq('id', img.id)
    if (error) setError(mensajeError(error))
    cargar()
  }

  async function mover(img: Imagen, delta: number) {
    const idx = imagenes.findIndex((i) => i.id === img.id)
    const otra = imagenes[idx + delta]
    if (!otra) return
    await supabase.from('producto_imagenes').update({ orden: otra.orden }).eq('id', img.id)
    await supabase.from('producto_imagenes').update({ orden: img.orden }).eq('id', otra.id)
    cargar()
  }

  async function eliminar(img: Imagen) {
    if (!window.confirm('¿Eliminar esta foto?')) return
    const { error } = await supabase.from('producto_imagenes').delete().eq('id', img.id)
    if (error) return setError(mensajeError(error))
    await supabase.storage.from(BUCKET_FOTOS).remove([img.storage_path])
    cargar()
  }

  return (
    <section className="card">
      <div className="cabecera-seccion">
        <h2>Fotos</h2>
        <div className="fila-botones">
          <select value={varianteDestino} onChange={(e) => setVarianteDestino(e.target.value)} aria-label="Asignar fotos nuevas a">
            <option value="">Foto del producto (oficial)</option>
            {variantes.map((v) => <option key={v.id} value={v.id}>Foto real de {v.sku}</option>)}
          </select>
          <label className="btn primario">
            {subiendo ? 'Subiendo…' : 'Subir fotos'}
            <input type="file" accept={TIPOS.join(',')} multiple hidden disabled={subiendo} onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </div>
      <p className="muted chico">JPG, PNG o WEBP de hasta 5 MB. La foto principal es la que se ve en el catálogo. En singles, sube la foto real de cada copia para mostrar su estado.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {imagenes.length === 0 ? (
        <p className="muted">Este producto aún no tiene fotos.</p>
      ) : (
        <div className="galeria">
          {imagenes.map((img, i) => (
            <figure key={img.id} className={img.es_principal ? 'principal' : ''}>
              <img src={urlFoto(img.storage_path)} alt={img.alt ?? ''} loading="lazy" />
              <figcaption>
                {img.es_principal && <span className="pill ok">Principal</span>}
                <select value={img.variante_id ?? ''} onChange={(e) => asignar(img, e.target.value)} aria-label="Pertenece a">
                  <option value="">Producto</option>
                  {variantes.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
                </select>
                <div className="fila-botones chico">
                  <button type="button" className="btn-link" disabled={i === 0} onClick={() => mover(img, -1)} aria-label="Mover antes">←</button>
                  <button type="button" className="btn-link" disabled={i === imagenes.length - 1} onClick={() => mover(img, 1)} aria-label="Mover después">→</button>
                  {!img.es_principal && !img.variante_id && <button type="button" className="btn-link" onClick={() => marcarPrincipal(img)}>Hacer principal</button>}
                  <button type="button" className="btn-link peligro" onClick={() => eliminar(img)}>Eliminar</button>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
