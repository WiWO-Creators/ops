import { GLOSARIO } from '../../dominio/glosario.ts'
import {
  leerBloqueos, leerEspera, type BloqueoLeido, type LecturaDeEspera
} from './resumen.ts'
import type {
  BloqueoDelResumen,
  EspacioPortal,
  HitoProximoDelResumen,
  ProcesosDelResumen,
  ResumenPortal
} from '../../datos/portal.ts'

/**
 * Como se lee el estado de los {espacios} del cliente antes de dibujarlo.
 *
 * Hermano de `resumen.ts` y por la misma razon: acá viven las DECISIONES —que significa un numero,
 * que significa que un dato no venga, que fila necesita atencion antes que otra— y el `.tsx` de al
 * lado solo las dibuja. Una decision se prueba (`pruebas/portal-estado.test.js`); un `<div>` no.
 *
 * Lo que esta pantalla agrega sobre la portada es el CRUCE: la portada tiene los numeros de todos
 * los {espacios} juntos, y acá cada {espacio} se mira con su avance, su proximo {hito} y lo que
 * tenga trabado. Ese cruce es de tres listas que la API manda por separado y que no siempre estan
 * completas, asi que es justo donde se puede inventar un dato sin darse cuenta.
 *
 * Las ausencias se respetan como en `resumen.ts`: `procesos` y `bloqueados` pueden NO VENIR como
 * clave, y ausente no es lista vacia. `esperando_tu_respuesta` y `dias_bloqueada` pueden ser `null`,
 * y un `null` no se pinta como 0.
 */

/**
 * Cuantos {espacios} pide la pantalla de una vez.
 *
 * Es un tope y no una pagina: el bloque de avance dibuja TODOS los {espacios} del cliente, asi que
 * pedir de a cinco —como la portada— dejaria la mitad afuera sin decirlo. El tope existe igual
 * porque la API pagina y un cliente con cientos de {espacios} no tiene que recibirlos todos para
 * mirar una pantalla; cuando el tope corta, {@link contarEnCurso} lo detecta y la pantalla lo dice
 * en vez de contar sobre lo que llego.
 */
export const TOPE_DE_ESPACIOS = 100

/**
 * Lo trabado que depende del cliente, en sus tres lecturas.
 *
 * `ninguna` cubre DOS situaciones que para este bloque son la misma: que no haya nada trabado, y
 * que lo trabado dependa del equipo o de un tercero. Las dos significan «acá no tenés nada que
 * hacer», que es la unica pregunta que este bloque contesta. Lo que depende de nosotros no
 * desaparece de la pantalla: lo lista «Qué está trabado» mas abajo, que es donde informa sin pedir
 * nada.
 */
export type LecturaDeTrabasPropias =
  | { clase: 'no_se_sabe' }
  | { clase: 'ninguna' }
  | { clase: 'tuyas', filas: BloqueoLeido[] }

/**
 * Decide que parte de lo trabado le toca resolver al cliente.
 *
 * Se apoya en `leerBloqueos()` en vez de mirar `responsable` por su cuenta: esa funcion ya distingue
 * la clave ausente de la lista vacia y ya marca cada fila con `deTuLado`. Dos lugares decidiendo lo
 * mismo es como una pantalla empieza a contradecir a la otra.
 *
 * @param lista `bloqueados` tal como llego; `undefined` es la clave que no vino
 * @returns la lectura que le toca
 */
export function leerTrabasPropias (
  lista: readonly BloqueoDelResumen[] | null | undefined
): LecturaDeTrabasPropias {
  const bloqueos = leerBloqueos(lista)

  if (bloqueos.clase === 'no_se_sabe') return { clase: 'no_se_sabe' }
  if (bloqueos.clase === 'sin_bloqueos') return { clase: 'ninguna' }

  const filas = bloqueos.filas.filter((fila) => fila.deTuLado)

  return filas.length === 0 ? { clase: 'ninguna' } : { clase: 'tuyas', filas }
}

/**
 * Lo unico accionable de la pantalla: que espera una decision del cliente.
 *
 * Son dos fuentes distintas —las aprobaciones pendientes y lo trabado de su lado— y viajan juntas
 * porque responden a la misma pregunta. Las dos banderas existen para que el componente no tenga
 * que volver a razonar sobre las dos lecturas: `hayAlgoQueHacer` decide el tono de la tarjeta y
 * `hayAlgoQueNoSeSabe` decide si ademas se escribe la salvedad.
 */
