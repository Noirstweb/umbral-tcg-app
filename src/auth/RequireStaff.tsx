import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

/** Protege las rutas del panel: exige sesión iniciada y ser miembro activo del equipo. */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { cargando, session, staff, salir } = useAuth()
  const location = useLocation()

  if (cargando) return <div className="pantalla-centro"><p className="muted">Cargando…</p></div>
  if (!session) return <Navigate to="/admin/login" replace state={{ desde: location.pathname }} />
  if (!staff) {
    return (
      <div className="pantalla-centro">
        <div className="card estrecha">
          <h1>Sin acceso al panel</h1>
          <p className="muted">
            Tu cuenta ({session.user.email}) no es parte del equipo de la tienda o está desactivada.
            Pídele al dueño que te invite.
          </p>
          <button className="btn" onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
