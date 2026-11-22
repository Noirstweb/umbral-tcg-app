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
    return 'Ese registro ya existe.'
  }
  if (err?.code === '42501' || msg.includes('row-level security')) return 'No tienes permiso para hacer esto con tu rol.'
  if (err?.code === '23514') {
    if (msg.includes('precio_oferta')) return 'El precio oferta debe ser menor al precio normal.'
    if (msg.includes('sku')) return 'El SKU solo puede tener mayúsculas, números, guiones y guion bajo.'
    if (msg.includes('slug')) return 'El slug solo puede tener minúsculas, números y guiones.'
    if (msg.includes('stock')) return 'El stock no puede ser negativo.'
  }
  if (msg === 'Invalid login credentials') return 'Correo o contraseña incorrectos.'
  return msg
}
