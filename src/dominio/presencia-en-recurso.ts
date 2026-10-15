/**
 * Presencia en recursos («Ops en vivo», fase 6): quién está mirando una Tarea, un Ticket o un
 * Proyecto, y quién está escribiendo la respuesta de un Ticket. Es lógica pura, sin React ni socket,
 * para probarla con `node:test`.
 *
 * El bus solo transporta ids de personas del equipo. Los nombres y las fotos salen del catálogo de
 * personas que el panel ya tiene (`cargarAsignables`); una persona que el catálogo no conoce no se
 * dibuja. «Escribiendo» es efímero: se olvida solo, no se guarda en ninguna parte.
 */

/** Los recursos que tienen sala de presencia. */
export type TipoDeRecurso = 'tarea' | 'ticket' | 'proyecto'

/** Cuánto sigue diciéndose «está respondiendo» tras el último aviso de esa persona. */
export const ESCRIBIENDO_VIGENTE_MS = 5000

/** El navegador no repite «escribiendo» más seguido que esto, aunque se siga tecleando. */
export const AVISO_ESCRIBIENDO_CADA_MS = 3000

/** Lo mínimo que se necesita de una persona para dibujarla. */
export interface PersonaDePresencia {
  id: number
  full_name: string
  profile_image_url?: string | null
}

/**
 * El nombre de la sala de presencia de un recurso.
 *
 * @param tipo qué recurso es
 * @param id su id (entero positivo)
 * @returns `recurso:{tipo}:{id}`
 * @throws Error si el id no es un entero positivo
 */
export function salaDeRecurso (tipo: TipoDeRecurso, id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('El id del recurso debe ser un entero positivo.')

  return `recurso:${tipo}:${id}`
}

/**
 * Quita de la lista a quien mira: su propia presencia no se le muestra.
 *
 * @param ids los ids presentes, tal como los difundió el servicio
 * @param yoId el id de quien mira, o `null` si todavía no se sabe
 * @returns los demás, en el mismo orden
 */
export function sinMiPresencia (ids: readonly number[], yoId: number | null): number[] {
  return ids.filter((id) => id !== yoId)
}

/**
 * Anota que una persona acaba de escribir.
 *
 * @param registro marca (ms) del último aviso de cada persona
 * @param staffId quién escribió
 * @param ahora marca (ms) actual
 * @returns un registro nuevo; el original no se toca
 */
export function registrarEscritura (registro: ReadonlyMap<number, number>, staffId: number, ahora: number): Map<number, number> {
  const siguiente = new Map(registro)

  siguiente.set(staffId, ahora)

  return siguiente
}

/**
 * Quiénes siguen escribiendo ahora.
 *
 * @param registro marca (ms) del último aviso de cada persona
 * @param ahora marca (ms) actual
 * @returns los ids cuyo último aviso aún no venció, del más antiguo al más reciente
 */
export function escribiendoVigentes (registro: ReadonlyMap<number, number>, ahora: number): number[] {
  return [...registro.entries()]
    .filter(([, marca]) => ahora - marca < ESCRIBIENDO_VIGENTE_MS)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
}

/**
 * Cuánto falta para que se venza el próximo aviso de «escribiendo».
 *
 * @param registro marca (ms) del último aviso de cada persona
 * @param ahora marca (ms) actual
 * @returns milisegundos hasta el próximo vencimiento, o `null` si no hay avisos vigentes
 */
export function msHastaElProximoVencimiento (registro: ReadonlyMap<number, number>, ahora: number): number | null {
  let espera: number | null = null

  for (const marca of registro.values()) {
    const faltan = marca + ESCRIBIENDO_VIGENTE_MS - ahora

    if (faltan > 0 && (espera === null || faltan < espera)) espera = faltan
  }

  return espera
}

/**
 * Si ya toca avisar que se está escribiendo.
 *
 * @param ultimoMs marca (ms) del último aviso enviado, o `null` si no hubo
 * @param ahora marca (ms) actual
 * @returns `true` si pasaron al menos {@link AVISO_ESCRIBIENDO_CADA_MS}
 */
export function debeAvisarEscribiendo (ultimoMs: number | null, ahora: number): boolean {
  return ultimoMs === null || ahora - ultimoMs >= AVISO_ESCRIBIENDO_CADA_MS
}

/**
 * Las personas del catálogo que corresponden a los ids.
 *
 * @param ids los ids, en el orden en que deben salir
 * @param catalogo las personas conocidas
 * @returns las personas encontradas, en el orden de `ids`; las que el catálogo no conoce se omiten
 */
export function personasDeIds<T extends PersonaDePresencia> (ids: readonly number[], catalogo: readonly T[]): T[] {
  const porId = new Map(catalogo.map((persona) => [persona.id, persona]))
  const encontradas: T[] = []

  for (const id of ids) {
    const persona = porId.get(id)

    if (persona !== undefined) encontradas.push(persona)
  }

  return encontradas
}

/** El primer nombre de pila, que es como se habla de alguien en una frase corta. */
function nombreDePila (nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0] ?? ''
}

/**
 * La frase de quién está respondiendo.
 *
 * @param nombres los nombres completos de quienes escriben ahora
 * @returns «Ana está respondiendo…», «Ana y Luis están respondiendo…», «Ana, Luis y 2 más están
 *          respondiendo…»; cadena vacía si no escribe nadie
 */
export function textoDeEscribiendo (nombres: readonly string[]): string {
  const pilas = nombres.map(nombreDePila).filter((nombre) => nombre !== '')

  if (pilas.length === 0) return ''
  if (pilas.length === 1) return `${pilas[0]} está respondiendo…`
  if (pilas.length === 2) return `${pilas[0]} y ${pilas[1]} están respondiendo…`

  const resto = pilas.length - 2

  return `${pilas[0]}, ${pilas[1]} y ${resto} más están respondiendo…`
}

/**
 * La frase de quiénes más están mirando el recurso.
 *
 * @param cantidad cuántas personas más lo miran (sin contar a quien mira)
 * @returns «1 persona más está viendo esto», «3 personas más están viendo esto»; vacía si es cero
 */
export function textoDePresentes (cantidad: number): string {
  if (cantidad <= 0) return ''

  return cantidad === 1 ? '1 persona más está viendo esto' : `${cantidad} personas más están viendo esto`
}
