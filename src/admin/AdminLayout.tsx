import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { alCambiarPedidos } from '../lib/eventos'
import { useAuth } from '../auth/AuthProvider'

export default function AdminLayout() {
  const { staff, esDueno, salir } = useAuth()
  const { pathname } = useLocation()
  const [porAtender, setPorAtender] = useState<number | null>(null)

  // Pedidos pagados que esperan preparación o entrega (se refresca al navegar)
  useEffect(() => {
    const contar = () => {
      supabase.from('pedidos').select('id', { count: 'exact', head: true }).in('estado', ['pagado', 'preparando', 'listo_para_retiro'])
        .then(({ count }) => setPorAtender(count ?? 0))
    }
    contar()
    return alCambiarPedidos(contar)
  }, [pathname])

  return (
    <div className="admin">
      <aside className="sidebar">
        <p className="marca">Umbral TCG</p>
        <nav>
          <NavLink to="/admin" end>Inicio</NavLink>
          <NavLink to="/admin/pedidos">Pedidos{porAtender ? <span className="nav-contador" title="Por atender">{porAtender}</span> : null}</NavLink>
          <NavLink to="/admin/productos">Productos</NavLink>
          <NavLink to="/admin/sets">Juegos y sets</NavLink>
          <NavLink to="/admin/importar">Carga por Excel</NavLink>
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
