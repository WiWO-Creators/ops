import { GLOSARIO } from '../../dominio/glosario.ts'
import type {
  EstadoDelResumen,
  FilaDeProximosDias,
  ProximosDiasDelResumen,
  TicketDelResumen,
  TicketsDelResumen
} from '../../datos/portal.ts'

/**
 * Como se leen los numeros de `GET /portal/resumen` antes de dibujarlos.
 *
 * Vive aparte del componente porque no es maquetado: es la decision de que significa cada numero, y
 * las dos decisiones que toma —cuando un `null` NO es un cero y cuando una clave que no vino no es
 * un cero— son justo las que la portada tenia mal. Una decision asi se prueba
 * (`pruebas/portal-resumen.test.js`), y un `<div>` no.
 */

/**
 * El desglose por estado, ordenado y sin tocar el arreglo de la API.
 *
 * El orden lo fija el catalogo (`order`) y no el orden en que la API los serializo: es el mismo que
 * el cliente ve en el filtro de su listado de {espacios}, y dos ordenes distintos para la misma
 * lista se leen como dos listas distintas. El desempate por `status` deja el resultado estable
 * aunque dos estados compartan `order`.
 *
 * Se devuelve una copia porque `sort` muta, y el arreglo que llega es el de la respuesta: ordenarlo
 * en el lugar cambiaria lo que vea cualquier otro bloque que lea el mismo resumen.
 *
 * @param estados `espacios.by_status` tal como llego
 * @returns una copia ordenada; los estados en cero se conservan
 */
export function ordenarEstados (estados: readonly EstadoDelResumen[]): EstadoDelResumen[] {
  return [...estados].sort((uno, otro) => uno.order - otro.order || uno.status - otro.status)
}

/**
 * Los tramos que la portada dibuja, en el orden en que se leen.
 *
 * El servidor arma tres —`vencido`, `hoy` y `proximo`— y la portada solo muestra los dos primeros:
 * el bloque se llama «Hoy» y lo que vence en los dias siguientes no entra. Lo que se deja afuera se
 * sigue contando en `restantes`, asi que no desaparece sin aviso.
 *
 * Los tramos vienen armados y ordenados del servidor, que es el único que ve todos los {espacios}.
 */
const TRAMOS_DE_PROXIMOS_DIAS = ['vencido', 'hoy'] as const

export type TramoDeProximosDias = typeof TRAMOS_DE_PROXIMOS_DIAS[number]

/**
 * Los rotulos de los tramos, en femenino porque el portal nombra «Tareas».
 *
 * El panel escribe «Vencidos» —habla de Procesos— y acá se escribe «Vencidas». No se comparten las
 * dos listas de etiquetas a proposito: son dos pantallas con dos glosarios de genero distinto, y
 * unificarlas obligaria a una de las dos a hablar mal.
 */
const ETIQUETAS_DE_TRAMO: Record<TramoDeProximosDias, string> = {
  vencido: 'Vencidas',
  hoy: 'Hoy'
}

/** Un tramo listo para dibujar: su rotulo y las filas que el servidor puso en el. */
export interface GrupoDeProximosDias {
  tramo: TramoDeProximosDias
  etiqueta: string
  /** Las filas tal como llegaron, sin reordenar: el orden es del servidor y es parte del dato. */
  filas: FilaDeProximosDias[]
}

/**
 * Las tres lecturas posibles del bloque «Hoy».
 *
 * `no_se_sabe` no es `sin_vencimientos`, y esa es la distincion que sostiene el bloque: la clave
 * `proximos_dias` **falta** cuando ningun {espacio} comparte la pestaña de {procesos} —la misma
 * puerta que `procesos` y `bloqueados`—, y ahi «no tenés nada por vencer» seria una afirmacion que
 * nadie puede hacer. Con la clave presente y los tramos vacios, en cambio, la afirmacion es
 * legitima: hay de donde contar y no hay nada vencido ni para hoy.
 */
export type LecturaDeProximosDias =
  | { clase: 'no_se_sabe' }
  | { clase: 'sin_vencimientos', restantes: number }
  | { clase: 'tramos', grupos: GrupoDeProximosDias[], restantes: number }

/**
 * Decide como se lee lo que el cliente tiene vencido o para hoy.
 *
 * Un tramo vacio no se devuelve: un encabezado «Vencidas» sobre una lista vacia se lee como un
 * error de carga. Es el mismo criterio de `agruparPorVencimiento()` en el panel.
 *
 * `restantes` sale del `total` del servidor menos lo que efectivamente se lista, y cubre dos
 * poblaciones a la vez: lo que vence despues de hoy y lo que el servidor recorto de cada tramo. Sin ese numero, un cliente con cuarenta {procesos} abiertos veria quince y creeria
 * que son todos.
 *
 * @param bloque `proximos_dias` tal como llego; `undefined` es la clave que no vino
 * @returns la lectura que le toca
 */
