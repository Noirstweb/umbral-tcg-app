import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Tables } from '../lib/database.types'

type Staff = Tables<'staff'>

type AuthState = {
  cargando: boolean
  session: Session | null
  staff: Staff | null
  esDueno: boolean
  salir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function cargarStaff(s: Session | null) {
      if (!s) {
        if (activo) { setStaff(null); setCargando(false) }
        return
      }
      // RLS: solo un miembro activo del equipo puede leer su fila en staff.
      const { data } = await supabase.from('staff').select('*').eq('user_id', s.user.id).eq('activo', true).maybeSingle()
      if (activo) { setStaff(data ?? null); setCargando(false) }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      cargarStaff(data.session)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSession(s)
      // No llamar a Supabase dentro del callback de forma síncrona (recomendación oficial).
      setTimeout(() => cargarStaff(s), 0)
    })

    return () => { activo = false; sub.subscription.unsubscribe() }
  }, [])

  const salir = async () => {
    await supabase.auth.signOut()
    setStaff(null)
  }

  return (
    <AuthContext.Provider value={{ cargando, session, staff, esDueno: staff?.rol === 'dueno', salir }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