export interface LoQueNecesitaAlCliente {
  /** {Procesos} esperando su visto bueno. `no_se_sabe` jamas se dibuja como 0. */
  aprobaciones: LecturaDeEspera
  /** Lo trabado que solo el cliente puede destrabar. */
  trabas: LecturaDeTrabasPropias
  /** Si hay algo que exige una accion suya hoy. */
  hayAlgoQueHacer: boolean
  /** Si alguna de las dos mitades no se pudo averiguar. */
  hayAlgoQueNoSeSabe: boolean
}

/**
 * Junta las dos cosas que la pantalla le puede pedir al cliente.
 *
 * Va arriba de todo porque es lo unico que le pide algo: si queda debajo del panorama, se lee
 * despues de cuatro numeros que no piden nada, y para entonces ya se desplazo la pantalla.
 *
 * Que las dos mitades puedan valer «no se sabe» de forma independiente es el motivo de que esto sea
 * una funcion y no un `&&` dentro del componente: con `esperando_tu_respuesta` en `null` y
 * `bloqueados` presente y vacio, lo honesto es decir «no tenés nada trabado, pero no podemos contar
 * las aprobaciones», y eso son dos frases y no un cartel verde.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`
 * @returns las dos lecturas y las dos banderas que el componente necesita
 */
export function leerLoQueNecesitaAlCliente (resumen: ResumenPortal): LoQueNecesitaAlCliente {
  const aprobaciones = leerEspera(resumen.esperando_tu_respuesta)
  const trabas = leerTrabasPropias(resumen.bloqueados)

  return {
    aprobaciones,
    trabas,
    hayAlgoQueHacer: aprobaciones.clase === 'pendiente' || trabas.clase === 'tuyas',
    hayAlgoQueNoSeSabe: aprobaciones.clase === 'no_se_sabe' || trabas.clase === 'no_se_sabe'
  }
}

/**
 * Cuantos {espacios} siguen abiertos, o por que no se puede afirmar.
 *
 * `incompleto` no es un detalle de paginacion: es el mismo error que `GET /portal/resumen` vino a
 * matar. Contar «en curso» sobre las filas que entraron en una pagina da un numero MENOR que el
 * verdadero y sin ninguna señal de que falta algo, que es peor que no dar el numero.
 */
export type LecturaDeEnCurso =
  | { clase: 'contados', enCurso: number, total: number }
  | { clase: 'incompleto', total: number }

/**
 * Si un {espacio} sigue abierto.
 *
 * Se mira `date_finished` y no `status` a proposito: los estados de {espacios} son un catalogo que
 * se edita desde el panel —se renombran, se agregan, se reordenan— asi que deducir «en curso» de un
 * id seria una regla que se rompe el dia que alguien toca una fila de configuracion, en silencio y
 * sin que nada falle. La fecha de cierre, en cambio, es un hecho.
 */
function estaEnCurso (espacio: EspacioPortal): boolean {
  return espacio.date_finished === null || espacio.date_finished.trim() === ''
}

/**
 * Cuenta los {espacios} abiertos, pero solo si estan todos.
 *
 * @param espacios las filas que llegaron de `GET /portal/projects`
 * @param total cuantos {espacios} existen de verdad, segun el agregado del servidor
 * @returns la cuenta, o el aviso de que la lista vino cortada
 */
export function contarEnCurso (
  espacios: readonly EspacioPortal[],
  total: number
): LecturaDeEnCurso {
  if (espacios.length < total) return { clase: 'incompleto', total }

  return { clase: 'contados', enCurso: espacios.filter(estaEnCurso).length, total }
}

/** Por que la pantalla no dice cuantos {espacios} estan en curso. */
export const MOTIVO_SIN_EN_CURSO
  = `Tenés más ${GLOSARIO.espacio.plural.toLowerCase()} de los que entran en esta pantalla, así que `
  + 'no podemos decirte cuántos siguen abiertos sin arriesgarnos a darte un número más chico que el '
  + 'real.'

