// Lectura y generación de planillas para la carga masiva.
// exceljs se carga solo cuando se usa (es pesado), así el panel abre rápido.
import type { Tables } from '../../lib/database.types'
import { supabase } from '../../lib/supabase'

export type FilaImport = Record<string, string>

export const COLUMNAS = [
  { clave: 'nombre', titulo: 'nombre', ayuda: 'Nombre del producto o carta. Con esto (más set y número) el panel encuentra el producto, no necesitas SKU' },
  { clave: 'set_codigo', titulo: 'set_codigo', ayuda: 'Código del set (ver hoja Listas). Ayuda a distinguir cartas con el mismo nombre' },
  { clave: 'set_nombre', titulo: 'set_nombre', ayuda: 'Solo si el set es NUEVO: escribe su nombre (y el juego) y se crea automáticamente' },
  { clave: 'numero_carta', titulo: 'numero_carta', ayuda: 'Singles: número de la carta. Ej: 001/198 (también sirve 1 o 001)' },
  { clave: 'idioma', titulo: 'idioma', ayuda: 'Español, Inglés, Japonés, Coreano, Chino… (vacío = Español)' },
  { clave: 'estado', titulo: 'estado', ayuda: 'Solo singles y obligatorio: NM, LP, MP, HP o DMG' },
  { clave: 'acabado', titulo: 'acabado', ayuda: 'normal, foil o reverse_holo (vacío = normal)' },
  { clave: 'precio', titulo: 'precio', ayuda: 'Precio en pesos, sin puntos ni decimales. Obligatorio al crear' },
  { clave: 'precio_oferta', titulo: 'precio_oferta', ayuda: 'Opcional. Debe ser menor al precio. Escribe 0 para quitar una oferta' },
  { clave: 'stock', titulo: 'stock', ayuda: 'Unidades disponibles. Es el stock TOTAL, no lo que se suma. Obligatorio al crear' },
  { clave: 'stock_minimo', titulo: 'stock_minimo', ayuda: 'Opcional. Bajo este número aparece alerta de stock bajo' },
  { clave: 'visible', titulo: 'visible', ayuda: 'si o no (vacío = si al crear)' },
  { clave: 'tipo', titulo: 'tipo', ayuda: 'Solo productos nuevos: sellado, single, accesorio o preventa. Si pones estado, se asume single' },
  { clave: 'juego', titulo: 'juego', ayuda: 'Solo productos nuevos: código o nombre del juego. Si pones set_codigo se deduce solo' },
  { clave: 'rareza', titulo: 'rareza', ayuda: 'Opcional' },
  { clave: 'sku', titulo: 'sku', ayuda: 'Opcional. Vacío = se genera solo. Si lo pones, se usa para encontrar la variante exacta' },
  { clave: 'producto_slug', titulo: 'producto_slug', ayuda: 'Opcional. Solo si hay dos productos con el mismo nombre y set' },
] as const

const ALIAS: Record<string, string> = {
  codigo: 'sku', set: 'set_codigo', codigo_set: 'set_codigo', numero: 'numero_carta', n_carta: 'numero_carta',
  condicion: 'estado', estado_carta: 'estado', oferta: 'precio_oferta', precio_de_oferta: 'precio_oferta',
  stock_min: 'stock_minimo', minimo: 'stock_minimo', slug: 'producto_slug', producto: 'nombre', lenguaje: 'idioma',
}

export function normalizarEncabezado(h: string) {
  const k = h.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return ALIAS[k] ?? k
}

function filasDesdeMatriz(matriz: string[][]): { filas: FilaImport[]; desconocidas: string[] } {
  const claves = new Set<string>(['sku', 'nombre'])
  const idxEnc = matriz.findIndex((f) => f.some((c) => claves.has(normalizarEncabezado(c))))
  if (idxEnc === -1) throw new Error('No encontré la fila de encabezados (columnas "nombre" o "sku"). Usa la plantilla descargable.')
  const encabezados = matriz[idxEnc].map(normalizarEncabezado)
  const validas = new Set<string>(COLUMNAS.map((c) => c.clave))
  const desconocidas = encabezados.filter((h) => h && !validas.has(h))
  const filas: FilaImport[] = []
  for (const fila of matriz.slice(idxEnc + 1)) {
    if (fila.every((c) => !c || !c.trim())) continue
    const obj: FilaImport = {}
    encabezados.forEach((h, i) => { if (validas.has(h)) obj[h] = (fila[i] ?? '').trim() })
    filas.push(obj)
  }
  return { filas, desconocidas }
}

function parsearCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

export async function leerArchivo(archivo: File): Promise<{ filas: FilaImport[]; desconocidas: string[] }> {
  if (archivo.size > 10 * 1024 * 1024) throw new Error('El archivo pesa más de 10 MB.')
  const nombre = archivo.name.toLowerCase()
  if (nombre.endsWith('.csv')) {
    const texto = (await archivo.text()).replace(/^\uFEFF/, '')
    return filasDesdeMatriz(parsearCsv(texto))
  }
  if (!nombre.endsWith('.xlsx')) throw new Error('Formato no soportado. Sube un .xlsx o .csv (si tienes .xls, guárdalo como .xlsx).')

  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(await archivo.arrayBuffer())
  const hoja = libro.getWorksheet('Productos') ?? libro.worksheets[0]
  if (!hoja) throw new Error('El archivo no tiene hojas.')
  const matriz: string[][] = []
  hoja.eachRow({ includeEmpty: false }, (row) => {
    const valores: string[] = []
    for (let c = 1; c <= Math.max(row.cellCount, COLUMNAS.length); c++) valores.push(row.getCell(c).text ?? '')
    matriz.push(valores)
  })
  return filasDesdeMatriz(matriz)
}

type Libro = import('exceljs').Workbook
const letra = (clave: string) => String.fromCharCode(65 + COLUMNAS.findIndex((c) => c.clave === clave))

function hojaProductos(libro: Libro, filas: Partial<Record<(typeof COLUMNAS)[number]['clave'], string | number>>[]) {
  const hoja = libro.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] })
  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.clave, width: c.clave === 'nombre' ? 30 : Math.max(12, c.titulo.length + 4) }))
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  COLUMNAS.forEach((c, i) => { hoja.getCell(1, i + 1).note = c.ayuda })
  hoja.addRows(filas)
  hoja.getColumn('precio').numFmt = '0'
  hoja.getColumn('precio_oferta').numFmt = '0'
  const hasta = Math.max(5001, filas.length + 1000)
  const lista = (clave: string, valores: string) => {
    const col = letra(clave)
    for (let r = 2; r <= hasta; r++) hoja.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [valores], showErrorMessage: true, errorTitle: 'Valor no válido', error: 'Elige un valor de la lista.' }
  }
  lista('tipo', '"sellado,single,accesorio,preventa"')
  lista('estado', '"NM,LP,MP,HP,DMG"')
  lista('acabado', '"normal,foil,reverse_holo"')
  lista('visible', '"si,no"')
  return hoja
}

