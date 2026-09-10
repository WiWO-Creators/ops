/**
 * Contrato de la capa de IA, del lado del navegador.
 *
 * Aca viven los tipos que F1 (resumen del Inicio), F2 (chat de WiBot) y F3 (alta de tarea)
 * comparten, y la lectura de un frame SSE. `datos/sse.ts` parte el texto en frames; este archivo es
 * el unico que sabe que significan.
 *
 * **Desviacion declarada de `docs/convenciones.md`**: la convencion dice que todo lo que entra del
 * usuario pasa por zod, pero zod **no esta instalado** en este proyecto y agregar una dependencia
 * para validar cuatro formas conocidas no se paga. La validacion es un type guard propio, escrito a
 * mano y con prueba runnable (`pruebas/ia.test.js`). El borde igual se valida de verdad: lo que
 * llega es texto de la red, generado por un modelo, y una sola propiedad asumida de mas tumba el
 * panel con un `TypeError` en medio de la animacion de escritura.
 *
 * Por eso `leerEventoIA()` **devuelve `null` en vez de lanzar**: un frame que no se entiende se
 * ignora y el stream sigue. Lanzar convertiria un token raro en una pantalla rota.
 *
 * === ESA TOLERANCIA ES TAMBIEN EL CONTRATO DE COMPATIBILIDAD ===
 *
 * Se escribio como defensa contra frames corruptos, y desde que el backend emite `paso` y
 * `propuesta` es ademas lo que hace que **no haga falta versionar el stream**: un cliente que no
 * conoce esos dos eventos recibe `null` por cada uno, `ChatWiBot` los saltea y la respuesta se
 * pinta exactamente igual, sin indicadores y sin tarjeta. Un backend nuevo no rompe un frontend
 * viejo, que es la unica combinacion que puede darse en un despliegue —el backend va primero—.
 * Comprobado en `pruebas/ia.test.js`, con el parser anterior a estos dos eventos.
 */

import { ESTADOS_ORBE, type EstadoOrbe } from './orbe.ts'

/** Una referencia que el modelo cito y el servidor ya verifico contra la base. */
export interface Cita {
  tipo: 'tarea' | 'discusion' | 'hito' | 'espacio'
  id: number
  /** El titulo que salio del `SELECT`, nunca el que escribio el modelo. */
  titulo: string
}

/**
 * Estado del cupo de regeneracion, tal como lo calcula el backend.
 *
 * Viaja en el `GET`, en el `POST` y en el `429`. El navegador **no** recalcula la regla de 2 por dia
 * con 4 horas de espera: duplicar logica de negocio del backend viola la convencion, y ademas se
 * saltearia con un `localStorage.clear()`.
 */
export interface Regeneracion {
  restantes_hoy: number
  puede_ahora: boolean
  /** ISO-8601 desde cuando se puede volver a generar, o `null` si ya se puede. */
  disponible_desde: string | null
  motivo: 'espera' | 'cupo' | null
}

/** Tokens de una llamada. Sirve para diagnosticar, no se muestra en la interfaz. */
export interface UsoIA {
  entrada: number
  salida: number
}

/** Lo que devuelve `GET /ia/inicio`. `texto: null` significa que nunca se genero. */
export interface ResumenIA {
  texto: string | null
  generado_en: string | null
  regeneracion: Regeneracion
}

/**
 * Lo que devuelve `POST /ia/tareas/interpretar`.
 *
 * Los nombres de campo son los de la API (`due_date`, `rel_id`) porque este objeto se fusiona con el
 * resultado de `interpretarAltaRapida()` y termina siendo el cuerpo de `POST /tasks`. Todo id ya
 * viene resuelto contra la base; lo que el modelo nombro y no se pudo resolver queda en
 * `no_resuelto` para mostrarlo, nunca para mandarlo.
 */
export interface CamposTarea {
  name: string | null
  description: string | null
  due_date: string | null
  start_date: string | null
  priority: number | null
  rel_type: 'project' | null
  rel_id: number | null
  milestone: number | null
  assignees: number[]
  tags: string[]
  no_resuelto: string[]
}

/**
 * Un paso de lo que WiBot esta haciendo antes de empezar a escribir.
 *
 * La `etiqueta` la escribe el SERVIDOR, desde un mapa cerrado con una entrada por herramienta.
 * Nunca sale del modelo, y por eso se puede pintar: si el modelo pudiera escribirla, un texto
 * inyectado en una descripcion pintaria "Guardando borrador…" mientras propone un borrado. Aun asi
 * llega por la red, asi que se valida y se recorta como cualquier otra cadena de este archivo.
 */
