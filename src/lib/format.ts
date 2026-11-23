const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })

export const formatoCLP = (n: number | null | undefined) => (n == null ? '—' : clp.format(n))

export const formatoFecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }) : '—'

/** "Dragón Demo ex" -> "dragon-demo-ex" */
export function slugify(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const PALABRAS_VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'THE', 'OF', 'A', 'AN', 'EN', 'CON', 'PARA', 'POR', 'AND', 'UN', 'UNA'])
const IDIOMA_CORTO: Record<string, string> = {
  Español: 'ES', Inglés: 'EN', Japonés: 'JP', Portugués: 'PT', Chino: 'CN', Coreano: 'KR',
  Francés: 'FR', Alemán: 'DE', Italiano: 'IT', 'Sin idioma': '',
}

/**
 * Vista previa del SKU que generará la base si se deja vacío (misma regla que privado.armar_sku).
 * Si ese código ya existe, la base le agrega -2, -3… al guardar.
 * Ej: single PKD1 001/198 Inglés LP foil → PKD1-001-EN-LP-F · sellado "Sobre Expansión Demo II" → PKD2-SOB-EXP-DEM-ES
 */
export function skuAutomatico(d: { tipo: string; nombre: string; numero: string; juego: string; juegoNombre?: string; set: string; idioma: string; estado: string; acabado: string }) {
  const partes: string[] = []
  if (d.tipo === 'preventa') partes.push('PRE')
  if (d.tipo === 'accesorio' && !d.set) partes.push('ACC')
  if (d.set) partes.push(d.set)
  else if (d.tipo !== 'accesorio' && d.juego) partes.push(d.juego.slice(0, 3))
  if (d.tipo === 'single' && d.numero.trim()) {
    partes.push(d.numero.split('/')[0].replace(/^.*-/, '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
  } else {
    // no repetir el nombre del juego ("Pokémon …" ya va con prefijo POK)
    const omitir = new Set([...sinTildes(d.juegoNombre ?? '').toUpperCase().split(/[^A-Z0-9]+/), d.juego.toUpperCase()])
    sinTildes(d.nombre).toUpperCase().split(/[^A-Z0-9]+/)
      .filter((w) => w && !PALABRAS_VACIAS.has(w) && !omitir.has(w)).slice(0, 3)
      .forEach((w) => partes.push(/^\d+$/.test(w) ? w : w.slice(0, 3)))
  }
  partes.push(d.idioma in IDIOMA_CORTO ? IDIOMA_CORTO[d.idioma] : sinTildes(d.idioma).slice(0, 2))
  if (d.tipo === 'single') partes.push(d.estado)
  if (d.acabado === 'foil') partes.push('F')
  else if (d.acabado === 'reverse_holo') partes.push('RH')
  const base = partes.filter(Boolean).join('-').toUpperCase().replace(/[^A-Z0-9_-]/g, '').replace(/-{2,}/g, '-').slice(0, 40).replace(/^-+|-+$/g, '')
  return base || 'VAR'
}

export const ETIQUETA_TIPO: Record<string, string> = {
  sellado: 'Sellado',
  single: 'Single',
  accesorio: 'Accesorio',
  preventa: 'Preventa',
}

export const ESTADOS_CARTA = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const
export const ACABADOS: Record<string, string> = { normal: 'Normal', foil: 'Foil', reverse_holo: 'Reverse holo' }
export const IDIOMAS = ['Español', 'Inglés', 'Japonés', 'Portugués', 'Chino', 'Coreano', 'Francés', 'Alemán', 'Italiano', 'Sin idioma']
