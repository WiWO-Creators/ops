/**
 * Reglas de "Mis Tareas": de donde viene cada asignacion y como se pide cada mitad de la hoja.
 *
 * === Por que hacen falta dos consultas y no una ===
 *
 * La hoja separa lo que cuelga de un Espacio de lo que no, y esa separacion la hace el BACKEND, no
 * un filtrado en el navegador: con paginacion, partir la pagina que llego significaria mostrar "12
 * de 340" sobre un recuento que no es el de ninguna de las dos listas. `project_id` esta declarado
 * como filtro de `GET /tasks` —la expresion `CASE WHEN rel_type = "project" THEN rel_id END`— y el
 * nucleo de la API acepta los operadores `__empty` / `__not_empty` sobre cualquier filtro declarado,
 * asi que las dos mitades salen de la misma whitelist y cada una trae su propio total.
 *
 * === Licitacion contra Proyecto ===
 *
 * No hay nada en la Tarea que lo diga: una Licitacion **es** un Espacio (misma fila, mismo id), asi
 * que sus Tareas llegan con `rel_type = "project"` igual que las de un Proyecto. La unica forma de
 * distinguirlas es preguntarle a `GET /licitaciones` que ids de Espacio son suyos, y eso es lo que
 * recibe `origenDeTarea` como conjunto. Sin la lista —la instalacion no tiene el modulo, o la API
 * respondio 403— todo se lee como Proyecto, que es exactamente como se leia antes.
 *
 * === Privada no es huerfana ===
 *
 * Una Tarea **privada** es la que no cuelga de ningun Espacio y tiene dueño; en esta hoja el dueño
 * es siempre quien mira, porque toda la hoja va filtrada por `assignee`. Una Tarea **huerfana** es
 * la que no tiene Espacio NI responsable, y por eso ninguna de las privadas lo es. La distincion no
 * se toca aca: esto solo nombra el origen de lo que ya esta asignado.
 */
import { GLOSARIO } from './glosario.ts'
import { hoyLocal, sumarDias } from '../lib/fechas.ts'
import type { Proceso } from '@/datos/recursos'

/** Deja solo las Tareas que cuelgan de un Espacio —Proyectos y Licitaciones—. */
export const SOLO_CON_ESPACIO = 'filter[project_id__not_empty]=1'

/** Deja solo las que no cuelgan de ninguno: las privadas. */
export const SOLO_SIN_ESPACIO = 'filter[project_id__empty]=1'

/** Como se anota en la URL de la hoja que tambien se quieren ver las completadas. */
export const PARAMETRO_COMPLETADAS = 'completadas'

/**
 * El fragmento que suma las completadas a una lista, sin quitarle las abiertas.
 *
 * `GET /tasks` esconde las completadas salvo que viaje un filtro de `status` o de `completed`
 * (`RecursoProcesos::listar()`), y `completed` es un filtro declarado del recurso: la expresion
 * `CASE WHEN status = 5 THEN 1 ELSE 0 END`. Por eso la lista de dos valores —`0,1`, que el nucleo
 * traduce a `IN (0, 1)`— es la unica forma de decir "todas": `filter[completed]=1` traeria SOLO las
 * completadas, y `filter[status]` con el catalogo entero se desactualizaria cada vez que el panel
 * agregue un estado.
 *
 * Que las completadas aparezcan JUNTO a las abiertas, y no en una lista aparte, es lo que resuelve
 * el caso que pidio el interruptor: una Tarea cerrada por error se corrige donde estaba, sin tener
 * que adivinar en que lista quedo.
 */
export const CON_COMPLETADAS = 'filter[completed]=0,1'

/**
 * Si la consulta de la URL pide ver tambien las completadas.
 *
 * @param params la consulta vigente de la hoja
 * @returns `true` solo con el valor exacto que escribe el interruptor; cualquier otro se ignora en
 *          vez de encenderlo, para que un `?completadas=0` pegado a mano no muestre lo contrario de
 *          lo que dice
 */
