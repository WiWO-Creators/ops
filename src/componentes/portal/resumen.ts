import { GLOSARIO } from '../../dominio/glosario.ts'
import type {
  BloqueoDelResumen,
  EstadoDelResumen,
  FilaDeProximosDias,
  HitoProximoDelResumen,
  HitosDelResumen,
  ProximosDiasDelResumen,
  ResponsableDelBloqueo,
  ResumenPortal,
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
 * Las tres lecturas posibles de `esperando_tu_respuesta`.
 *
 * Son tres y no dos a proposito. La API devuelve `number | null` y el `null` NUNCA es 0: significa
 * "no se puede saber" —ningun {espacio} comparte su lista de {procesos}, o la tabla de aprobaciones
 * no existe en esta instalacion—. Pintar un 0 ahi le diria al cliente "no te falta nada", que es lo
 * contrario de lo que pasa, y encima en el unico numero de la pantalla que le pide una accion.
 */
export type LecturaDeEspera =
  | { clase: 'pendiente', cuantas: number }
  | { clase: 'al_dia' }
  | { clase: 'no_se_sabe' }

/**
 * Decide como se lee el contador de {procesos} que esperan una decision del cliente.
 *
 * Acepta `undefined` ademas de `null` aunque el contrato diga que la clave viaja siempre: si algun
 * dia dejara de viajar, la portada tiene que degradar a "no se sabe" y no dibujar `NaN`. Un numero
 * negativo o no finito se trata igual, por lo mismo.
 *
 * @param valor lo que trajo `esperando_tu_respuesta`
 * @returns la lectura que le toca a ese valor
 */
export function leerEspera (valor: number | null | undefined): LecturaDeEspera {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return { clase: 'no_se_sabe' }

  return valor > 0 ? { clase: 'pendiente', cuantas: Math.trunc(valor) } : { clase: 'al_dia' }
}

/** Por que la portada no puede decir cuantas cosas esperan al cliente. */
export const MOTIVO_SIN_ESPERA
  = `Ningún ${GLOSARIO.espacio.singular} comparte hoy su lista de ${GLOSARIO.proceso.plural}, `
  + 'así que no tenemos de dónde contarlas. No es que no haya nada: es que todavía no lo sabemos.'

/**
 * Por que la portada no muestra numeros de {procesos}.
 *
 * La clave `procesos` no llega cuando ningun {espacio} comparte esa pestaña. No se dibujan ceros:
 * un "0 abiertas" seria contarle al cliente, en forma de numero, la misma lista que la pantalla le
 * niega.
 */
export const MOTIVO_SIN_PROCESOS
  = `Los números de ${GLOSARIO.proceso.plural} aparecen cuando al menos un `
  + `${GLOSARIO.espacio.singular} comparte su lista de ${GLOSARIO.proceso.plural}.`

/**
 * Las tres lecturas posibles del bloque de {hitos}.
 *
 * `sin_hitos` no es lo mismo que `al_dia`: un cliente sin ningun {hito} comprometido no esta "al
 * dia", no tiene contra que estarlo. Distinguirlos es lo que evita el cartel verde sobre la nada.
 */
export type LecturaDeHitos =
  | { clase: 'sin_hitos' }
  | { clase: 'vencidos', cuantos: number, total: number }
  | { clase: 'al_dia', total: number }

/**
 * Decide como se lee el bloque de {hitos}.
 *
 * @param hitos el bloque `hitos` del resumen
 * @returns la lectura que le toca
 */
export function leerHitos (hitos: HitosDelResumen): LecturaDeHitos {
  if (hitos.total <= 0) return { clase: 'sin_hitos' }

  return hitos.overdue > 0
    ? { clase: 'vencidos', cuantos: hitos.overdue, total: hitos.total }
    : { clase: 'al_dia', total: hitos.total }
}

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
 * Si el resumen tiene algo que valga la pena dibujar.
 *
 * Un contacto con la seccion de {espacios} habilitada pero sin ningun {espacio} asignado recibe un
 * resumen legitimo y entero de ceros. Ahi la grilla de metricas no informa nada y la portada pasa
 * directo a las secciones: es el mismo criterio con el que hoy se esconde la lista de {espacios}.
 *
 * @param resumen lo que devolvio `GET /portal/resumen`
 * @returns `true` si hay al menos un {espacio} que contar
 */
export function hayQueDibujarElResumen (resumen: ResumenPortal): boolean {
  return resumen.espacios.total > 0
}

/**
 * Las tres lecturas posibles de la lista de {hitos} que vienen.
 *
 * Son tres y no dos porque una lista vacia tiene DOS causas distintas y se leen al reves: si el
 * contador `hitos` dice cero, no hay ningun {hito} comprometido y la tarjeta del contador ya lo
 * dice —repetirlo abajo es ruido—; si el contador dice que hay, la lista vacia significa que
 * ninguno tiene fecha pendiente, que es una noticia propia y hay que escribirla.
 */
export type LecturaDeProximosHitos =
  | { clase: 'nada_comprometido' }
  | { clase: 'sin_fecha_proxima' }
  | { clase: 'proximos', filas: HitoProximoDelResumen[], vencidos: number }

/**
 * Decide como se lee la lista de {hitos} que vienen, contra el contador que ya esta en pantalla.
 *
 * Recibe el contador a proposito: la lista COMPLEMENTA a `hitos`, no lo duplica, y sin el no se
 * puede distinguir «no hay ninguno comprometido» de «hay, pero ninguno con fecha pendiente».
 *
 * Una lista que no viniera se lee igual que la vacia, y eso NO contradice la regla de `bloqueados`:
 * alla la ausencia es la unica fuente y `[]` afirmaria algo que nadie puede afirmar; aca el
 * contador `hitos` ya dijo cuantos hay, asi que lo unico que falta es el detalle.
 *
 * El orden llega del servidor —por fecha ascendente, asi que los vencidos van primero— y no se
 * reordena: la lista viene recortada a las primeras filas, y reordenar un recorte miente sobre lo
 * que quedo afuera.
 *
 * @param lista `proximos_hitos` tal como llego
 * @param hitos el contador `hitos` del mismo resumen
 * @returns la lectura que le toca
 */
export function leerProximosHitos (
  lista: readonly HitoProximoDelResumen[] | null | undefined,
  hitos: HitosDelResumen
): LecturaDeProximosHitos {
  if (!Array.isArray(lista) || lista.length === 0) {
    return hitos.total > 0 ? { clase: 'sin_fecha_proxima' } : { clase: 'nada_comprometido' }
  }

  return {
    clase: 'proximos',
    filas: [...lista],
    vencidos: lista.filter((hito) => hito.vencido).length
  }
}

/** Por que hay {hitos} contados arriba y ninguna fila debajo. */
export const MOTIVO_SIN_FECHA_PROXIMA
  = `Los ${GLOSARIO.hito.plural.toLowerCase()} que quedan no tienen una fecha pendiente por delante.`

/**
 * Las tres lecturas posibles del bloque de {procesos} trabados.
 *
 * La distincion que sostiene todo el bloque: **la clave ausente no es la lista vacia**. La API no
 * manda `bloqueados` cuando ningun {espacio} comparte la pestaña de {procesos} ni cuando la
 * instalacion no tiene la tabla de bloqueos, y ahi la verdad es «no se». `[]`, en cambio, es una
 * afirmacion: «no tenes nada trabado». Son dos pantallas distintas y las dos tienen que existir.
 */
export type LecturaDeBloqueos =
  | { clase: 'no_se_sabe' }
  | { clase: 'sin_bloqueos' }
  | { clase: 'trabados', filas: BloqueoLeido[], deTuLado: number }

/** Un {proceso} trabado con lo unico que la pantalla necesita decidir: si depende del cliente. */
export interface BloqueoLeido extends BloqueoDelResumen {
  /** `responsable === 'cliente'`: el unico bloqueo que quien mira la pantalla puede destrabar. */
  deTuLado: boolean
}

/**
 * Decide como se lee el bloque de {procesos} trabados.
 *
 * El reordenado es estable y deja primero los que dependen del cliente. El servidor ya los ordena
 * asi, y se repite aca por lo que pasa cuando NO puede: sin las columnas de la migracion `0699` no
 * tiene por donde ordenar, y el dia que esas columnas lleguen a una base atrasada la pantalla no
 * puede depender de que el orden venga hecho. Al ser estable, dentro de cada grupo se conserva el
 * orden del servidor —del mas antiguo al mas nuevo—.
 *
 * @param lista `bloqueados` tal como llego; `undefined` es la clave que no vino
 * @returns la lectura que le toca
 */
export function leerBloqueos (
  lista: readonly BloqueoDelResumen[] | null | undefined
): LecturaDeBloqueos {
  if (!Array.isArray(lista)) return { clase: 'no_se_sabe' }
  if (lista.length === 0) return { clase: 'sin_bloqueos' }

  const filas: BloqueoLeido[] = lista.map(
    (bloqueo) => ({ ...bloqueo, deTuLado: bloqueo.responsable === 'cliente' })
  )

  filas.sort((uno, otro) => Number(otro.deTuLado) - Number(uno.deTuLado))

  return { clase: 'trabados', filas, deTuLado: filas.filter((fila) => fila.deTuLado).length }
}

/**
 * Por que la portada no puede decir si hay algo trabado.
 *
 * Las dos causas son la misma que la de `procesos` —ningun {espacio} comparte esa pestaña— mas una
 * propia: una instalacion sin la tabla de bloqueos. En los dos casos «no hay nada trabado» seria
 * una afirmacion que nadie puede hacer.
 */
export const MOTIVO_SIN_BLOQUEOS
  = `Lo que está trabado aparece cuando al menos un ${GLOSARIO.espacio.singular} comparte su lista `
  + `de ${GLOSARIO.proceso.plural}. Que no lo veamos acá no significa que no haya nada detenido.`

/**
 * Hace cuanto esta trabado un {proceso}, en texto.
 *
 * Devuelve `null` —y no «hace 0 dias»— cuando no se puede saber: `dias_bloqueada` llega en `null`
 * si la fecha de bloqueo es ilegible, y ahi la pantalla omite la frase en vez de inventar un dia.
 * Un 0 legitimo SI tiene texto: «se trabó hoy» es un dato, y es distinto de no tenerlo.
 *
 * @param dias `dias_bloqueada` tal como llego
 * @returns el texto, o `null` si no hay nada que decir
 */
export function textoDeAntiguedad (dias: number | null | undefined): string | null {
  if (typeof dias !== 'number' || !Number.isFinite(dias) || dias < 0) return null

  const enteros = Math.trunc(dias)

  if (enteros === 0) return 'Se trabó hoy'

  return enteros === 1 ? 'Hace 1 día' : `Hace ${enteros} días`
}

/** De quien depende destrabar, escrito para quien mira el portal. */
const ETIQUETAS_DE_RESPONSABLE: Record<ResponsableDelBloqueo, string> = {
  cliente: 'Depende de vos',
  equipo: 'Depende de nosotros',
  tercero: 'Depende de un tercero'
}

/**
 * Como se nombra al responsable de un bloqueo.
 *
 * Devuelve `null` cuando la columna no vino —instalacion sin la migracion `0699`— y tambien cuando
 * trae un valor fuera del enum: sin saber de quien depende, la pantalla no pone la insignia en vez
 * de poner una equivocada. La fila se dibuja igual, con su motivo y su fecha.
 *
 * @param responsable `responsable` tal como llego
 * @returns la etiqueta, o `null` si no se sabe
 */
export function etiquetaDeResponsable (
  responsable: ResponsableDelBloqueo | null | undefined
): string | null {
  if (responsable === null || responsable === undefined) return null

  return ETIQUETAS_DE_RESPONSABLE[responsable] ?? null
}

/**
 * Los tres tramos de «Próximos días», en el orden en que se leen.
 *
 * Son los mismos que agrupa el Inicio del colaborador (`dominio/inicio.ts`) y eso no es una
 * coincidencia: un cliente y un colaborador miran la misma pregunta —qué hay que hacer y para
 * cuándo— y no hay razón para que la respuesta se vea distinta según por qué puerta entró cada uno.
 *
 * La diferencia está en quién agrupa: allá reparte el navegador lo que le llegó paginado, y acá los
 * tramos vienen armados y ordenados del servidor, que es el único que ve todos los {espacios}.
 */
const TRAMOS_DE_PROXIMOS_DIAS = ['vencido', 'hoy', 'proximo'] as const

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
  hoy: 'Hoy',
  proximo: 'Próximos días'
}

