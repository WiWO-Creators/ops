import type { PersonaAuditoria, PersonaConectada, SesionAbierta } from '../../datos/auditoria.ts'

/**
 * Logica pura del centro de auditoria.
 *
 * Vive en un `.ts` y no dentro de los componentes porque necesita prueba: Node puede despojar los
 * tipos de un `.ts`, pero no el JSX de un `.tsx`. Es la misma razon por la que existen
 * `componentes/equipo/nivel.ts` y `componentes/datos/tabla.ts`.
 */

/** Una sesion ya agrupada: todos los tokens vivos de una persona vistos como una sola. */
export interface SesionDePersona {
  persona: PersonaAuditoria | null
  /** `key` de React. El id de la persona, o el del token si la cuenta ya no existe. */
  clave: string
  desde: string | null
  ultima: string | null
  /** Una entrada por maquina distinta desde la que se pidio un token: "190.44.1.1 · Chrome en Windows". */
  origenes: string[]
  tokens: number
  suplantada: PersonaAuditoria | null
}

/**
 * Junta los tokens vivos de cada persona en una sola sesion.
 *
 * `GET /sessions` devuelve una fila por **token de acceso**, y eso es correcto de su lado: es lo que
 * hay en la tabla. Pero la API rota el par cada hora sin revocar el token de acceso anterior, asi que
 * una sola persona trabajando deja dos o tres filas vivas que son la misma sesion. Pintadas una por
 * una, el bloque se vuelve una lista de veinte veces el mismo nombre y deja de contestar la pregunta
 * que se le hace.
 *
 * `desde` es el mas viejo de sus tokens vivos y `ultima` el mas nuevo; `tokens` es lo unico que se
 * pierde al agrupar, y por eso se conserva y se muestra.
 *
 * La clave es el id de la persona, o el id del token cuando la cuenta ya no existe: dos cuentas
 * eliminadas distintas no son la misma sesion, y agruparlas por `null` las fundiria en una.
 *
 * @param sesiones filas tal como llegan de `GET /sessions`
 * @returns una entrada por persona, de la que dio señales hace menos a la que hace mas
 */
export function agruparSesiones (sesiones: SesionAbierta[]): SesionDePersona[] {
  const porPersona = new Map<string, SesionDePersona>()

  for (const sesion of sesiones) {
    const clave = sesion.staff === null ? `token:${sesion.id}` : `staff:${sesion.staff.id}`
    const previa = porPersona.get(clave)
    const origen = [sesion.ip ?? 'sin IP', dispositivo(sesion.user_agent)].filter((x) => x !== null).join(' · ')

    if (previa === undefined) {
      porPersona.set(clave, {
        persona: sesion.staff,
        clave,
        desde: sesion.started_at,
        ultima: sesion.last_used_at,
        origenes: [origen],
        tokens: 1,
        suplantada: sesion.impersonated_by
      })

      continue
    }

    previa.tokens += 1
    if (!previa.origenes.includes(origen)) previa.origenes.push(origen)

    // Las fechas llegan en ISO-8601 UTC con el mismo largo, asi que se comparan como texto.
    if (previa.desde === null || (sesion.started_at !== null && sesion.started_at < previa.desde)) {
      previa.desde = sesion.started_at
    }
    if (previa.ultima === null || (sesion.last_used_at !== null && sesion.last_used_at > previa.ultima)) {
      previa.ultima = sesion.last_used_at
    }

    previa.suplantada ??= sesion.impersonated_by
  }

  // Quien dio señales hace menos, arriba: es el orden en el que se lee una lista de gente conectada.
  return [...porPersona.values()].sort((a, b) => (b.ultima ?? '').localeCompare(a.ultima ?? ''))
}

/**
 * Cuanto hace del ultimo latido, en palabras.
 *
 * Los segundos los calcula el **servidor** y llegan ya hechos: hacerlo en el navegador con
 * `Date.now()` contra una marca del servidor mete el desfase de reloj de quien mira dentro del dato,
 * y produce el clasico "hace -3 minutos".
 *
 * El primer escalon es 45 s y no 60 porque coincide con el intervalo del latido: por debajo de un
 * latido, la persona esta ahi y decir "hace 1 minuto" seria adelantarse.
 *
 * @param segundos antigüedad del ultimo latido; `null` si el servidor no la pudo calcular
 */
export function haceCuanto (segundos: number | null): string {
  if (segundos === null) return 'hace un rato'
  if (segundos < 45) return 'ahora'
  if (segundos < 120) return 'hace 1 minuto'

  return `hace ${Math.round(segundos / 60)} minutos`
}

