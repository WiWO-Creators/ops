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
 * El orden replica el del menu de Perfex (`add_default_theme_menu_items`): proyectos primero,
 * soporte y contenido al final. Los rotulos salen del glosario donde existen, para no tener dos
 * nombres para la misma cosa segun la pantalla.
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
  { clave: 'support', href: '/portal/soporte', etiqueta: GLOSARIO.ticket.plural },
  { clave: 'files', href: '/portal/archivos', etiqueta: 'Archivos' }
  // **Anuncios y Ayuda no tienen entrada, y es a proposito.** Las dos secciones son contenido que
  // hoy nadie publica: el portal no las alimenta y el cliente solo encontraba pantallas vacias. Las
  // paginas siguen en pie —`/portal/anuncios` y `/portal/ayuda`, que la API sigue habilitando para
  // todo contacto— asi que devolver la entrada es sumar dos lineas acá el dia que haya algo que
  // leer. Lo que se retira es el enlace, no la seccion.
]

/**
 * Filtra el catalogo por lo que la API dijo que este contacto puede ver.
 *
 * Se parte de `secciones_habilitadas` y no de `permissions` a proposito: hay secciones que no
 * dependen de ningun permiso —archivos, y el contenido que hoy no se lista— y hay permisos que no
 * son una seccion del menu. La API ya resolvio esa mezcla; el frontend no la vuelve a resolver.
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

/** Donde entra un contacto cuando su cliente no tiene Proyecto de entrada elegido. */
export const INICIO_DEL_PORTAL = '/portal'

/**
 * La ruta exacta que puede devolver `POST /api/sesion` como destino: un Proyecto del portal.
 *
 * Es una lista blanca de UNA forma y no una validacion de "empieza con /portal": ese prefijo deja
 * pasar `//otro.sitio/portal`, que el navegador lee como otro dominio.
 */
const RUTA_DE_PROYECTO = /^\/portal\/proyectos\/\d+$/

/**
 * A donde mandar al contacto despues de entrar.
 *
 * El destino lo calcula el servidor —`/api/sesion` lo saca de `proyecto_de_entrada` de la API— y
 * aun asi se vuelve a comprobar aca antes de navegar. No es desconfianza del servidor propio: es
 * que este valor termina en `router.replace()`, y un unico lugar del sistema que mande al navegador
 * a donde diga una respuesta HTTP es un redirect abierto esperando a que alguien encuentre como
 * influir en esa respuesta. Comprobarlo cuesta una expresion regular.
 *
 * Cualquier cosa que no sea exactamente un Proyecto del portal cae al Inicio, que es un destino
 * valido: el contacto ya entro, y lo unico que se pierde es el atajo.
 *
 * @param destino lo que vino en el cuerpo de la respuesta, sin confiar en su tipo
 * @returns la ruta a la que navegar
 */
export function destinoDeEntrada (destino: unknown): string {
  return typeof destino === 'string' && RUTA_DE_PROYECTO.test(destino) ? destino : INICIO_DEL_PORTAL
}