export function leerProximosDias (
  bloque: ProximosDiasDelResumen | null | undefined
): LecturaDeProximosDias {
  if (bloque === null || typeof bloque !== 'object') return { clase: 'no_se_sabe' }

  const grupos: GrupoDeProximosDias[] = TRAMOS_DE_PROXIMOS_DIAS
    .map((tramo) => ({
      tramo,
      etiqueta: ETIQUETAS_DE_TRAMO[tramo],
      filas: filasDelTramo(bloque[tramo])
    }))
    .filter((grupo) => grupo.filas.length > 0)

  const listadas = grupos.reduce((suma, grupo) => suma + grupo.filas.length, 0)
  const restantes = cuantasNoListadas(bloque.total, listadas)

  if (grupos.length === 0) return { clase: 'sin_vencimientos', restantes }

  return { clase: 'tramos', grupos, restantes }
}

/**
 * Las filas de un tramo, como copia propia.
 *
 * Se copia porque el arreglo que llega es el de la respuesta y lo comparten los tres bloques que
 * leen el mismo resumen: quedarse con la referencia deja que cualquier retoque futuro de esta
 * pantalla le cambie el dato a otra.
 *
 * @param filas el tramo tal como llego
 * @returns las filas, o vacio si el tramo no es una lista
 */
function filasDelTramo (filas: unknown): FilaDeProximosDias[] {
  return Array.isArray(filas) ? [...filas as FilaDeProximosDias[]] : []
}

/**
 * Cuantos {procesos} abiertos quedan fuera de lo que la portada lista.
 *
 * Un `total` que no sea un numero usable se lee como «no hay mas», y no como un negativo ni un
 * `NaN`: el pie de la seccion desaparece en vez de escribir un disparate.
 *
 * @param total `proximos_dias.total` tal como llego
 * @param listadas cuantas filas se dibujan de verdad
 * @returns cuantas no se listan; nunca negativo
 */
function cuantasNoListadas (total: unknown, listadas: number): number {
  if (typeof total !== 'number' || !Number.isFinite(total)) return 0

  return Math.max(0, Math.trunc(total) - listadas)
}

/**
 * Por que la portada no puede decir que vence en los proximos dias.
 *
 * Sin ningun {espacio} que comparta su lista de {procesos}
 * no hay de donde sacar vencimientos. Se dice asi y no con una lista vacia, que se leeria como
 * «estas al dia».
 */
export const MOTIVO_SIN_PROXIMOS_DIAS
  = `Lo que vence aparece cuando al menos un ${GLOSARIO.espacio.singular} comparte su lista de `
  + `${GLOSARIO.proceso.plural}. Que no lo veamos acá no significa que no haya nada en camino.`

/**
 * Las tres lecturas posibles del bloque de tickets.
 *
 * `sin_seccion` es la clave ausente y **no se dibuja nada**: significa que este contacto no tiene
 * la seccion de soporte, y un «no podemos decirte cuantos tickets tenés» sobre una seccion que ni
 * siquiera ve en el menu es ruido puro. Es la diferencia con `proximos_dias`, donde la ausencia si
 * se dibuja: alla el cliente SI tiene {espacios} y le falta un dato; aca no le falta nada.
 */
export type LecturaDeTickets =
  | { clase: 'sin_seccion' }
  | { clase: 'sin_tickets' }
  | { clase: 'tickets', filas: TicketDelResumen[], abiertos: number, esperando: number }

/**
 * Decide como se lee el bloque de tickets de la portada.
 *
 * `esperando` es el numero que la pantalla destaca: son los tickets cuyo ultimo mensaje es del
 * equipo, o sea los que estan detenidos del lado del cliente. Es lo unico de este bloque que le
 * pide una accion.
 *
 * Sin filas no hay bloque, igual que «En seguimiento» en el panel: una caja vacia con titulo se lee
 * como algo que fallo.
 *
 * @param bloque `tickets` tal como llego; `undefined` es la clave que no vino
 * @returns la lectura que le toca
 */
export function leerTickets (bloque: TicketsDelResumen | null | undefined): LecturaDeTickets {
  if (bloque === null || typeof bloque !== 'object') return { clase: 'sin_seccion' }

  const filas = Array.isArray(bloque.ultimos) ? [...bloque.ultimos] : []

  if (filas.length === 0) return { clase: 'sin_tickets' }

  return {
    clase: 'tickets',
    filas,
    abiertos: contar(bloque.abiertos),
    esperando: contar(bloque.esperando_tu_respuesta)
  }
}

/**
 * Un contador de la respuesta, saneado.
 *
 * Acá un valor ilegible SI cae en 0: las filas ya estan en pantalla y el contador solo las acompaña, asi que degradarlo esconde un acento, no un
 * hecho.
 *
 * @param valor el contador tal como llego
 * @returns el entero no negativo, o 0 si no hay numero usable
 */
function contar (valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return 0

  return Math.trunc(valor)
}
