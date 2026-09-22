import { GLOSARIO } from './glosario.ts'
import type { YoPortal } from '@/datos/tipos'

/**
 * Navegacion del portal del cliente.
 *
 * Vive aca y no dentro del layout por la misma razon que el resto de la logica del proyecto: es la
 * decision de que ve cada contacto, y una decision asi se prueba. El layout solo la dibuja.
 */

export interface SeccionPortal {
  /**
   * Clave que devuelve `/portal/me` en `secciones_habilitadas`.
   *
   * Es la PUERTA de la entrada, no su identidad: varias entradas pueden compartirla cuando son
   * varias pantallas sobre el mismo recurso, y de hecho la comparten. La identidad es `href`, que
   * es lo unico que distingue dos destinos, y por eso es lo que se usa como clave de React.
   *
   * Nunca se inventa una clave que la API no emita: una entrada con una clave desconocida no se
   * enciende jamas —`seccionesDelPortal` la filtra— y se veria como un menu que le falta algo.
   */
  clave: string
  href: string
  etiqueta: string
}

/**
 * Catalogo completo, en el orden en que se muestra.
 *
 * El orden replica el del menu de Perfex (`add_default_theme_menu_items`): proyectos primero y
 * contenido al final. Los rotulos salen del glosario donde existen, para no tener dos nombres para
 * la misma cosa segun la pantalla.
 */
const CATALOGO: SeccionPortal[] = [
  // El estado de los {espacios}: como van y que necesita algo del cliente. Cuelga de la MISMA clave
  // que el listado —`projects`— y eso es deliberado: no es una seccion nueva del backend sino otra
  // lectura del mismo recurso, asi que la ve exactamente quien ya ve sus {espacios}. Inventarle una
  // clave propia habria dejado la entrada apagada para siempre, porque la API no la emitiria nunca.
  // Va primero porque es la pantalla que contesta "como vamos" sin abrir nada.
  { clave: 'projects', href: '/portal/estado', etiqueta: `Estado de ${GLOSARIO.espacio.plural}` },
  { clave: 'projects', href: '/portal/proyectos', etiqueta: GLOSARIO.espacio.plural },
  // El tablero mensual de la gerencia. Hoy la API NO devuelve `gestion` en `secciones_habilitadas`
  // —el interruptor `wiwo_portal_gestion` nace apagado en los 279 {espacios}— asi que esta entrada
  // todavia no ilumina nada, y eso es a proposito: el dia que la API publique la clave, el menu se
  // enciende solo y sin tocar el frontend. La alternativa era que el armazon probara
  // `/portal/gestion` en cada navegacion para decidir si dibujar un enlace, que le cobra el tablero
  // entero justo al contacto que SI lo tiene. Quien no lo tiene recibe el 404 de la API, que esta
  // hecho para ser indistinguible de una ruta inventada.
  { clave: 'gestion', href: '/portal/gestion', etiqueta: 'Control de gestión' },
  // **Soporte no tiene entrada, y es a proposito.** Los tickets se ven y se piden DENTRO del
  // {espacio}, en su pestaña `tickets`: un cliente no abre "una solicitud" en el aire, la abre sobre
  // algo que estamos haciendo para el. El listado y el alta generales se retiraron; lo unico que
  // sobrevive es `/portal/soporte/{id}`, el hilo de un ticket, que **no es una seccion** sino el
  // destino de los enlaces de la pestaña y de la portada. Tiene que seguir existiendo porque hay
  // tickets viejos sin `project_id` —no caben en ninguna pestaña— y sin esa ruta quedarian sin
  // pantalla donde abrirse.
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

/**
 * Con que nombre saludar al contacto en el inicio.
 *
 * El nombre de pila es lo natural, pero la API lo devuelve vacio cuando el contacto se cargo con el
 * nombre completo en un solo campo, y ahi el saludo quedaba en "Hola, ".
 *
 * @param yo el contacto tal como lo devuelve `/portal/me`
 * @returns el nombre de pila, o el nombre completo si no hay
 */
export function saludar (yo: Pick<YoPortal, 'firstname' | 'full_name'>): string {
  const pila = yo.firstname.trim()

  return pila === '' ? yo.full_name.trim() : pila
}
