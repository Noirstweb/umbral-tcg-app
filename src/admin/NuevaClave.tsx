import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

/** Página a la que llega el enlace de "Olvidé mi contraseña". */
export default function NuevaClave() {
  const { session, cargando } = useAuth()
  const navigate = useNavigate()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (clave.length < 10) return setError('Usa al menos 10 caracteres.')
    if (clave !== repetir) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (error) return setError(mensajeError(error))
    navigate('/admin', { replace: true })
  }

  if (cargando) return <div className="pantalla-centro"><p className="muted">Cargando…</p></div>
  if (!session) {
    return (
      <div className="pantalla-centro">
        <div className="card estrecha">
          <h1>Enlace vencido</h1>
          <p className="muted">El enlace para cambiar la contraseña no es válido o ya se usó. Pide uno nuevo desde el login.</p>
          <a className="btn" href="/admin/login">Volver al login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="pantalla-centro">
      <form className="card estrecha" onSubmit={guardar}>
        <h1>Nueva contraseña</h1>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        <label>Repetir contraseña<input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </div>
  )
}
