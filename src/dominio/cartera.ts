/**
 * La lógica de la pantalla de Focals: resumir una cartera, filtrarla y ordenarla.
 *
 * Vive en un `.ts` y fuera del componente por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, así que sólo lo que está acá se puede probar con `node --test`.
 * Y esto es justo lo que hay que poder probar: un recuento mal hecho no se ve roto —dice un número
 * cualquiera con toda confianza— y es el número que alguien va a usar para decidir a quién llamar.
 *
 * **Acá no se decide quién ve qué.** La API ya recortó la cartera antes de mandarla; estas funciones
 * sólo reordenan y esconden lo que quien mira pidió esconder.
 */

import {
  contarPorTramo,
  nombresDeFocales,
  tramosEnCero,
  type CuentaFocal,
  type ScoreEspacio
} from '../datos/focals.ts'
import { sinAcentos } from '../lib/texto.ts'
import { ASISTENTE, GLOSARIO } from './glosario.ts'
import { ORDEN_DE_TRAMOS, contarConPalabra } from './tramos-de-semaforo.ts'
import type { SemaforoCliente } from '../datos/recursos'

/**
 * Por qué se puede recortar la lista.
 *
 * Los cuatro tramos y una quinta condición que no es un tramo: la cuenta sin focal. Está en el mismo
 * eje a propósito —se elige una cosa a la vez— porque las dos preguntas que se hacen acá son
 * excluyentes en la práctica: "qué está en rojo" y "de qué no responde nadie".
 *
 * Es la lista y de ella sale el tipo, para que la pantalla valide la URL contra los mismos valores
 * que el tipo acepta y no contra una segunda copia.
 */
export const FILTROS = ['verde', 'amarillo', 'rojo', 'sin_datos', 'sin_focal', 'todas'] as const

/** Con qué criterio se apila la cartera: del peor al mejor, por nombre o por Proyectos críticos. */
export const ORDENES = ['peor', 'nombre', 'criticos'] as const

export type FiltroDeCartera = typeof FILTROS[number]

export type OrdenDeCartera = typeof ORDENES[number]

/** El encabezado de la pantalla: de cuánto se está hablando, y cuánto de eso arde. */
export interface ResumenDeCartera {
  /** Cuántas cuentas hay en total, antes de filtrar. */
  cuentas: number
  /** Cuántas cuentas cayeron en cada tramo del semáforo. */
  porTramo: Record<SemaforoCliente, number>
  /** Cuántas cuentas no tienen a nadie nombrado como focal. */
  sinFocal: number
  /** Cuántos Proyectos suman todas las cuentas. */
  espacios: number
  /** Cuántos de esos Proyectos están en rojo. */
  espaciosCriticos: number
}

/**
 * Cuenta la cartera entera de una pasada.
 *
 * Se cuenta acá y no en el servidor porque las dos llamadas ya trajeron todo: pedir un resumen
 * aparte sería una tercera petición para sumar lo que está en memoria, y un número calculado en otro
 * lado que puede terminar contradiciendo a la lista que se ve debajo.
 *
 * @param cuentas la cartera ya agrupada por cliente
 * @returns los totales, con los cuatro tramos siempre presentes aunque valgan cero
 */
export function resumirCartera (cuentas: CuentaFocal[]): ResumenDeCartera {
  const porTramo = tramosEnCero()
  let sinFocal = 0
  let espacios = 0
  let espaciosCriticos = 0

  for (const cuenta of cuentas) {
    porTramo[cuenta.cliente.semaforo] += 1

    if (esSinFocal(cuenta)) sinFocal += 1

    espacios += cuenta.espacios.length
    espaciosCriticos += contarPorTramo(cuenta.espacios).rojo
  }

  return { cuentas: cuentas.length, porTramo, sinFocal, espacios, espaciosCriticos }
}