export interface PasoIA {
  fase: 'inicio' | 'fin'
  herramienta: string
  etiqueta: string
  orbe: EstadoOrbe
}

/** En que punto de su vida esta una propuesta de escritura. Los seis del backend, sin inventar. */
export type EstadoAccion = 'pendiente' | 'ejecutando' | 'ejecutada' | 'rechazada' | 'expirada' | 'fallida'

/**
 * Una escritura que WiBot dejo preparada y que una persona confirma o rechaza.
 *
 * `resumen` y `detalle` los escribe el servidor con los argumentos ya normalizados y los titulos
 * leidos de la base. Es la misma regla que rige los titulos de las citas, y acá pesa mas: es lo que
 * se lee antes de apretar Confirmar.
 */
export interface AccionIA {
  id: number
  herramienta: string
  resumen: string
  detalle: string[]
  estado: EstadoAccion
  /** Lo que devolvio la escritura, o el error real si fallo. `null` mientras sigue pendiente. */
  resultado: string | null
  /** ISO-8601. Pasado ese instante, confirmar responde `409` y la tarjeta se pinta caducada. */
  expira_en: string | null
}

/** Un frame del stream, ya interpretado. El `tipo` es el nombre del `event:` del contrato. */
export type EventoIA =
  | { tipo: 'delta', texto: string }
  | { tipo: 'citas', citas: Cita[] }
  | { tipo: 'paso', paso: PasoIA }
  | { tipo: 'propuesta', accion: AccionIA }
  | { tipo: 'navegar', href: string, etiqueta: string, prefill: Record<string, unknown> | null }
  | { tipo: 'fin', generado_en: string | null, regeneracion: Regeneracion | null, uso: UsoIA | null }
  | { tipo: 'error', codigo: string, mensaje: string }

/** Los cuatro tipos de cita que el contrato reconoce. Cada uno tiene su destino en `ia-chat.ts`. */
const TIPOS_CITA = ['tarea', 'discusion', 'hito', 'espacio'] as const

/** Los seis estados de una propuesta. Uno que no este acá descarta la tarjeta entera. */
const ESTADOS_ACCION = ['pendiente', 'ejecutando', 'ejecutada', 'rechazada', 'expirada', 'fallida'] as const

/**
 * Caracteres de la `etiqueta` de un paso antes de recortarla.
 *
 * El mapa del servidor tiene entradas de 40 caracteres, asi que 120 no recorta nada real. Existe
 * para lo otro: la etiqueta llega por la red y se pinta dentro de una linea de altura fija, y un
 * valor de diez mil caracteres —por un bug, no por un ataque— deformaria el panel entero.
 */
const LARGO_MAXIMO_ETIQUETA = 120

/** Lineas de `detalle` de una propuesta, y caracteres de cada una. Mismo motivo que la etiqueta. */
const MAXIMO_DETALLE = 12
const LARGO_MAXIMO_DETALLE = 500