/** Un tramo listo para dibujar: su rotulo y las filas que el servidor puso en el. */
export interface GrupoDeProximosDias {
  tramo: TramoDeProximosDias
  etiqueta: string
  /** Las filas tal como llegaron, sin reordenar: el orden es del servidor y es parte del dato. */
  filas: FilaDeProximosDias[]
}

/**
 * Las tres lecturas posibles de «Próximos días».
 *
 * `no_se_sabe` no es `sin_vencimientos`, y esa es la distincion que sostiene el bloque: la clave
 * `proximos_dias` **falta** cuando ningun {espacio} comparte la pestaña de {procesos} —la misma
 * puerta que `procesos` y `bloqueados`—, y ahi «no tenés nada por vencer» seria una afirmacion que
 * nadie puede hacer. Con la clave presente y los tres tramos vacios, en cambio, la afirmacion es
 * legitima: hay de donde contar y no hay nada en los proximos siete dias.
 */
export type LecturaDeProximosDias =
  | { clase: 'no_se_sabe' }
  | { clase: 'sin_vencimientos', restantes: number }
  | { clase: 'tramos', grupos: GrupoDeProximosDias[], restantes: number }

/**
 * Decide como se lee lo que le viene encima al cliente en los proximos dias.
 *
 * Un tramo vacio no se devuelve: un encabezado «Vencidas» sobre una lista vacia se lee como un
 * error de carga. Es el mismo criterio de `agruparPorVencimiento()` en el panel.
 *
 * `restantes` sale del `total` del servidor menos lo que efectivamente se lista, y cubre dos
 * poblaciones a la vez: lo que vence mas alla de los siete dias y lo que el servidor recorto de
 * cada tramo. Sin ese numero, un cliente con cuarenta {procesos} abiertos veria quince y creeria
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
 * Misma puerta que `MOTIVO_SIN_PROCESOS`: sin ningun {espacio} que comparta su lista de {procesos}
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
 * Acá un valor ilegible SI cae en 0, al reves que en `leerEspera()`, y la diferencia es cual es el
 * dato: alla el contador ES la noticia y un 0 inventado le mentiria al cliente; acá las filas ya
 * estan en pantalla y el contador solo las acompaña, asi que degradarlo esconde un acento, no un
 * hecho.
 *
 * @param valor el contador tal como llego
 * @returns el entero no negativo, o 0 si no hay numero usable
 */
function contar (valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return 0

  return Math.trunc(valor)
}
