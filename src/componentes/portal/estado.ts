import { GLOSARIO } from '../../dominio/glosario.ts'
import { diasHasta } from '../../lib/fechas.ts'
import {
  leerBloqueos, leerEspera, type BloqueoLeido, type LecturaDeEspera
} from './resumen.ts'
import type { ResumenDeProyecto } from '../proyecto/overview.ts'
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
 * Cuantos {espacios} reciben ademas su pedido de detalle (`/portal/projects/{id}/overview`).
 *
 * El detalle es UN viaje por {espacio} —no hay endpoint que lo traiga para varios— y es lo que
 * aporta las dos cosas que la lista no sabe: cuantos {hitos} del {espacio} estan vencidos de verdad,
 * y cuanto queda del plazo. Vale la pena porque un cliente real tiene unos pocos {espacios}, pero
 * cien viajes en paralelo para pintar una pantalla no los vale.
 *
 * Pasado el tope, las tarjetas de mas abajo se dibujan con lo que trae la lista. No se rompe nada ni
 * se miente: es exactamente la misma tarjeta que le toca a un {espacio} que no comparte esa pestaña.
 */
export const TOPE_DE_DETALLES = 24

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
 * El `status` de un {espacio} terminado en Perfex (`tblprojects.status`).
 *
 * Es una constante del core y NO una fila de catalogo editable: los estados de {espacio} son un enum
 * fijo —1 no iniciado, 2 en progreso, 3 en espera, 4 terminado— y lo unico que el panel deja cambiar
 * de ellos son el nombre y el color. Por eso acá se puede razonar sobre el id, cosa que con los
 * estados de {proceso} —esos si son filas de una tabla— seria un error.
 *
 * Existe porque `date_finished` NO alcanza, y eso se vio en pantalla: llega en `null` tambien en los
 * {espacios} marcados como terminados, porque el panel viejo no siempre la escribe. Sin esta
 * constante, un {espacio} entregado con la fecha de compromiso ya pasada salia con «Entrega
 * vencida» en rojo, que es acusar de atraso a un trabajo que ya se entrego.
 */
const ESTADO_TERMINADO = 4

/** La fecha de cierre, o `null` si la fila no la trae. Perfex guarda cadenas vacias. */
function fechaDeCierre (espacio: EspacioPortal): string | null {
  const cierre = espacio.date_finished

  return typeof cierre === 'string' && cierre.trim() !== '' ? cierre : null
}

/**
 * Si un {espacio} ya esta cerrado.
 *
 * Dos señales y no una, porque ninguna de las dos sola alcanza: la fecha de cierre PRUEBA que se
 * cerro pero falta en filas viejas, y el estado terminado esta siempre pero no dice cuando. Con
 * cualquiera de las dos, el {espacio} deja de estar en curso y sus fechas dejan de acusar atraso.
 */
