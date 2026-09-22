/**
 * La carga de los dos catalogos que puede recibir una Tarea. Las reglas de mezcla viven en
 * `@/dominio/espacios-destino`.
 */
import { pedirRespuesta, pedirSobre } from './cliente.ts'
import {
  combinarDestinos, type EspaciosDestino, type LicitacionDestino
} from '../dominio/espacios-destino.ts'
import type { Referencia } from './recursos.ts'
import type { Sobre } from './tipos'

/**
 * Tope de la unica pagina que se pide de cada catalogo.
 *
 * Mismo criterio que `TOPE_DE_ASIGNABLES`: el selector del alta no pagina, asi que lo que no entre
 * en esta pagina se ve como "no existe".
 */
const TOPE = 500

/** Los Proyectos, tal como los pedia el alta antes de que las Licitaciones entraran al selector. */
export const RUTA_DE_PROYECTOS = `projects?per_page=${TOPE}`

/**
 * Las Licitaciones que siguen en juego.
 *
 * Solo `abierta`: la **ganada** ya aparece en `projects` —desde que se gana es un Espacio como
 * cualquier otro— y ofrecerla dos veces seria el mismo destino repetido; la **perdida** tiene su
 * Espacio archivado y nadie deberia estar pidiendo trabajo nuevo ahi.
 */
export const RUTA_DE_LICITACIONES = `licitaciones?filter[estado]=abierta&per_page=${TOPE}`

/**
 * Los destinos posibles de una Tarea: los Proyectos y las Licitaciones abiertas.
 *
 * POR QUE SON DOS PETICIONES. Una Licitacion **es** un Espacio (misma fila de `tblprojects`, mismo
 * id), pero `GET /projects` la esconde a proposito mientras no se gane: el Espacio de una
 * oportunidad comercial no pertenece a ningun listado de Proyectos, y esa condicion tambien tapa el
 * portal del cliente. Por eso el catalogo no se arregla en la API —relajarlo ahi le mostraria al
 * cliente la licitacion que le estan armando— sino sumando aca el listado que si las expone.
 *
 * SIN LICITACIONES SE SIGUE PUDIENDO CREAR. Si `GET /licitaciones` falla —la instalacion no tiene el
 * modulo, o quien mira no tiene permiso: responde 403— se devuelven solo los Proyectos, que es
 * exactamente lo que habia antes. Un alta de tarea no puede quedarse sin catalogo por una seccion
 * comercial que quien la usa quiza ni ve, y por eso ese fallo no se convierte en aviso: el error de
 * los Proyectos si se propaga, porque sin ellos el formulario no sirve.
 *
 * @param senal señal para abortar cuando el componente se desmonta
 * @returns la lista combinada y el conjunto de ids que son Licitacion
 * @throws Error con el mensaje del contrato si falla `GET /projects`
 */
export async function cargarEspaciosDestino (senal: AbortSignal): Promise<EspaciosDestino> {
  const [proyectos, licitaciones] = await Promise.all([
    pedirSobre<Referencia[]>(RUTA_DE_PROYECTOS, senal),
    licitacionesAbiertas(senal)
  ])

  return combinarDestinos(proyectos.data, licitaciones)
}

/**
 * Las Licitaciones abiertas, o ninguna si no se pudieron pedir.
 *
 * Se lee la respuesta cruda en vez de `pedirSobre` para no pasar por `mensajeDeRespuesta`, que ante
 * un error con incidente levanta el aviso flotante: aca un 403 es un caso previsto —no todo el mundo
 * ve la seccion comercial— y no algo que haya que reportar.
 *
 * @param senal señal para abortar cuando el componente se desmonta
 * @returns las licitaciones abiertas, o `[]` si la API no las dio
 */
async function licitacionesAbiertas (senal: AbortSignal): Promise<LicitacionDestino[]> {
  const respuesta = await pedirRespuesta(RUTA_DE_LICITACIONES, senal)

  if (!respuesta.ok) return []

  try {
    const sobre = await respuesta.json() as Sobre<LicitacionDestino[]>

    return sobre.data
  } catch {
    // Un cuerpo que no es el envelope no deja sin catalogo al formulario: se pierde el grupo de
    // Licitaciones y los Proyectos se ofrecen igual.
    return []
  }
}