/** Lo que se dice cuando el cliente no tiene ningun {espacio} compartido. */
export const MOTIVO_SIN_ESPACIOS
  = `Todavía no compartimos ningún ${GLOSARIO.espacio.singular.toLowerCase()} con vos. Cuando lo `
  + 'hagamos, acá vas a ver cómo va y qué necesita algo de tu parte.'

/** Las dos lecturas de los contadores de {procesos}, que dependen de una clave que puede no venir. */
export type LecturaDeProcesos =
  | { clase: 'no_se_sabe' }
  | { clase: 'sabido', abiertas: number, avance: number }

/**
 * Decide si se pueden dibujar los numeros de {procesos}.
 *
 * La clave `procesos` no llega cuando ningun {espacio} comparte esa pestaña, y ahi «0 abiertas» y
 * «0% de avance» le contarian al cliente, en forma de numero, la misma lista que la pantalla le
 * niega.
 *
 * @param procesos el bloque `procesos` del resumen, que puede no venir
 * @returns la lectura que le toca
 */
export function leerProcesos (procesos: ProcesosDelResumen | undefined): LecturaDeProcesos {
  if (procesos === undefined) return { clase: 'no_se_sabe' }

  return { clase: 'sabido', abiertas: procesos.open, avance: procesos.completed_percent }
}

/**
 * Que {hito} viene en un {espacio}, en las tres lecturas posibles.
 *
 * `fuera_de_lista` existe porque `proximos_hitos` llega RECORTADA por el servidor: un {espacio} que
 * no aparece ahi puede tener {hitos} igual, solo que mas lejos que los que entraron en la lista.
 * Dibujar esa fila como «sin {hitos}» seria afirmar algo que la respuesta no dice, y encima
 * contradecir a `counts.milestones`, que esta en la misma fila.
 */
export type LecturaDelProximoHito =
  | { clase: 'sin_hitos' }
  | { clase: 'fuera_de_lista' }
  | { clase: 'proximo', hito: HitoProximoDelResumen }

/** Lo que ocupa el lugar del {hito} cuando el {espacio} tiene pero ninguno entro en la lista. */
export const TEXTO_HITO_FUERA_DE_LISTA = 'Ninguno entre los más próximos'

/** Lo que ocupa el lugar del {hito} cuando el {espacio} no tiene ninguno comprometido. */
export const TEXTO_SIN_HITOS = `Sin ${GLOSARIO.hito.plural.toLowerCase()} comprometidos`

/**
 * Una fila del bloque de avance: un {espacio} con todo lo que hace falta para no abrirlo.
 *
 * `trabados` en `null` es «no se puede saber» y `[]` es «no hay nada trabado acá». La fila NO
 * escribe la diferencia —seria repetir la misma salvedad en cada renglon—: la escribe una sola vez
 * el bloque «Qué está trabado». Acá la distincion sirve para no poner la señal de trabado sobre un
 * {espacio} que nadie miro.
 */
export interface FilaDeAvance {
  espacio: EspacioPortal
  hito: LecturaDelProximoHito
  /** Lo trabado de este {espacio}. `null` es «no se puede saber»; `[]` es «no hay nada». */
  trabados: BloqueoLeido[] | null
  /** Si algo de lo trabado de este {espacio} depende del cliente. */
  esperaAlCliente: boolean
}

/**
 * En que orden se miran los {espacios}: primero los que necesitan atencion.
 *
 * Tres escalones y no una puntuacion: trabado, {hito} vencido, el resto. Un {espacio} trabado va
 * antes que uno con el {hito} vencido porque el trabado esta detenido HOY y el vencido ya paso; y
 * los dos van antes que los que andan bien, que es lo que el cliente puede mirar despues.
 */
function rangoDeAtencion (fila: FilaDeAvance): number {
  if (fila.trabados !== null && fila.trabados.length > 0) return 0
  if (fila.hito.clase === 'proximo' && fila.hito.hito.vencido) return 1

  return 2
}

