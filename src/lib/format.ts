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

/** Sugerencia de SKU a partir de los datos de la variante, en mayúsculas y sin caracteres raros. */
export function sugerirSku(partes: (string | null | undefined)[]) {
  return partes
    .filter(Boolean)
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const ETIQUETA_TIPO: Record<string, string> = {
  sellado: 'Sellado',
  single: 'Single',
  accesorio: 'Accesorio',
  preventa: 'Preventa',
}

export const ESTADOS_CARTA = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const
export const ACABADOS: Record<string, string> = { normal: 'Normal', foil: 'Foil', reverse_holo: 'Reverse holo' }
export const IDIOMAS = ['Español', 'Inglés', 'Japonés', 'Portugués', 'Sin idioma']
