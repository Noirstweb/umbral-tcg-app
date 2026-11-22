# Umbral TCG — tienda demo de Noirstweb

Tienda TCG ficticia que sirve como modelo para mostrar a tiendas reales y como base del **plan Premium**:
catálogo con variantes, panel de administración, carga masiva por Excel y (próximamente) pedidos, pagos y CRM.

## Stack

- **Frontend:** Vite + React + TypeScript + React Router
- **Backend:** Supabase (Postgres con RLS, Auth, Storage, pg_cron) — proyecto `Umbral TCG Demo` (`acgqkzejeucfuzafdake`, São Paulo)
- **Hosting:** Netlify (`netlify.toml` con SPA redirect y cabeceras de seguridad)

## Desarrollo local

```bash
cp .env.example .env   # URL y clave publishable (pública por diseño; la seguridad está en RLS)
npm install
npm run dev            # http://localhost:5173/admin
```

En Netlify, configurar las mismas variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
**Nunca** usar la clave `service_role` en el frontend.

## Qué hay hoy (etapa 2)

| Ruta | Qué hace |
|---|---|
| `/admin/login` | Login del equipo. Recuperar contraseña por correo → `/admin/nueva-clave` |
| `/admin` | Inicio: resumen y alertas (pagos por revisar, avisos fallidos, stock bajo) |
| `/admin/productos` | Listado con búsqueda por nombre o SKU, filtros por juego/tipo/agotados, paginación |
| `/admin/productos/:id` | Ficha: datos del producto, variantes (idioma, estado, acabado, precio, oferta, stock, mínimo, máximo por pedido) y fotos |
| `/admin/importar` | Carga masiva .xlsx/.csv con plantilla, vista previa validada por el servidor e historial |

Roles: **dueño** (todo) y **vendedor** (productos, stock, pedidos; no borra ni cambia tarifas). Solo existen
usuarios del equipo invitados; no hay registro público al panel.

## Reglas importantes de la base de datos

- **Variantes:** cada SKU es una versión vendible (idioma + estado + acabado). No puede haber dos iguales en un producto. Los singles exigen estado (NM/LP/MP/HP/DMG).
- **Stock auditado:** todo cambio queda en `movimientos_stock` con motivo y autor (ajuste manual, carga Excel, reserva, liberación, cancelación, reactivación).
- **Carga Excel** (`importar_variantes`): valida en el servidor, primero simula (nada se guarda) y luego aplica. Al actualizar, una celda vacía conserva el valor actual; `precio_oferta = 0` quita la oferta. El stock es el total, no un delta.
- **Pedidos** (listos en la base, panel en la etapa 3): precio y envío los calcula la base, el stock se reserva al crear el pedido, los impagos expiran a los 30 minutos (pg_cron), pagos idempotentes con manejo de pago tardío, monto distinto y doble cobro, y reglas de transición de estados con historial y avisos al cliente.
- **Envíos:** Santiago (52 comunas RM) $3.500, gratis desde $50.000; regiones $5.990–$7.990 y zona extrema $9.990, gratis desde $150.000; retiro gratis. 346 comunas cargadas.

## Próximas etapas

3. Panel de pedidos y CRM (fichas de clientes, segmentos, notas, ventas).
4. Tienda pública conectada (catálogo, carro, Mi cuenta, checkout con Mercado Pago en modo prueba, envío de correos).
