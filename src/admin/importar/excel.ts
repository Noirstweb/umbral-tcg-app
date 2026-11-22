// Lectura y generación de planillas para la carga masiva.
// exceljs se carga solo cuando se usa (es pesado), así el panel abre rápido.
import type { Tables } from '../../lib/database.types'

export type FilaImport = Record<string, string>

export const COLUMNAS = [
  { clave: 'sku', titulo: 'sku', ayuda: 'Obligatorio. Código único de la variante. Solo mayúsculas, números, - y _. Ej: PKD1-001-ES-NM' },
  { clave: 'tipo', titulo: 'tipo', ayuda: 'Al crear: sellado, single, accesorio o preventa' },
  { clave: 'juego', titulo: 'juego', ayuda: 'Al crear: código o nombre del juego (ver hoja Listas)' },
  { clave: 'set_codigo', titulo: 'set_codigo', ayuda: 'Opcional. Código del set (ver hoja Listas)' },
  { clave: 'nombre', titulo: 'nombre', ayuda: 'Al crear: nombre del producto o carta' },
  { clave: 'numero_carta', titulo: 'numero_carta', ayuda: 'Singles: número de la carta. Ej: 001/198' },
  { clave: 'rareza', titulo: 'rareza', ayuda: 'Opcional' },
  { clave: 'idioma', titulo: 'idioma', ayuda: 'Español, Inglés, Japonés… (vacío = Español)' },
  { clave: 'estado', titulo: 'estado', ayuda: 'Solo singles y obligatorio: NM, LP, MP, HP o DMG' },
  { clave: 'acabado', titulo: 'acabado', ayuda: 'normal, foil o reverse_holo (vacío = normal)' },
  { clave: 'precio', titulo: 'precio', ayuda: 'Al crear: precio en pesos, sin decimales' },
  { clave: 'precio_oferta', titulo: 'precio_oferta', ayuda: 'Opcional. Debe ser menor al precio. Escribe 0 para quitar una oferta' },
  { clave: 'stock', titulo: 'stock', ayuda: 'Al crear: unidades disponibles. Es el stock TOTAL, no lo que se suma' },
  { clave: 'stock_minimo', titulo: 'stock_minimo', ayuda: 'Opcional. Bajo este número aparece alerta de stock bajo' },
  { clave: 'visible', titulo: 'visible', ayuda: 'si o no (vacío = si al crear)' },
  { clave: 'producto_slug', titulo: 'producto_slug', ayuda: 'Opcional. Para agrupar variantes en un producto existente' },
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
  const idxEnc = matriz.findIndex((f) => f.some((c) => normalizarEncabezado(c) === 'sku'))
  if (idxEnc === -1) throw new Error('No encontré la columna "sku". Usa la plantilla descargable.')
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

export async function descargarPlantilla(juegos: Tables<'juegos'>[], sets: (Tables<'sets'> & { juego: string })[]) {
  const ExcelJS = (await import('exceljs')).default
  const libro = new ExcelJS.Workbook()
  libro.creator = 'Umbral TCG'

  const hoja = libro.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] })
  hoja.columns = COLUMNAS.map((c) => ({ header: c.titulo, key: c.clave, width: Math.max(12, c.titulo.length + 4) }))
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  COLUMNAS.forEach((c, i) => { hoja.getCell(1, i + 1).note = c.ayuda })
  hoja.addRows([
    { sku: 'PKD1-001-ES-NM', tipo: 'single', juego: 'pokemon', set_codigo: 'PKD1', nombre: 'Dragón Demo ex', numero_carta: '001/198', rareza: 'Ultra Rara', idioma: 'Español', estado: 'NM', acabado: 'normal', precio: 18990, stock: 2, visible: 'si' },
    { sku: 'PKD1-001-EN-LP', tipo: 'single', juego: 'pokemon', set_codigo: 'PKD1', nombre: 'Dragón Demo ex', numero_carta: '001/198', rareza: 'Ultra Rara', idioma: 'Inglés', estado: 'LP', acabado: 'normal', precio: 13990, stock: 1, visible: 'si' },
    { sku: 'PKD2-SOB-ES', stock: 75 },
  ])
  hoja.getColumn('precio').numFmt = '0'
  hoja.getColumn('precio_oferta').numFmt = '0'
  const lista = (col: string, valores: string) => {
    for (let r = 2; r <= 5001; r++) hoja.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [valores], showErrorMessage: true, errorTitle: 'Valor no válido', error: 'Elige un valor de la lista.' }
  }
  lista('B', '"sellado,single,accesorio,preventa"')
  lista('I', '"NM,LP,MP,HP,DMG"')
  lista('J', '"normal,foil,reverse_holo"')
  lista('O', '"si,no"')

  const inst = libro.addWorksheet('Instrucciones')
  inst.getColumn(1).width = 110
  ;[
    'CÓMO USAR ESTA PLANILLA',
    '',
    '1. Cada fila es una VARIANTE (una versión que se vende: idioma, estado, acabado). Las variantes del mismo producto comparten nombre, juego, set y número.',
    '2. Para CREAR una variante nueva completa: sku, tipo, juego, nombre, precio y stock (y estado si es single).',
    '3. Para ACTUALIZAR basta con el sku y las columnas que quieras cambiar. Las celdas vacías conservan el valor actual.',
    '4. El stock es el TOTAL disponible, no lo que se suma. Si tienes 5 y escribes 8, quedan 8.',
    '5. Para quitar una oferta escribe 0 en precio_oferta.',
    '6. Antes de guardar, el panel te muestra una vista previa con lo que va a cambiar y las filas con errores. Nada se guarda hasta que confirmes.',
    '7. Las filas con errores no se importan; corrígelas y vuelve a subir el archivo.',
    '',
    'Columnas:',
    ...COLUMNAS.map((c) => `• ${c.titulo}: ${c.ayuda}`),
  ].forEach((t, i) => { inst.getCell(i + 1, 1).value = t; if (i === 0) inst.getCell(1, 1).font = { bold: true, size: 14 } })

  const listas = libro.addWorksheet('Listas')
  listas.columns = [{ header: 'juego (código)', width: 18 }, { header: 'juego (nombre)', width: 24 }, { header: '', width: 4 }, { header: 'set_codigo', width: 14 }, { header: 'set', width: 30 }, { header: 'juego del set', width: 20 }]
  listas.getRow(1).font = { bold: true }
  const max = Math.max(juegos.length, sets.length)
  for (let i = 0; i < max; i++) {
    const j = juegos[i], s = sets[i]
    listas.addRow([j?.id ?? '', j?.nombre ?? '', '', s?.codigo ?? '', s?.nombre ?? '', s?.juego ?? ''])
  }

  const buffer = await libro.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla-carga-umbral-tcg.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