/**
 * Una cuenta con lo que el buscador y el orden necesitan ya calculado.
 *
 * Normalizar el texto de toda la cartera y contar los tramos de cada cuenta son los dos costos que
 * se pagaban en cada tecla. Se calculan una vez, cuando llega la cartera, y desde ahí filtrar y
 * ordenar solo comparan.
 */
export interface CuentaPreparada {
  cuenta: CuentaFocal
  /** Nombre del cliente, de sus focales y de sus Proyectos, ya sin acentos y en minúsculas. */
  textoNormalizado: string
  /** Solo el nombre del cliente y el de sus focales: lo que la cuenta dice de sí misma. */
  textoPropio: string
  /** El nombre de cada Proyecto, normalizado, para saber cuál fue el que coincidió. */
  textosDeEspacios: { id: number, texto: string }[]
  /** Cuántos Proyectos de la cuenta hay en cada tramo. */
  tramos: Record<SemaforoCliente, number>
}

/**
 * `true` si nadie está nombrado como focal de la cuenta.
 *
 * Un nombre en blanco no cuenta: pinta una insignia vacía y, para quien mira, es lo mismo que no
 * tener a nadie.
 *
 * @param cuenta la cuenta a revisar
 */
export function esSinFocal (cuenta: CuentaFocal): boolean {
  return nombresDeFocales(cuenta.cliente).length === 0
}

/**
 * Calcula, una vez por cuenta, lo que el filtro y el orden van a consultar a cada tecla.
 *
 * @param cuentas la cartera completa, tal como llegó
 * @returns una entrada por cuenta, en el mismo orden
 */
export function prepararCartera (cuentas: CuentaFocal[]): CuentaPreparada[] {
  return cuentas.map((cuenta) => {
    const textoPropio = sinAcentos([nombreDeCuenta(cuenta), ...nombresDeFocales(cuenta.cliente)].join(' '))
    const textosDeEspacios = cuenta.espacios.map((espacio) => ({
      id: espacio.project_id,
      texto: sinAcentos(espacio.espacio ?? '')
    }))

    return {
      cuenta,
      textoNormalizado: [textoPropio, ...textosDeEspacios.map((espacio) => espacio.texto)].join(' '),
      textoPropio,
      textosDeEspacios,
      tramos: contarPorTramo(cuenta.espacios)
    }
  })
}

/**
 * Los Proyectos que hicieron coincidir a una cuenta con lo que se escribió, cuando fueron ellos y no
 * la cuenta.
 *
 * Si el cliente o su focal ya coinciden, la cuenta aparece por sí misma y marcar además a sus
 * Proyectos sería ruido: todos los que casualmente contengan la palabra se encenderían sin que nadie
 * los buscara. Solo cuando la cuenta aparece **únicamente** por un Proyecto, saber cuál es lo que
 * evita abrir la cuenta y leer Proyecto por Proyecto hasta dar con él.
 *
 * @param cuenta la cuenta ya preparada con {@link prepararCartera}
 * @param texto lo que se escribió en el buscador; vacío no marca nada
 * @returns los ids de los Proyectos que coinciden, o una lista vacía si coincide la cuenta o nada
 */
export function proyectosCoincidentes (cuenta: CuentaPreparada, texto: string): number[] {
  const aguja = sinAcentos(texto)

  if (aguja === '' || cuenta.textoPropio.includes(aguja)) return []

  return cuenta.textosDeEspacios
    .filter((espacio) => espacio.texto.includes(aguja))
    .map((espacio) => espacio.id)
}

/**
 * Deja sólo las cuentas que quien mira pidió ver.
 *
 * El texto se compara contra el nombre del cliente, el de sus focales y el de cada uno de sus
 * Proyectos. Los Proyectos entran en la búsqueda porque la pregunta real muchas veces no es por la
 * cuenta sino por el trabajo —"dónde está el rediseño"— y quien busca no tiene por qué recordar de
 * qué cliente cuelga.
 *
 * La comparación normaliza acentos: escribir "analitica" tiene que encontrar "Analítica", o el
 * buscador queda inservible para media lista en español.
 *
 * @param cuentas la cartera ya preparada con {@link prepararCartera}
 * @param texto lo que se escribió en el buscador; vacío no recorta nada
 * @param filtro el tramo o la condición elegida; `'todas'` no recorta nada
 * @returns una copia recortada; el arreglo de entrada no se toca
 */
