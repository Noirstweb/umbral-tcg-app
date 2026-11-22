import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export default function AdminLayout() {
  const { staff, esDueno, salir } = useAuth()
  return (
    <div className="admin">
      <aside className="sidebar">
        <p className="marca">Umbral TCG</p>
        <nav>
          <NavLink to="/admin" end>Inicio</NavLink>
          <NavLink to="/admin/productos">Productos</NavLink>
          <NavLink to="/admin/importar">Carga por Excel</NavLink>
          <span className="nav-pronto" title="Etapa 3">Pedidos</span>
          {esDueno && <span className="nav-pronto" title="Etapa 3">Clientes (CRM)</span>}
        </nav>
        <div className="sidebar-pie">
          <p className="usuario">{staff?.nombre}<br /><span className="muted">{esDueno ? 'Dueño' : 'Vendedor'}</span></p>
          <button className="btn-link" onClick={salir}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  )
}
