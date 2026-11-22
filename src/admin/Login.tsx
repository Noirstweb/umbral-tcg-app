import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'

export default function Login() {
  const { session, staff, cargando } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/admin'

  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (!cargando && session && staff) return <Navigate to={destino} replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setError(null); setAviso(null); setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setEnviando(false)
    if (error) return setError(mensajeError(error))
    navigate(destino, { replace: true })
  }

  async function recuperar() {
    setError(null); setAviso(null)
    if (!email.trim()) return setError('Escribe tu correo y luego presiona "Olvidé mi contraseña".')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/nueva-clave`,
    })
    if (error) return setError(mensajeError(error))
    setAviso('Si el correo pertenece al equipo, te llegará un enlace para crear una nueva contraseña.')
  }

  return (
    <div className="pantalla-centro">
      <form className="card estrecha" onSubmit={entrar}>
        <p className="marca">Umbral TCG</p>
        <h1>Panel de la tienda</h1>
        <label>
          Correo
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="ok" role="status">{aviso}</p>}
        <button className="btn primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" className="btn-link" onClick={recuperar}>Olvidé mi contraseña</button>
      </form>
    </div>
  )
}