export function seVenCompletadas (params: URLSearchParams): boolean {
  return params.get(PARAMETRO_COMPLETADAS) === '1'
}

/**
 * Enciende o apaga las completadas en la consulta de la URL.
 *
 * Es el mismo gesto que `alternarCompletados` en `/procesos` —el estado vive en la URL y se conserva
 * lo demas—, pero no puede ser la misma funcion: alla el parametro ES el filtro que viaja a la API
 * (`filter[status]=5`, que muestra SOLO las completadas) porque la consulta de la tabla se arma
 * desde la URL. Aca la URL es de la pantalla, las dos listas arman su propia consulta, y lo que hace
 * falta es lo contrario: no acotar a las completadas sino sumarlas. La pagina no se toca aca porque
 * no viaja en la URL: la reinicia `TareasAsignadas` al ver que su consulta cambio.
 *
 * @param params la consulta vigente; no se modifica
 * @returns una consulta nueva, con el interruptor al reves
 */
export function alternarCompletadas (params: URLSearchParams): URLSearchParams {
  const siguientes = new URLSearchParams(params)

  if (seVenCompletadas(params)) {
    siguientes.delete(PARAMETRO_COMPLETADAS)
  } else {
    siguientes.set(PARAMETRO_COMPLETADAS, '1')
  }

  return siguientes
}

/**
 * De donde viene una Tarea.
 *
 * `otro` es el caso raro y no un error: una Tarea colgada de un Cliente o de un Ticket —relaciones
 * que Perfex admite y este panel no crea— tampoco tiene Espacio, pero llamarla privada seria mentir.
 */
export type ClaseDeOrigen = 'licitacion' | 'espacio' | 'privada' | 'otro'

export interface OrigenDeTarea {
  clase: ClaseDeOrigen
  /** Que es, para la insignia: "Licitación", "Proyecto", "Privada". */
  tipo: string
  /** Como se llama el Espacio del que cuelga, o `null` cuando no cuelga de ninguno. */
  nombre: string | null
  /** Ficha del origen, o `null` cuando no hay nada que abrir. */
  href: string | null
}

/**
 * Nombra el origen de una Tarea para la columna "Origen".
 *
 * @param tarea La Tarea tal como la devuelve `GET /tasks`.
 * @param licitaciones Ids de Espacio que son Licitaciones. Vacio = todo Espacio se lee como Proyecto.
 * @returns Que es el origen, como se llama y a donde lleva.
 */
export function origenDeTarea (tarea: Proceso, licitaciones: ReadonlySet<number>): OrigenDeTarea {
  const espacio = tarea.project

  if (espacio !== null) {
    const esLicitacion = licitaciones.has(espacio.id)

    return {
      clase: esLicitacion ? 'licitacion' : 'espacio',
      tipo: esLicitacion ? GLOSARIO.licitacion.singular : GLOSARIO.espacio.singular,
      nombre: espacio.name,
      href: esLicitacion ? `/licitaciones/${espacio.id}` : `/proyectos/${espacio.id}`
    }
  }

  // Sin relacion de ningun tipo: es de quien la tiene asignada y de nadie mas.
  if (tarea.rel_type === null || tarea.rel_type === '') {
    return { clase: 'privada', tipo: 'Privada', nombre: null, href: null }
  }

  return {
    clase: 'otro',
    tipo: `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`,
    nombre: null,
    href: null
  }
}

/**
 * === Filtro por vencimiento ===
 *
 * Hoy, Vencidas, Esta semana o Todas. Los dos primeros son EXACTAMENTE los tramos "Hoy" y
 * "Vencidos" de "Mi trabajo" en el Inicio (`agruparPorVencimiento`), que clasifica con
 * `estadoVencimiento` de `lib/fechas`: se cuentan por dia calendario local, no por instante, y
 * `pruebas/navegacion.test.js` falla si los dos lugares dejan de decir lo mismo.
 *
 * El filtro viaja a la API y no se aplica en el navegador: la hoja pagina, y filtrar una pagina
 * ya cortada mostraria "3 de 40" sobre un total que no es de nadie. `due_date` es un filtro
 * declarado de `GET /tasks` con tipo fecha, asi que admite `__lt`, `__gte`, `__lte` y `__not_empty`.
 */