export function estaCerrado (espacio: EspacioPortal): boolean {
  return fechaDeCierre(espacio) !== null || espacio.status === ESTADO_TERMINADO
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

  return { clase: 'contados', enCurso: espacios.filter((uno) => !estaCerrado(uno)).length, total }
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
 * Que {hitos} vienen en un {espacio}, en las tres lecturas posibles.
 *
 * `fuera_de_lista` existe porque `proximos_hitos` llega RECORTADA por el servidor: un {espacio} que
 * no aparece ahi puede tener {hitos} igual, solo que mas lejos que los que entraron en la lista.
 * Dibujarlo como «sin {hitos}» seria afirmar algo que la respuesta no dice, y encima contradecir a
 * `counts.milestones`, que esta en la misma tarjeta.
 *
 * `proximos` lleva `total` al lado de `filas` por lo mismo: `filas` son los que entraron en la
 * lista y `total` los que el {espacio} tiene. Cuando no coinciden, la tarjeta dice «3 de 7» en vez
 * de dejar creer que son todos.
 */
export type LecturaDeHitosDelEspacio =
  | { clase: 'sin_hitos' }
  | { clase: 'fuera_de_lista', total: number }
  | {
      clase: 'proximos'
      /** Los que entraron en la lista del servidor, en su orden (por fecha ascendente). */
      filas: HitoProximoDelResumen[]
      /** Cuantos tiene el {espacio} en total, segun `counts.milestones`. */
      total: number
      /** Cuantos de los que se dibujan ya pasaron de fecha. */
      vencidos: number
    }

/** Lo que ocupa el lugar de los {hitos} cuando el {espacio} tiene pero ninguno entro en la lista. */
export const TEXTO_HITO_FUERA_DE_LISTA = 'Ninguno entre los más próximos'

/** Lo que ocupa el lugar de los {hitos} cuando el {espacio} no tiene ninguno comprometido. */
export const TEXTO_SIN_HITOS = `Sin ${GLOSARIO.hito.plural.toLowerCase()} comprometidos`

/**
 * Las dos lecturas de los contadores de {procesos} de un {espacio}.
 *
 * El caso que justifica el tipo es `tasks: 0`. Ahi «0 de 0 abiertas» no es un avance perfecto: es un
 * {espacio} que no comparte su lista de {procesos}, o que todavia no tiene ninguna. Un cero sobre
 * cero se lee como «no queda nada por hacer», que es lo contrario de lo que pasa.
 */
export type LecturaDeTareas =
  | { clase: 'sin_tareas' }
  | { clase: 'contadas', abiertas: number, completas: number, total: number }

/**
 * Las tres cuentas de {procesos} de un {espacio}, a partir de las dos que manda la API.
 *
 * `completas` se deriva y no llega: la API manda `tasks` y `tasks_open`, y la resta es lo que el
 * cliente quiere leer —«6 de 10 listas»—. Se acota en cero porque la resta puede dar negativa si las
 * dos cuentas se calcularon en momentos distintos, y «-2 completas» es peor que redondear a cero.
 *
 * @param counts el bloque `counts` del {espacio}
 * @returns la lectura que le toca
 */
export function leerTareas (counts: EspacioPortal['counts']): LecturaDeTareas {
  if (counts.tasks <= 0) return { clase: 'sin_tareas' }

  const abiertas = Math.max(0, Math.min(counts.tasks, counts.tasks_open))

  return { clase: 'contadas', abiertas, completas: counts.tasks - abiertas, total: counts.tasks }
}

/**
 * Como va el plazo de entrega de un {espacio}.
 *
 * `cerrado` va PRIMERO y gana sobre cualquier fecha: un {espacio} terminado el mes pasado con una
 * entrega comprometida para la semana pasada no esta «vencido», esta entregado. Pintarlo en rojo
 * seria acusar de atraso a un trabajo que ya se cerro. Su `fecha` puede ser `null` —el {espacio}
 * esta marcado como terminado pero nadie guardo cuando—, y ahi se dice que esta cerrado sin
 * inventarle un dia.
 *
 * `hoy` se separa de `en_plazo` porque no se leen igual: «vence hoy» pide una mirada y «faltan 12
 * días» no. Y `vencido` trae los dias para que la tarjeta pueda decir cuanto, que es la diferencia
 * entre un aviso y un dato.
 */
export type LecturaDePlazo =
  | { clase: 'cerrado', fecha: string | null }
  | { clase: 'sin_fecha' }
  | { clase: 'vencido', dias: number, fecha: string }
  | { clase: 'hoy', fecha: string }
  | { clase: 'en_plazo', dias: number, fecha: string }

/**
 * Decide como se lee la fecha de entrega de un {espacio}.
 *
 * @param espacio el {espacio}, por su `deadline` y su `date_finished`
 * @param hoy dia de referencia, inyectable para poder probarlo sin depender del reloj
 * @returns la lectura que le toca
 */
export function leerPlazo (espacio: EspacioPortal, hoy: Date = new Date()): LecturaDePlazo {
  if (estaCerrado(espacio)) return { clase: 'cerrado', fecha: fechaDeCierre(espacio) }

  const fecha = espacio.deadline

  if (typeof fecha !== 'string' || fecha.trim() === '') return { clase: 'sin_fecha' }

  const dias = diasHasta(fecha, hoy)

  if (dias === null) return { clase: 'sin_fecha' }
  if (dias < 0) return { clase: 'vencido', dias: -dias, fecha }
  if (dias === 0) return { clase: 'hoy', fecha }

  return { clase: 'en_plazo', dias, fecha }
}

/**
 * Una tarjeta del bloque de avance: un {espacio} con TODO lo que se sabe de el sin abrirlo.
 *
 * Es lo que convierte la pantalla en un dashboard y no en un indice: el cliente ve el estado, las
 * tres fechas, las tres cuentas de {procesos}, los {hitos} que vienen y lo que esta detenido, del
 * {espacio} entero, sin tener que entrar.
 *
 * `trabados` en `null` es «no se puede saber» y `[]` es «no hay nada trabado acá». La tarjeta NO
 * escribe la diferencia —seria repetir la misma salvedad en cada una—: la escribe una sola vez el
 * bloque «Qué está trabado». Acá la distincion sirve para no poner la señal de trabado sobre un
 * {espacio} que nadie miro.
 */
export interface FilaDeAvance {
  espacio: EspacioPortal
  /**
   * Lo que devolvio `/portal/projects/{id}/overview`, o `null` si este {espacio} no lo comparte.
   *
   * `null` NO es un {espacio} sin datos: es uno que no comparte esa pestaña, y su tarjeta se dibuja
   * igual con lo que trae la lista. Es la misma regla que el resto del portal —la clave ausente no
   * se dibuja— aplicada a una respuesta entera.
   */
  detalle: ResumenDeProyecto | null
  /** Los {hitos} que vienen de este {espacio}, con cuantos tiene en total. */
  hitos: LecturaDeHitosDelEspacio
  /** Lo trabado de este {espacio}. `null` es «no se puede saber»; `[]` es «no hay nada». */
  trabados: BloqueoLeido[] | null
  /** Si algo de lo trabado de este {espacio} depende del cliente. */
  esperaAlCliente: boolean
  /** Como va la fecha de entrega. */
  plazo: LecturaDePlazo
  /** Las tres cuentas de {procesos}. */
  tareas: LecturaDeTareas
}

/**
 * En que orden se miran los {espacios}: primero los que necesitan atencion.
 *
 * Cuatro escalones y no una puntuacion: trabado, {hito} vencido, entrega vencida, el resto. Un
 * {espacio} trabado va primero porque esta detenido HOY; los dos vencimientos van despues porque ya
 * pasaron; y los tres van antes que los que andan bien, que es lo que el cliente mira al final.
 *
 * La entrega vencida es un escalon propio y no se mezcla con el {hito}: un {espacio} puede tener
 * todos sus {hitos} al dia y aun asi haber pasado su fecha de cierre, y al reves.
 */
function rangoDeAtencion (fila: FilaDeAvance): number {
  if (fila.trabados !== null && fila.trabados.length > 0) return 0
  if (fila.hitos.clase === 'proximos' && fila.hitos.vencidos > 0) return 1
  if (fila.plazo.clase === 'vencido') return 2

  return 3
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
 * @param detalles lo que devolvio `/portal/projects/{id}/overview` por {espacio}; un {espacio} que
 *   no comparte esa pestaña no esta en el mapa, y su tarjeta se dibuja con lo que trae la lista
 * @param hoy dia de referencia, inyectable para poder probarlo sin depender del reloj
 * @returns una tarjeta por {espacio}, con los que necesitan atencion primero
 */
export function filasDeAvance (
  espacios: readonly EspacioPortal[],
  proximosHitos: readonly HitoProximoDelResumen[],
  bloqueados: readonly BloqueoDelResumen[] | null | undefined,
  detalles: ReadonlyMap<number, ResumenDeProyecto> = new Map(),
  hoy: Date = new Date()
): FilaDeAvance[] {
  const hitosPorEspacio = new Map<number, HitoProximoDelResumen[]>()

  for (const hito of proximosHitos) {
    const grupo = hitosPorEspacio.get(hito.project.id)

    if (grupo === undefined) hitosPorEspacio.set(hito.project.id, [hito])
    else grupo.push(hito)
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
      detalle: detalles.get(espacio.id) ?? null,
      hitos: leerHitosDelEspacio(espacio, hitosPorEspacio.get(espacio.id), detalles.get(espacio.id)),
      trabados,
      esperaAlCliente: (trabados ?? []).some((bloqueo) => bloqueo.deTuLado),
      plazo: leerPlazo(espacio, hoy),
      tareas: leerTareas(espacio.counts)
    }
  })

  return filas.sort((uno, otro) => rangoDeAtencion(uno) - rangoDeAtencion(otro))
}