/** `true` si el valor es un objeto JSON plano. Descarta `null` y los arrays, que tambien son `object`. */
export function esObjeto (valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

/**
 * Separa un frame SSE en su nombre de evento y su `data` ya parseado.
 *
 * Las lineas que empiezan con `:` son comentarios del protocolo —el `: ping` cada 15 segundos— y no
 * aportan nada. Las lineas `data:` se concatenan con salto de linea, como manda el protocolo, aunque
 * este contrato mande siempre una sola: si alguna vez llega partida, el JSON se rearma solo.
 *
 * @param crudo el frame completo, sin la linea en blanco final
 * @returns el nombre del evento y su payload, o `null` si falta el evento o el JSON no es un objeto
 */
function leerFrame (crudo: string): { nombre: string, datos: Record<string, unknown> } | null {
  let nombre = ''
  const partesDatos: string[] = []

  for (const linea of crudo.split(/\r\n|\r|\n/)) {
    if (linea.startsWith('event:')) nombre = linea.slice('event:'.length).trim()
    else if (linea.startsWith('data:')) partesDatos.push(linea.slice('data:'.length).trim())
  }

  if (nombre === '' || partesDatos.length === 0) return null

  try {
    const datos: unknown = JSON.parse(partesDatos.join('\n'))

    return esObjeto(datos) ? { nombre, datos } : null
  } catch {
    // `data` que no es JSON: el contrato dice que siempre lo es, asi que esto es un frame corrupto.
    return null
  }
}

/**
 * Interpreta un frame SSE de la capa de IA.
 *
 * Es un trust boundary: el texto viene de la red y lo escribio un modelo. Todo lo que no encaje en
 * una de las formas del contrato se descarta.
 *
 * El `fin` es la excepcion deliberada a esa estrictez: si sus bloques opcionales (`regeneracion`,
 * `uso`) vienen mal, el evento **igual se acepta** con esos campos en `null`. Descartar el `fin`
 * dejaria a la interfaz escribiendo para siempre, que es un fallo peor que perder el cupo restante.
 *
 * @param crudo un frame como lo entrega `partirEventos()`
 * @returns el evento tipado, o `null` si el frame es desconocido o esta malformado
 */
export function leerEventoIA (crudo: string): EventoIA | null {
  const frame = leerFrame(crudo)

  if (frame === null) return null

  const { nombre, datos } = frame

  if (nombre === 'delta') {
    return typeof datos.t === 'string' ? { tipo: 'delta', texto: datos.t } : null
  }

  if (nombre === 'citas') {
    return Array.isArray(datos.citas)
      ? { tipo: 'citas', citas: datos.citas.map(leerCita).filter((cita) => cita !== null) }
      : null
  }

  if (nombre === 'paso') {
    const paso = leerPaso(datos)

    return paso === null ? null : { tipo: 'paso', paso }
  }

  if (nombre === 'propuesta') {
    const accion = leerAccion(datos)

    return accion === null ? null : { tipo: 'propuesta', accion }
  }

  if (nombre === 'navegar') return leerNavegar(datos)

  if (nombre === 'fin') {
    return {
      tipo: 'fin',
      generado_en: typeof datos.generado_en === 'string' ? datos.generado_en : null,
      regeneracion: leerRegeneracion(datos.regeneracion),
      uso: leerUso(datos.uso)
    }
  }

  if (nombre === 'error') {
    return typeof datos.code === 'string' && typeof datos.message === 'string'
      ? { tipo: 'error', codigo: datos.code, mensaje: datos.message }
      : null
  }

  return null
}

/**
 * Valida una cita suelta.
 *
 * Una cita invalida se descarta sola y las demas sobreviven, por el mismo criterio que el backend
 * aplica con `citas_descartadas`: un id inventado desaparece en vez de convertirse en un enlace a la
 * tarea de otro proyecto.
 *
 * @param valor una entrada del array `citas`
 * @returns la cita, o `null` si le falta algo o el tipo no es de los del contrato
 */
export function leerCita (valor: unknown): Cita | null {
  if (!esObjeto(valor)) return null

  const { tipo, id, titulo } = valor
  const conocido = TIPOS_CITA.find((candidato) => candidato === tipo)

  if (conocido === undefined) return null
  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (typeof titulo !== 'string') return null

  return { tipo: conocido, id, titulo }
}

/**
 * Valida un paso del evento `paso`.
 *
 * Tan estricto como `leerCita()`, y con dos cuidados propios:
 *
 *   - **`orbe` se valida contra los siete estados que `Orbe.tsx` declara.** Un valor fuera de esa
 *     lista descarta el evento entero en vez de llegar como prop: el orbe lo usa para elegir clase
 *     CSS, y un estado inventado deja la animacion a medias sin ningun error a la vista.
 *   - **`etiqueta` se recorta.** Viene del mapa cerrado del servidor, pero llega por la red y se
 *     pinta: el borde se valida igual, que es la regla de este archivo.
 *
 * @param datos el payload del frame
 * @returns el paso, o `null` si le falta algo o el estado del orbe no existe
 */
export function leerPaso (datos: Record<string, unknown>): PasoIA | null {
  const { fase, herramienta, etiqueta, orbe } = datos

  if (fase !== 'inicio' && fase !== 'fin') return null
  if (typeof herramienta !== 'string' || herramienta === '') return null
  if (typeof etiqueta !== 'string' || etiqueta === '') return null

  const estado = ESTADOS_ORBE.find((candidato) => candidato === orbe)

  if (estado === undefined) return null

  return { fase, herramienta, etiqueta: etiqueta.slice(0, LARGO_MAXIMO_ETIQUETA), orbe: estado }
}

/**
 * Valida una propuesta, venga del evento `propuesta` o del `acciones` de un mensaje guardado.
 *
 * Una propuesta invalida se descarta y las demas sobreviven, igual que con las citas: la tarjeta es
 * un boton que escribe en el sistema, y una con datos a medias es peor que ninguna.
 *
 * @param valor el payload del frame, o una entrada del array `acciones`
 * @returns la accion, o `null` si no tiene la forma del contrato
 */
export function leerAccion (valor: unknown): AccionIA | null {
  if (!esObjeto(valor)) return null

  const { id, herramienta, resumen, detalle, estado, resultado, expira_en: expira } = valor

  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (typeof herramienta !== 'string' || herramienta === '') return null
  if (typeof resumen !== 'string' || resumen === '') return null

  const conocido = ESTADOS_ACCION.find((candidato) => candidato === estado)

  if (conocido === undefined) return null

  return {
    id,
    herramienta,
    resumen: resumen.slice(0, LARGO_MAXIMO_DETALLE),
    detalle: Array.isArray(detalle)
      ? detalle
        .filter((linea): linea is string => typeof linea === 'string' && linea !== '')
        .slice(0, MAXIMO_DETALLE)
        .map((linea) => linea.slice(0, LARGO_MAXIMO_DETALLE))
      : [],
    estado: conocido,
    resultado: typeof resultado === 'string' ? resultado.slice(0, LARGO_MAXIMO_DETALLE) : null,
    expira_en: typeof expira === 'string' ? expira : null
  }
}

/**
 * Valida el evento `navegar`, con el que el servidor lleva a la persona a otra pantalla.
 *
 * **El `href` lo arma siempre el servidor.** Acá no se completa, ni se corrige, ni se le pega una
 * base: solo se comprueba que sea una ruta de este panel. Esa comprobación es la frontera y por eso
 * no se puede saltear por corta: `router.push()` sigue sin chistar un `https://…` o un `//host`, y
 * eso convertiría una respuesta de un modelo en una redirección fuera de Ops. Un `href` que no
 * empieza con una sola barra descarta el evento entero, que es lo mismo que hace el resto del
 * archivo con lo que no encaja.
 *
 * `prefill` viaja tal cual para quien sepa qué hacer con él: son los campos que el servidor deja
 * preparados para la pantalla de destino, no algo que este archivo interprete.
 *
 * @param datos el payload del frame
 * @returns el evento, o `null` si el destino no es interno o le falta la etiqueta
 */
function leerNavegar (datos: Record<string, unknown>): EventoIA | null {
  const { href, etiqueta, prefill } = datos

  if (typeof href !== 'string' || !esRutaInterna(href)) return null
  if (typeof etiqueta !== 'string' || etiqueta === '') return null

  return {
    tipo: 'navegar',
    href,
    etiqueta: etiqueta.slice(0, LARGO_MAXIMO_ETIQUETA),
    prefill: esObjeto(prefill) ? prefill : null
  }
}

/**
 * `true` si el destino es una ruta de este panel y no una salida a otro sitio.
 *
 * Una sola barra al principio y nada de `//` ni `/\`: las dos formas las lee el navegador como
 * "protocolo relativo" y terminan en otro dominio.
 *
 * @param href el destino tal como llego
 */
function esRutaInterna (href: string): boolean {
  return /^\/(?![/\\])/.test(href)
}

/**
 * Valida el bloque de cupo del evento `fin`.
 *
 * @param valor el campo `regeneracion` del payload
 * @returns el bloque, o `null` si falta o no tiene la forma del contrato
 */
function leerRegeneracion (valor: unknown): Regeneracion | null {
  if (!esObjeto(valor)) return null

  const { restantes_hoy: restantes, puede_ahora: puede, disponible_desde: desde, motivo } = valor

  if (typeof restantes !== 'number' || typeof puede !== 'boolean') return null
  if (desde !== null && typeof desde !== 'string') return null
  if (motivo !== null && motivo !== 'espera' && motivo !== 'cupo') return null

  return { restantes_hoy: restantes, puede_ahora: puede, disponible_desde: desde, motivo }
}

/**
 * Valida el bloque de consumo del evento `fin`.
 *
 * @param valor el campo `uso` del payload
 * @returns el bloque, o `null` si falta o no trae los dos contadores
 */
function leerUso (valor: unknown): UsoIA | null {
  if (!esObjeto(valor)) return null

  const { entrada, salida } = valor

  return typeof entrada === 'number' && typeof salida === 'number' ? { entrada, salida } : null
}