export function filtrarCartera (
  cuentas: CuentaPreparada[],
  texto: string,
  filtro: FiltroDeCartera
): CuentaPreparada[] {
  const aguja = sinAcentos(texto)

  return cuentas.filter((preparada) => {
    if (!cumpleElFiltro(preparada.cuenta, filtro)) return false

    return aguja === '' || preparada.textoNormalizado.includes(aguja)
  })
}

/** `true` si la cuenta entra en el tramo o la condición elegida. */
function cumpleElFiltro (cuenta: CuentaFocal, filtro: FiltroDeCartera): boolean {
  if (filtro === 'todas') return true
  if (filtro === 'sin_focal') return esSinFocal(cuenta)

  return cuenta.cliente.semaforo === filtro
}

/**
 * Apila la cartera con el criterio elegido.
 *
 * `'peor'` respeta el orden que puso el servidor —del peor score al mejor, con los `sin_datos` al
 * final— y por eso no reordena nada: reimplementar acá ese criterio sería una segunda copia que
 * puede terminar mostrando un orden distinto del que el listado declara.
 *
 * `'criticos'` desempata por ese mismo orden del servidor: `sort` es estable, así que devolver cero
 * en el empate conserva la posición de llegada, en vez de reordenar por nombre cuentas que el
 * servidor ya había puesto en otro orden por una razón.
 *
 * @param cuentas la cartera ya preparada, tal como llegó
 * @param orden el criterio elegido
 * @returns una copia ordenada; el arreglo de entrada no se toca
 */
export function ordenarCartera (cuentas: CuentaPreparada[], orden: OrdenDeCartera): CuentaPreparada[] {
  if (orden === 'peor') return [...cuentas]

  if (orden === 'nombre') {
    return [...cuentas].sort((una, otra) => nombreDeCuenta(una.cuenta).localeCompare(nombreDeCuenta(otra.cuenta), 'es'))
  }

  return [...cuentas].sort((una, otra) => otra.tramos.rojo - una.tramos.rojo)
}

/** El nombre del cliente, o una marca legible cuando el servidor no lo trae. */
export function nombreDeCuenta (cuenta: CuentaFocal): string {
  return cuenta.cliente.cliente ?? `Cliente #${cuenta.cliente.client_id}`
}

/**
 * "4 Proyectos · 3 críticos · 1 sin datos": el recuento escrito de los Proyectos de una cuenta.
 *
 * Es lo que permite descartar una cuenta sin abrirla. **No** incluye un promedio de los scores: ese
 * número no es el score del cliente —el servidor lo calcula sobre los Procesos, no promediando— y
 * tenerlos al lado invitaría a compararlos.
 *
 * @param espacios los Proyectos de la cuenta
 * @returns el recuento, o la frase de la cuenta sin Proyectos cuando la lista viene vacía
 */
export function textoDeRecuento (espacios: ScoreEspacio[]): string {
  const { singular, plural } = GLOSARIO.espacio

  if (espacios.length === 0) return `Sin ${plural.toLowerCase()}: no hay nada que abrir todavía.`

  const tramos = contarPorTramo(espacios)
  const partes = [`${espacios.length} ${espacios.length === 1 ? singular : plural}`]

  for (const tramo of ORDEN_DE_TRAMOS) {
    if (tramos[tramo] > 0) partes.push(contarConPalabra(tramo, tramos[tramo]))
  }

  return partes.join(' · ')
}