async function guardarLibro(libro: Libro, nombre: string) {
  const buffer = await libro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const INSTRUCCIONES = [
  'CÓMO USAR ESTA PLANILLA',
  '',
  '1. Cada fila es una VARIANTE: una versión que se vende por separado (idioma, estado, acabado).',
  '2. NO necesitas SKU. El panel encuentra cada carta por nombre + set + número + idioma + estado + acabado.',
  '   Si existe, actualiza lo que escribas. Si no existe, la crea y le genera un SKU automáticamente.',
  '3. Para AGREGAR una versión nueva de una carta que ya está en la tienda: nombre, idioma, estado, precio y stock.',
  '4. Para un PRODUCTO NUEVO: nombre, set_codigo (o juego), precio y stock. En singles agrega numero_carta y estado.',
  '   El tipo se deduce (si tiene estado es single); escríbelo si es sellado, accesorio o preventa.',
  '   ¿Salió un set nuevo? Escribe su código en set_codigo, su nombre en set_nombre y el juego: se crea solo. También puedes crearlo en "Juegos y sets".',
  '5. Para ACTUALIZAR basta con identificar la carta y escribir lo que cambia. Las celdas vacías conservan el valor actual.',
  '6. El stock es el TOTAL disponible, no lo que se suma. Si tienes 5 y escribes 8, quedan 8.',
  '7. Para quitar una oferta escribe 0 en precio_oferta.',
  '8. Lo más rápido para actualizar todo: en el panel usa "Exportar inventario", cambia precios o stock en ese archivo y súbelo.',
  '9. Antes de guardar verás una vista previa con lo que cambia, los SKU nuevos y las filas con errores. Nada se guarda hasta que confirmes.',
  '',
  'Columnas:',
  ...COLUMNAS.map((c) => `• ${c.titulo}: ${c.ayuda}`),
]

function hojaInstrucciones(libro: Libro) {
  const inst = libro.addWorksheet('Instrucciones')
  inst.getColumn(1).width = 120
  INSTRUCCIONES.forEach((t, i) => { inst.getCell(i + 1, 1).value = t; if (i === 0) inst.getCell(1, 1).font = { bold: true, size: 14 } })
}

export async function descargarPlantilla(juegos: Tables<'juegos'>[], sets: (Tables<'sets'> & { juego: string })[]) {
  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Umbral TCG'

  hojaProductos(libro, [
    // Actualiza el stock de una carta existente, sin SKU
    { nombre: 'Dragón Demo ex', set_codigo: 'PKD1', numero_carta: '001/198', idioma: 'Español', estado: 'NM', stock: 3 },
    // Agrega una versión nueva (inglés LP) a esa carta: el SKU se genera solo
    { nombre: 'Dragón Demo ex', set_codigo: 'PKD1', numero_carta: '001/198', idioma: 'Inglés', estado: 'LP', precio: 13990, stock: 1 },
    // También puedes actualizar por SKU si lo conoces
    { sku: 'PKD2-SOB-ES', stock: 75 },
  ])
  hojaInstrucciones(libro)

  const listas = libro.addWorksheet('Listas')
  listas.columns = [{ header: 'juego (código)', width: 18 }, { header: 'juego (nombre)', width: 24 }, { header: '', width: 4 }, { header: 'set_codigo', width: 14 }, { header: 'set', width: 30 }, { header: 'juego del set', width: 20 }]
  listas.getRow(1).font = { bold: true }
  const max = Math.max(juegos.length, sets.length)
  for (let i = 0; i < max; i++) {
    const j = juegos[i], s = sets[i]
    listas.addRow([j?.id ?? '', j?.nombre ?? '', '', s?.codigo ?? '', s?.nombre ?? '', s?.juego ?? ''])
  }

  await guardarLibro(libro, 'plantilla-carga-umbral-tcg.xlsx')
}

type FilaInventario = {
  sku: string; idioma: string; estado_carta: string | null; acabado: string; precio: number; precio_oferta: number | null
  stock: number; stock_minimo: number; visible: boolean
  productos: { slug: string; tipo: string; nombre: string; numero_carta: string | null; rareza: string | null; juego_id: string; sets: { codigo: string | null } | null } | null
}

/** Descarga todo el inventario con las mismas columnas de la plantilla, listo para editar y volver a subir. */
export async function exportarInventario() {
  const todas: FilaInventario[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('producto_variantes')
      .select('sku, idioma, estado_carta, acabado, precio, precio_oferta, stock, stock_minimo, visible, productos(slug, tipo, nombre, numero_carta, rareza, juego_id, sets(codigo))')
      .order('sku')
      .range(desde, desde + 999)
    if (error) throw error
    todas.push(...((data ?? []) as unknown as FilaInventario[]))
    if (!data || data.length < 1000) break
  }
  todas.sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? '', 'es') || a.sku.localeCompare(b.sku))

  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Umbral TCG'
  hojaProductos(libro, todas.map((v) => ({
    nombre: v.productos?.nombre ?? '', set_codigo: v.productos?.sets?.codigo ?? '', numero_carta: v.productos?.numero_carta ?? '',
    idioma: v.idioma, estado: v.estado_carta ?? '', acabado: v.acabado, precio: v.precio, precio_oferta: v.precio_oferta ?? '',
    stock: v.stock, stock_minimo: v.stock_minimo, visible: v.visible ? 'si' : 'no', tipo: v.productos?.tipo ?? '',
    set_nombre: '', juego: v.productos?.juego_id ?? '', rareza: v.productos?.rareza ?? '', sku: v.sku, producto_slug: v.productos?.slug ?? '',
  })))
  hojaInstrucciones(libro)
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' })
  await guardarLibro(libro, `inventario-umbral-tcg-${hoy}.xlsx`)
  return todas.length
}
