import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.')
}

export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const BUCKET_FOTOS = 'productos'

export function urlFoto(path: string) {
  return supabase.storage.from(BUCKET_FOTOS).getPublicUrl(path).data.publicUrl
}

/** Traduce errores de Postgres/Supabase a mensajes claros para el equipo de la tienda. */
export function mensajeError(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string }
  const msg = err?.message ?? String(e)
  if (err?.code === '23505') {
    if (msg.includes('sku')) return 'Ya existe una variante con ese SKU.'
    if (msg.includes('slug')) return 'Ya existe un producto con esa URL (slug). Cambia el nombre o el slug.'
    if (msg.includes('producto_id_idioma_estado_carta_acabado')) return 'Ya existe una variante igual (mismo idioma, estado y acabado).'
    if (msg.includes('sets_juego_id_codigo')) return 'Ya existe un set con ese código en ese juego.'
    if (msg.includes('juegos_pkey')) return 'Ya existe un juego con ese código.'
    return 'Ese registro ya existe.'
  }
  if (err?.code === '42501' || msg.includes('row-level security')) return 'No tienes permiso para hacer esto con tu rol.'
  if (err?.code === '23503') return 'No se puede eliminar porque hay productos o sets que lo usan.'
  if (err?.code === '23514') {
    if (msg.includes('sets_codigo_formato')) return 'El código del set solo puede tener letras, números, - y _ (máx. 20). Ej: SV10, OP09.'
    if (msg.includes('sets_nombre')) return 'El nombre del set debe tener entre 2 y 120 caracteres.'
    if (msg.includes('juegos_id_formato')) return 'El código del juego solo puede tener minúsculas y números, sin espacios. Ej: pokemon.'
    if (msg.includes('juegos_nombre')) return 'El nombre del juego debe tener entre 2 y 60 caracteres.'
    if (msg.includes('precio_oferta')) return 'El precio oferta debe ser menor al precio normal.'
    if (msg.includes('sku')) return 'El SKU solo puede tener mayúsculas, números, guiones y guion bajo.'
    if (msg.includes('slug')) return 'El slug solo puede tener minúsculas, números y guiones.'
    if (msg.includes('stock')) return 'El stock no puede ser negativo.'
  }
  if (msg === 'Invalid login credentials') return 'Correo o contraseña incorrectos.'
  return msg
}