/**
 * Cruza los {espacios} con sus {hitos} y con lo que tienen trabado, y los ordena por atencion.
 *
 * Es el corazon de la pantalla y el unico lugar donde tres respuestas distintas de la API se juntan
 * en una fila. Las tres tienen alcances distintos y eso es lo que hay que respetar: la lista de
 * {espacios} viene paginada, `proximos_hitos` viene recortada por el servidor, y `bloqueados` puede
 * no venir. Ninguna de las tres ausencias se rellena con un cero.
 *
 * De los {hitos} de un mismo {espacio} se toma el PRIMERO de la lista y no el minimo por fecha: el
 * servidor ya la manda por fecha ascendente, y recalcular el minimo acá daria otro resultado el dia
 * que la API cambie el criterio —dos ordenes distintos para la misma lista, uno en cada pantalla—.
 *
 * El reordenado es estable, asi que dentro de cada escalon se conserva el orden en que la API mando
 * los {espacios}: el cliente los ve en el mismo orden que en su listado, salvo los que subieron por
 * necesitar atencion.
 *
 * @param espacios las filas de `GET /portal/projects`
 * @param proximosHitos `proximos_hitos` del resumen, ya ordenados por fecha
 * @param bloqueados `bloqueados` del resumen; `undefined` es la clave que no vino
 * @returns una fila por {espacio}, con los que necesitan atencion primero
 */
export function filasDeAvance (
  espacios: readonly EspacioPortal[],
  proximosHitos: readonly HitoProximoDelResumen[],
  bloqueados: readonly BloqueoDelResumen[] | null | undefined
): FilaDeAvance[] {
  const porEspacio = new Map<number, HitoProximoDelResumen>()

  for (const hito of proximosHitos) {
    if (!porEspacio.has(hito.project.id)) porEspacio.set(hito.project.id, hito)
  }

  const lectura = leerBloqueos(bloqueados)
  const trabadosPorEspacio = lectura.clase === 'trabados'
    ? agruparPorEspacio(lectura.filas)
    : new Map<number, BloqueoLeido[]>()

  const filas = espacios.map((espacio) => {
    const trabados = lectura.clase === 'no_se_sabe'
      ? null
      : trabadosPorEspacio.get(espacio.id) ?? []

    return {
      espacio,
      hito: leerProximoHito(espacio, porEspacio.get(espacio.id)),
      trabados,
      esperaAlCliente: (trabados ?? []).some((bloqueo) => bloqueo.deTuLado)
    }
  })

  return filas.sort((uno, otro) => rangoDeAtencion(uno) - rangoDeAtencion(otro))
}

/**
 * Decide que {hito} se dibuja en la fila de un {espacio}.
 *
 * @param espacio el {espacio} de la fila, por su contador de {hitos}
 * @param hito el {hito} que le toco del cruce, si alguno
 * @returns la lectura que le toca
 */
function leerProximoHito (
  espacio: EspacioPortal,
  hito: HitoProximoDelResumen | undefined
): LecturaDelProximoHito {
  if (hito !== undefined) return { clase: 'proximo', hito }

  return espacio.counts.milestones > 0 ? { clase: 'fuera_de_lista' } : { clase: 'sin_hitos' }
}

/**
 * Como se dice cuantas {procesos} quedan abiertas en un {espacio}.
 *
 * El caso que justifica la funcion es `tasks: 0`. Ahi «0 de 0 abiertas» no es un avance perfecto:
 * es un {espacio} que no comparte su lista de {procesos}, o que todavia no tiene ninguna. Un cero
 * sobre cero se lee como «no queda nada por hacer», que es lo contrario de lo que pasa.
 *
 * @param counts el bloque `counts` del {espacio}
 * @returns la frase lista para mostrar
 */
export function textoDeTareasAbiertas (counts: EspacioPortal['counts']): string {
  const procesos = GLOSARIO.proceso.plural.toLowerCase()

  if (counts.tasks <= 0) return `Sin ${procesos} compartidas`

  return `${counts.tasks_open} de ${counts.tasks} ${procesos} abiertas`
}

/** Agrupa lo trabado por {espacio}, conservando el orden en que lo dejo `leerBloqueos()`. */
function agruparPorEspacio (filas: readonly BloqueoLeido[]): Map<number, BloqueoLeido[]> {
  const grupos = new Map<number, BloqueoLeido[]>()

  for (const bloqueo of filas) {
    const grupo = grupos.get(bloqueo.project.id)

    if (grupo === undefined) grupos.set(bloqueo.project.id, [bloqueo])
    else grupo.push(bloqueo)
  }

  return grupos
}