/**
 * Decide que se dice de los {hitos} de un {espacio}.
 *
 * `total` y `vencidos` prefieren el detalle sobre la lista transversal, y esa preferencia es el
 * motivo de que el detalle se pida: `proximos_hitos` viene RECORTADA a las primeras filas de TODOS
 * los {espacios} juntos, asi que contar los vencidos ahi da un numero que puede ser menor que el
 * real y no lo parece. `milestones.overdue` del detalle, en cambio, esta calculado sobre el
 * {espacio} entero. Sin detalle se cae a lo que hay, que es honesto pero mas pobre.
 *
 * @param espacio el {espacio}, por su contador de {hitos}
 * @param filas los {hitos} de este {espacio} que entraron en la lista del servidor
 * @param detalle lo que devolvio `/overview` para este {espacio}, si lo comparte
 * @returns la lectura que le toca
 */
export function leerHitosDelEspacio (
  espacio: EspacioPortal,
  filas: readonly HitoProximoDelResumen[] | undefined,
  detalle: ResumenDeProyecto | undefined
): LecturaDeHitosDelEspacio {
  const total = detalle?.milestones?.total ?? espacio.counts.milestones

  if (filas === undefined || filas.length === 0) {
    return total > 0 ? { clase: 'fuera_de_lista', total } : { clase: 'sin_hitos' }
  }

  return {
    clase: 'proximos',
    filas: [...filas],
    total: Math.max(total, filas.length),
    vencidos: detalle?.milestones?.overdue ?? filas.filter((hito) => hito.vencido).length
  }
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
