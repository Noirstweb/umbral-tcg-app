// Tipos de la base de datos (proyecto Supabase "Umbral TCG Demo").
// Por ahora contiene solo las tablas que usa el panel de catálogo; al construir pedidos y CRM
// se regenera completo con `npx supabase gen types typescript --project-id acgqkzejeucfuzafdake`.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cargas_excel: {
        Row: {
          actualizados: number
          archivo: string
          autor_id: string | null
          con_error: number
          creados: number
          created_at: string
          errores: Json
          filas_total: number
          id: string
          modo: string
        }
        Insert: {
          actualizados?: number
          archivo: string
          autor_id?: string | null
          con_error?: number
          creados?: number
          created_at?: string
          errores?: Json
          filas_total?: number
          id?: string
          modo: string
        }
        Update: {
          actualizados?: number
          archivo?: string
          autor_id?: string | null
          con_error?: number
          creados?: number
          created_at?: string
          errores?: Json
          filas_total?: number
          id?: string
          modo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargas_excel_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clientes: {
        Row: {
          acepta_marketing: boolean
          created_at: string
          email: string
          etiquetas: string[]
          id: string
          nombre: string
          rut: string | null
          telefono: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          acepta_marketing?: boolean
          created_at?: string
          email: string
          etiquetas?: string[]
          id?: string
          nombre: string
          rut?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          acepta_marketing?: boolean
          created_at?: string
          email?: string
          etiquetas?: string[]
          id?: string
          nombre?: string
          rut?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      comunas: {
        Row: { nombre: string; region: string; zona_id: string }
        Insert: { nombre: string; region: string; zona_id: string }
        Update: { nombre?: string; region?: string; zona_id?: string }
        Relationships: [
          {
            foreignKeyName: "comunas_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas_envio"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion: {
        Row: {
          direccion_retiro: string | null
          email_contacto: string | null
          id: number
          minutos_expiracion_pedido: number
          nombre_tienda: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          direccion_retiro?: string | null
          email_contacto?: string | null
          id?: number
          minutos_expiracion_pedido?: number
          nombre_tienda: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          direccion_retiro?: string | null
          email_contacto?: string | null
          id?: number
          minutos_expiracion_pedido?: number
          nombre_tienda?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      juegos: {
        Row: { color: string | null; id: string; nombre: string; orden: number }
        Insert: { color?: string | null; id: string; nombre: string; orden?: number }
        Update: { color?: string | null; id?: string; nombre?: string; orden?: number }
        Relationships: []
      }
      movimientos_stock: {
        Row: {
          autor_id: string | null
          cambio: number
          carga_id: string | null
          created_at: string
          id: string
          motivo: Database["public"]["Enums"]["motivo_stock"]
          nota: string | null
          pedido_id: string | null
          stock_resultante: number
          variante_id: string
        }
        Insert: {
          autor_id?: string | null
          cambio: number
          carga_id?: string | null
          created_at?: string
          id?: string
          motivo: Database["public"]["Enums"]["motivo_stock"]
          nota?: string | null
          pedido_id?: string | null
          stock_resultante: number
          variante_id: string
        }
        Update: {
          autor_id?: string | null
          cambio?: number
          carga_id?: string | null
          created_at?: string
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_stock"]
          nota?: string | null
          pedido_id?: string | null
          stock_resultante?: number
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_imagenes: {
        Row: {
          alt: string | null
          created_at: string
          es_principal: boolean
          id: string
          orden: number
          producto_id: string
          storage_path: string
          variante_id: string | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id: string
          storage_path: string
          variante_id?: string | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          es_principal?: boolean
          id?: string
          orden?: number
          producto_id?: string
          storage_path?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_imagenes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_imagenes_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "producto_variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_variantes: {
        Row: {
          acabado: string
          created_at: string
          estado_carta: Database["public"]["Enums"]["estado_carta"] | null
          id: string
          idioma: string
          limite_por_pedido: number | null
          peso_gramos: number | null
          precio: number
          precio_oferta: number | null
          producto_id: string
          sku: string
          stock: number
          stock_minimo: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          acabado?: string
          created_at?: string
          estado_carta?: Database["public"]["Enums"]["estado_carta"] | null
          id?: string
          idioma?: string
          limite_por_pedido?: number | null
          peso_gramos?: number | null
          precio: number
          precio_oferta?: number | null
          producto_id: string
          sku: string
          stock?: number
          stock_minimo?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          acabado?: string
          created_at?: string
          estado_carta?: Database["public"]["Enums"]["estado_carta"] | null
          id?: string
          idioma?: string
          limite_por_pedido?: number | null
          peso_gramos?: number | null
          precio?: number
          precio_oferta?: number | null
          producto_id?: string
          sku?: string
          stock?: number
          stock_minimo?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "producto_variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          created_at: string
          descripcion: string | null
          destacado: boolean
          fecha_lanzamiento: string | null
          id: string
          juego_id: string
          nombre: string
          numero_carta: string | null
          rareza: string | null
          set_id: string | null
          slug: string
          tipo: Database["public"]["Enums"]["tipo_producto"]
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          destacado?: boolean
          fecha_lanzamiento?: string | null
          id?: string
          juego_id: string
          nombre: string
          numero_carta?: string | null
          rareza?: string | null
          set_id?: string | null
          slug: string
          tipo: Database["public"]["Enums"]["tipo_producto"]
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          destacado?: boolean
          fecha_lanzamiento?: string | null
          id?: string
          juego_id?: string
          nombre?: string
          numero_carta?: string | null
          rareza?: string | null
          set_id?: string | null
          slug?: string
          tipo?: Database["public"]["Enums"]["tipo_producto"]
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "productos_juego_id_fkey"
            columns: ["juego_id"]
            isOneToOne: false
            referencedRelation: "juegos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "sets"
            referencedColumns: ["id"]
          },
        ]
      }
      sets: {
        Row: { codigo: string | null; fecha_lanzamiento: string | null; id: string; juego_id: string; nombre: string }
        Insert: { codigo?: string | null; fecha_lanzamiento?: string | null; id?: string; juego_id: string; nombre: string }
        Update: { codigo?: string | null; fecha_lanzamiento?: string | null; id?: string; juego_id?: string; nombre?: string }
        Relationships: [
          {
            foreignKeyName: "sets_juego_id_fkey"
            columns: ["juego_id"]
            isOneToOne: false
            referencedRelation: "juegos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cancelado_en: string | null; cliente_id: string; contacto_email: string; contacto_nombre: string; contacto_telefono: string
          costo_envio: number; created_at: string; cupon_codigo: string | null; descuento: number; documento_emitido_en: string | null
          documento_numero: string | null; entregado_en: string | null; enviado_en: string | null; envio_calle: string | null
          envio_comuna: string | null; envio_depto: string | null; envio_destinatario: string | null; envio_numero: string | null
          envio_referencias: string | null; envio_region: string | null; envio_telefono: string | null
          estado: Database["public"]["Enums"]["estado_pedido"]; expira_en: string | null; factura_direccion: string | null
          factura_giro: string | null; factura_razon_social: string | null; factura_rut: string | null; id: string
          listo_retiro_en: string | null; metodo_entrega: Database["public"]["Enums"]["metodo_entrega"]; motivo_cancelacion: string | null
          mp_preference_id: string | null; nota_cliente: string | null; nota_interna: string | null; numero: number
          numero_seguimiento: string | null; pagado_en: string | null; retiro_nombre: string | null; subtotal: number
          tipo_documento: Database["public"]["Enums"]["tipo_documento"]; token_publico: string; total: number
          transportista: string | null; updated_at: string; zona_id: string | null
        }
        Insert: { cliente_id: string; contacto_email: string; contacto_nombre: string; contacto_telefono: string; metodo_entrega: Database["public"]["Enums"]["metodo_entrega"]; subtotal: number; [k: string]: unknown }
        Update: {
          estado?: Database["public"]["Enums"]["estado_pedido"]; transportista?: string | null; numero_seguimiento?: string | null
          motivo_cancelacion?: string | null; nota_interna?: string | null; documento_numero?: string | null; documento_emitido_en?: string | null
        }
        Relationships: [
          { foreignKeyName: "pedidos_cliente_id_fkey"; columns: ["cliente_id"]; isOneToOne: false; referencedRelation: "clientes"; referencedColumns: ["id"] },
        ]
      }
      pedido_items: {
        Row: {
          acabado: string | null; cantidad: number; es_preventa: boolean; estado_carta: Database["public"]["Enums"]["estado_carta"] | null
          fecha_lanzamiento: string | null; id: string; idioma: string | null; juego: string; nombre: string; numero_carta: string | null
          pedido_id: string; precio_unitario: number; set_nombre: string | null; sku: string; subtotal: number | null
          tipo: Database["public"]["Enums"]["tipo_producto"]; variante_id: string | null
        }
        Insert: { pedido_id: string; variante_id: string; cantidad: number }
        Update: { [_ in never]: never }
        Relationships: [
          { foreignKeyName: "pedido_items_pedido_id_fkey"; columns: ["pedido_id"]; isOneToOne: false; referencedRelation: "pedidos"; referencedColumns: ["id"] },
        ]
      }
      pagos: {
        Row: {
          created_at: string; estado: Database["public"]["Enums"]["estado_pago"]; id: string; monto: number; pedido_id: string
          proveedor: Database["public"]["Enums"]["proveedor_pago"]; proveedor_pago_id: string; reembolsado_en: string | null
          respuesta: Json; updated_at: string
        }
        Insert: { [_ in never]: never }
        Update: { estado?: Database["public"]["Enums"]["estado_pago"]; reembolsado_en?: string | null }
        Relationships: [
          { foreignKeyName: "pagos_pedido_id_fkey"; columns: ["pedido_id"]; isOneToOne: false; referencedRelation: "pedidos"; referencedColumns: ["id"] },
        ]
      }
      pedido_eventos: {
        Row: {
          autor_id: string | null; created_at: string; estado_anterior: Database["public"]["Enums"]["estado_pedido"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_pedido"]; id: string; nota: string | null; pedido_id: string; visible_cliente: boolean
        }
        Insert: {
          autor_id?: string | null; estado_anterior?: Database["public"]["Enums"]["estado_pedido"] | null
          estado_nuevo: Database["public"]["Enums"]["estado_pedido"]; nota?: string | null; pedido_id: string; visible_cliente?: boolean
        }
        Update: { [_ in never]: never }
        Relationships: [
          { foreignKeyName: "pedido_eventos_pedido_id_fkey"; columns: ["pedido_id"]; isOneToOne: false; referencedRelation: "pedidos"; referencedColumns: ["id"] },
        ]
      }
      notificaciones: {
        Row: {
          canal: string; created_at: string; destinatario: string; enviada_en: string | null; estado: string; id: string
          intentos: number; pedido_id: string; tipo: string; ultimo_error: string | null
        }
        Insert: { [_ in never]: never }
        Update: { [_ in never]: never }
        Relationships: [
          { foreignKeyName: "notificaciones_pedido_id_fkey"; columns: ["pedido_id"]; isOneToOne: false; referencedRelation: "pedidos"; referencedColumns: ["id"] },
        ]
      }
      staff: {
        Row: { activo: boolean; created_at: string; nombre: string; rol: Database["public"]["Enums"]["rol_staff"]; user_id: string }
        Insert: { activo?: boolean; created_at?: string; nombre: string; rol?: Database["public"]["Enums"]["rol_staff"]; user_id: string }
        Update: { activo?: boolean; created_at?: string; nombre?: string; rol?: Database["public"]["Enums"]["rol_staff"]; user_id?: string }
        Relationships: []
      }
    }
    Views: {
      v_alertas: {
        Row: { created_at: string | null; detalle: string | null; numero: number | null; pedido_id: string | null; tipo: string | null }
        Relationships: []
      }
      v_ventas_diarias: {
        Row: { dia: string | null; pedidos: number | null; total: number | null }
        Relationships: []
      }
    }
    Functions: {
      importar_variantes: {
        Args: { p_archivo: string; p_modo: string; p_filas: Json; p_simular?: boolean }
        Returns: Json
      }
      confirmar_transferencia: {
        Args: { p_monto: number; p_pedido: string; p_referencia: string }
        Returns: string
      }
    }
    Enums: {
      estado_carta: "NM" | "LP" | "MP" | "HP" | "DMG"
      estado_pago: "pendiente" | "aprobado" | "rechazado" | "reembolsado" | "requiere_reembolso" | "requiere_revision"
      estado_pedido: "pendiente_pago" | "pagado" | "preparando" | "listo_para_retiro" | "enviado" | "entregado" | "cancelado"
      metodo_entrega: "retiro" | "envio_santiago" | "envio_regiones"
      proveedor_pago: "mercadopago" | "webpay" | "transferencia"
      tipo_documento: "boleta" | "factura"
      motivo_stock: "reserva" | "liberacion" | "cancelacion" | "reactivacion" | "carga_excel" | "ajuste_manual"
      rol_staff: "dueno" | "vendedor"
      tipo_producto: "sellado" | "single" | "accesorio" | "preventa"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicSchema = Database["public"]
export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