/** Como se anota el filtro en la URL de la hoja. */
export const PARAMETRO_VENCIMIENTO = 'vence'

/** Los filtros, en el orden en que se ofrecen. `todas` es la ausencia de filtro. */
export const FILTROS_DE_VENCIMIENTO = ['hoy', 'vencidas', 'semana', 'todas'] as const

export type FiltroDeVencimiento = typeof FILTROS_DE_VENCIMIENTO[number]

export const ETIQUETAS_DE_VENCIMIENTO: Record<FiltroDeVencimiento, string> = {
  hoy: 'Hoy',
  vencidas: 'Vencidas',
  semana: 'Esta semana',
  todas: 'Todas'
}

/**
 * El filtro vigente segun la URL. Cualquier valor desconocido vale `todas`: un enlace viejo o
 * escrito a mano no puede dejar la hoja vacia sin explicacion.
 *
 * @param params la consulta de la hoja
 * @returns el filtro
 */
export function filtroDeVencimiento (params: URLSearchParams): FiltroDeVencimiento {
  const valor = params.get(PARAMETRO_VENCIMIENTO)

  return (FILTROS_DE_VENCIMIENTO as readonly string[]).includes(valor ?? '') ? valor as FiltroDeVencimiento : 'todas'
}

/**
 * La consulta con otro filtro de vencimiento, conservando lo demas (`completadas`, `tarea`).
 *
 * @param params la consulta vigente; no se modifica
 * @param filtro el filtro nuevo
 * @returns una consulta nueva; `todas` quita el parametro para que la URL por defecto quede limpia
 */
export function conFiltroDeVencimiento (params: URLSearchParams, filtro: FiltroDeVencimiento): URLSearchParams {
  const siguientes = new URLSearchParams(params)

  if (filtro === 'todas') siguientes.delete(PARAMETRO_VENCIMIENTO)
  else siguientes.set(PARAMETRO_VENCIMIENTO, filtro)

  return siguientes
}

/**
 * Dias que faltan para el domingo, contando hoy como cero. La semana de la casa va de lunes a
 * domingo: "Esta semana" un viernes es viernes, sabado y domingo.
 *
 * @param hoy dia de referencia
 * @returns de 0 (domingo) a 6 (lunes)
 */
export function diasHastaElDomingo (hoy: Date): number {
  return (7 - hoy.getDay()) % 7
}

/**
 * El fragmento de `GET /tasks` que aplica el filtro, sin el `&` inicial.
 *
 * - `vencidas`: vencimiento anterior a hoy. `__not_empty` deja afuera la fecha cero con la que esta
 *   base guarda "sin plazo" (`0000-00-00`), que para la comparacion seria anterior a cualquier dia.
 * - `hoy`: vence hoy.
 * - `semana`: de hoy al domingo, sin las vencidas —esas tienen su propio filtro—.
 *
 * @param filtro el filtro vigente
 * @param hoy dia de referencia, inyectable para probar
 * @returns el fragmento, o `null` con `todas`
 */
export function consultaDeVencimiento (filtro: FiltroDeVencimiento, hoy: Date = new Date()): string | null {
  const dia = hoyLocal(hoy)

  if (filtro === 'vencidas') return `filter[due_date__lt]=${dia}&filter[due_date__not_empty]=1`
  if (filtro === 'hoy') return `filter[due_date]=${dia}`
  if (filtro === 'semana') {
    const domingo = sumarDias(dia, diasHastaElDomingo(hoy)) ?? dia
    return `filter[due_date__gte]=${dia}&filter[due_date__lte]=${domingo}`
  }
  return null
}