/**
 * El `User-Agent` en dos palabras: "Chrome en Windows".
 *
 * La cadena cruda son 200 caracteres de historia del navegador —`Mozilla/5.0`, `AppleWebKit`,
 * `like Gecko`— que en una tabla no se leen: desbordan la fila y esconden el unico dato que se
 * buscaba, que es desde que maquina entro alguien.
 *
 * Se detecta a mano y no con una libreria porque la pregunta es "¿desde donde entro esta persona?",
 * no "¿que motor de renderizado usa?": son seis navegadores y cinco sistemas, y una dependencia
 * nueva para eso se actualiza sola hacia problemas que este proyecto no tiene.
 *
 * El orden de las comprobaciones NO es alfabetico y no se puede reordenar: Edge se anuncia como
 * Chrome, Chrome se anuncia como Safari y Opera se anuncia como los dos. Quien mira primero al mas
 * mentiroso acierta; al reves, todo el mundo usa Safari.
 *
 * @param agente el `user_agent` tal como lo devuelve la API; `null` si no se registro
 * @returns la frase legible, o `null` si no hay nada que decir
 */
export function dispositivo (agente: string | null): string | null {
  if (agente === null || agente.trim() === '') return null

  // Lo que manda el propio servidor de Ops cuando no puede reenviar el navegador de la persona.
  // Decirlo con todas las letras evita que alguien lea "node" como un dispositivo.
  if (agente === 'node' || agente.startsWith('node/')) return 'el servidor de Ops'

  const navegador = NAVEGADORES.find(([, patron]) => patron.test(agente))?.[0] ?? null
  const sistema = SISTEMAS.find(([, patron]) => patron.test(agente))?.[0] ?? null

  if (navegador === null && sistema === null) return agente.slice(0, 40)
  if (sistema === null) return navegador
  if (navegador === null) return sistema

  return `${navegador} en ${sistema}`
}

/**
 * De la mentira mas grande a la mas chica: Edge dice ser Chrome, y Chrome dice ser Safari.
 *
 * `Chrome` va sin `\b` a proposito: el navegador sin ventana se anuncia como `HeadlessChrome/`, y un
 * limite de palabra ahi lo dejaria afuera y lo haria caer en Safari, que es la fila siguiente.
 */
const NAVEGADORES: Array<[string, RegExp]> = [
  ['Edge', /\bEdg(e|A|iOS)?\//],
  ['Opera', /\bOPR\/|\bOpera\//],
  ['Samsung Internet', /SamsungBrowser\//],
  ['Firefox', /\bFirefox\/|\bFxiOS\//],
  ['Chrome', /Chrome\/|\bCriOS\//],
  ['Safari', /\bSafari\//]
]

/** iPhone y iPad antes que Mac: Safari de iPad se anuncia como Macintosh desde iPadOS 13. */
const SISTEMAS: Array<[string, RegExp]> = [
  ['iPhone', /\biPhone\b/],
  ['iPad', /\biPad\b/],
  ['Android', /\bAndroid\b/],
  ['Windows', /\bWindows\b/],
  ['macOS', /\bMac OS X\b|\bMacintosh\b/],
  ['Linux', /\bLinux\b|\bX11\b/]
]


export interface RamaPresencia {
  clave: string
  nombre: string
  personas: PersonaConectada[]
  ramas: RamaPresencia[]
  total: number
}

/**
 * Agrupa personas por cliente → proyecto → tarea según su ubicación actual.
 * Conserva actividad general y relaciones ausentes sin inventar asignaciones.
 * @param personas latidos vigentes del servidor
 * @returns ramas con personas en su nivel real y cantidades acumuladas
 */
export function arbolDePresencia (personas: PersonaConectada[]): RamaPresencia[] {
  const raiz: RamaPresencia[] = []
  for (const persona of personas) {
    const contexto = persona.context
    const niveles = [
      { entidad: contexto?.client, tipo: 'cliente', vacio: 'Sin cliente / actividad general' },
      { entidad: contexto?.project, tipo: 'proyecto', vacio: 'Sin proyecto' },
      { entidad: contexto?.task, tipo: 'tarea', vacio: 'Sin tarea' }
    ]
    const ultimoNivel = contexto?.task != null ? 2 : contexto?.project != null ? 1 : 0
    let ramas = raiz
    for (const [indice, nivel] of niveles.entries()) {
      if (indice > ultimoNivel) break
      const clave = `${nivel.tipo}:${nivel.entidad?.id ?? 'sin'}`
      let rama = ramas.find((actual) => actual.clave === clave)
      if (rama === undefined) {
        rama = { clave, nombre: nivel.entidad?.name ?? nivel.vacio, personas: [], ramas: [], total: 0 }
        ramas.push(rama)
      }
      rama.total++
      if (indice === ultimoNivel) rama.personas.push(persona)
      ramas = rama.ramas
    }
  }
  return raiz
}
