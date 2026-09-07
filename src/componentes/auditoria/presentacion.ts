import type { PersonaAuditoria, SesionAbierta } from '../../datos/auditoria.ts'

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
    const origen = [sesion.ip ?? 'sin IP', sesion.user_agent].filter((x) => x !== null).join(' · ')

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
