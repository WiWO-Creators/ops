import { GLOSARIO } from './glosario.ts'

/**
 * Navegacion del portal del cliente.
 *
 * Vive aca y no dentro del layout por la misma razon que el resto de la logica del proyecto: es la
 * decision de que ve cada contacto, y una decision asi se prueba. El layout solo la dibuja.
 */

export interface SeccionPortal {
  /** Clave que devuelve `/portal/me` en `secciones_habilitadas`. */
  clave: string
  href: string
  etiqueta: string
}

/**
 * Catalogo completo, en el orden en que se muestra.
 *
 * El orden replica el del menu de Perfex (`add_default_theme_menu_items`): proyectos primero, las
 * secciones de venta despues, soporte y contenido al final. Los rotulos salen del glosario donde
 * existen, para no tener dos nombres para la misma cosa segun la pantalla.
 */
const CATALOGO: SeccionPortal[] = [
  { clave: 'projects', href: '/portal/proyectos', etiqueta: GLOSARIO.espacio.plural },
  { clave: 'invoices', href: '/portal/facturas', etiqueta: GLOSARIO.factura.plural },
  { clave: 'estimates', href: '/portal/presupuestos', etiqueta: GLOSARIO.presupuesto.plural },
  { clave: 'proposals', href: '/portal/propuestas', etiqueta: GLOSARIO.propuesta.plural },
  { clave: 'contracts', href: '/portal/contratos', etiqueta: GLOSARIO.contrato.plural },
  { clave: 'subscriptions', href: '/portal/suscripciones', etiqueta: GLOSARIO.suscripcion.plural },
  { clave: 'support', href: '/portal/soporte', etiqueta: GLOSARIO.ticket.plural },
  { clave: 'files', href: '/portal/archivos', etiqueta: 'Archivos' },
  { clave: 'announcements', href: '/portal/anuncios', etiqueta: 'Anuncios' },
  { clave: 'kb', href: '/portal/ayuda', etiqueta: 'Ayuda' }
]

/**
 * Filtra el catalogo por lo que la API dijo que este contacto puede ver.
 *
 * Se parte de `secciones_habilitadas` y no de `permissions` a proposito: hay secciones que no
 * dependen de ningun permiso (archivos, anuncios, ayuda) y hay permisos que no son una seccion del
 * menu. La API ya resolvio esa mezcla; el frontend no la vuelve a resolver.
 *
 * Una clave desconocida se ignora en silencio: si la API suma una seccion antes que el frontend, la
 * navegacion no se rompe.
 */
export function seccionesDelPortal (habilitadas: readonly string[]): SeccionPortal[] {
  return CATALOGO.filter((s) => habilitadas.includes(s.clave))
}

export { CATALOGO as CATALOGO_PORTAL }
