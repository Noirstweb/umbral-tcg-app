import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireStaff } from './auth/RequireStaff'
import AdminLayout from './admin/AdminLayout'
import Login from './admin/Login'
import NuevaClave from './admin/NuevaClave'
import Inicio from './admin/Inicio'

// Las pantallas pesadas se cargan solo cuando se abren
const ProductosList = lazy(() => import('./admin/productos/ProductosList'))
const ProductoForm = lazy(() => import('./admin/productos/ProductoForm'))
const Importar = lazy(() => import('./admin/importar/Importar'))
const JuegosSets = lazy(() => import('./admin/catalogo/JuegosSets'))

function Portada() {
  return (
    <div className="pantalla-centro">
      <div className="card estrecha">
        <p className="marca">Umbral TCG</p>
        <h1>Tienda en construcción</h1>
        <p className="muted">La tienda pública llega en la etapa 4. Mientras tanto, el equipo administra el catálogo desde el panel.</p>
        <a className="btn primario" href="/admin">Ir al panel</a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<p className="muted" style={{ padding: 24 }}>Cargando…</p>}>
          <Routes>
            <Route path="/" element={<Portada />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin/nueva-clave" element={<NuevaClave />} />
            <Route path="/admin" element={<RequireStaff><AdminLayout /></RequireStaff>}>
              <Route index element={<Inicio />} />
              <Route path="productos" element={<ProductosList />} />
              <Route path="productos/nuevo" element={<ProductoForm key="nuevo" />} />
              <Route path="productos/:id" element={<ProductoForm />} />
              <Route path="importar" element={<Importar />} />
              <Route path="sets" element={<JuegosSets />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