/** De qué día es la foto que se está mirando, y si ya no es la de hoy. */
export interface FotoDeLaCartera {
  /** El día más reciente entre las fotos de clientes y de Proyectos, `YYYY-MM-DD`. */
  fecha: string
  /** `true` si ese día es anterior a hoy: la corrida diaria no pasó y los puntajes son de otro día. */
  obsoleta: boolean
}

/**
 * La fecha de la foto más reciente de la cartera, y si es de antes de hoy.
 *
 * Sin esto un cron caído presenta puntajes de hace una semana como si fueran de hoy: nada en la
 * pantalla lo delata, y el número se usa igual para decidir a quién llamar. Se toma la fecha más
 * reciente de entre todas las filas, no la de la primera, porque cuentas y Proyectos pueden llegar
 * con días distintos y lo que importa es cuándo corrió el cálculo por última vez.
 *
 * @param cuentas la cartera ya agrupada
 * @param hoy el día de hoy en la zona del negocio, `YYYY-MM-DD`; se inyecta para poder probarlo
 * @returns la foto más reciente, o `null` si no hay ninguna cuenta
 */
export function fotoDeLaCartera (cuentas: CuentaFocal[], hoy: string): FotoDeLaCartera | null {
  let fecha: string | null = null

  for (const { cliente, espacios } of cuentas) {
    for (const dia of [cliente.fecha, ...espacios.map((espacio) => espacio.fecha)]) {
      if (fecha === null || dia > fecha) fecha = dia
    }
  }

  return fecha === null ? null : { fecha, obsoleta: fecha < hoy }
}

/** El título y la explicación de una pantalla sin ninguna cuenta. */
export interface TextoDeVacio {
  titulo: string
  descripcion: string
}

/**
 * Lo que dice la pantalla cuando no llegó ninguna cuenta.
 *
 * Una lista vacía tiene dos causas que desde acá no se distinguen: que no haya nada que mostrar o
 * que la foto del día todavía no exista —el servidor solo devuelve cuentas con foto—. Por eso el
 * texto nombra las dos: afirmar "no eres focal de ningún cliente" sería falso cada mañana antes de
 * que corra el cálculo, y mandaría a buscar en una ficha lo que es un asunto del cron.
 *
 * @param todas si la pantalla es la cartera entera y no la propia
 * @returns el título y la descripción del vacío
 */
export function textoDeCarteraVacia (todas: boolean): TextoDeVacio {
  const focal = GLOSARIO.focal.singular.toLowerCase()

  if (todas) {
    return {
      titulo: 'Todavía no hay cuentas con semáforo',
      descripcion:
        'El puntaje lo calcula una corrida diaria. Si la lista sigue vacía mañana, es que esa ' +
        'corrida no está pasando.'
    }
  }

  return {
    titulo: 'Aún no hay cuentas con semáforo en tu cartera',
    descripcion:
      `O todavía no eres ${focal} de ningún cliente —se nombra desde la ficha del cliente, en su ` +
      `pestaña ${GLOSARIO.focal.plural}—, o la foto del día aún no se calcula: el puntaje se ` +
      'genera una vez al día y, hasta entonces, las cuentas no aparecen.'
  }
}

/**
 * La descripción de la pantalla de Focals.
 *
 * @param todas si es la cartera entera, la propia, o `null` cuando todavía no se sabe (mientras carga)
 * @returns la frase, que cierra igual en los tres casos para que el encabezado no salte al cargar
 */
export function descripcionDeFocals (todas: boolean | null): string {
  const alcance = todas === null
    ? 'Las cuentas de la cartera, de la que peor está a la que mejor. '
    : todas
      ? 'Todas las cuentas, de la que peor está a la que mejor, con quien responde por cada una. '
      : 'Las cuentas de las que respondes, de la que peor está a la que mejor. '

  return alcance +
    'El puntaje sale de la fórmula —cumplimiento de plazos, carga y vencimientos—; el estado ' +
    `en palabras lo redacta ${ASISTENTE} a partir de esas mismas señales.`
}
