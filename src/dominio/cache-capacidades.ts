import type { CapacidadesOrbe } from './orbe-capacidades.ts'

/** Cuánto vale una respuesta de capacidades antes de volver a pedirla. */
export const TTL_CAPACIDADES_MS = 60_000

const cache = new Map<string, { capacidades: CapacidadesOrbe, hasta: number }>()
const enVuelo = new Map<string, Promise<CapacidadesOrbe>>()

/** Cuenta los cierres de sesión: una lectura iniciada en una generación anterior no se guarda. */
let generacion = 0

/**
 * Capacidades guardadas y todavía vigentes de una ruta.
 *
 * @param ruta Ruta del BFF de capacidades del sujeto.
 * @param ahora Momento de la lectura, en ms; solo se inyecta en pruebas.
 * @returns Las capacidades, o `null` si no hay o ya caducaron.
 */
export function capacidadesEnCache (ruta: string, ahora = Date.now()): CapacidadesOrbe | null {
  const guardada = cache.get(ruta)
  return guardada !== undefined && guardada.hasta > ahora ? guardada.capacidades : null
}

/**
 * Pide las capacidades de una ruta con caché de módulo y una sola petición en vuelo por ruta.
 *
 * Solo se guardan respuestas buenas, y solo si la sesión no se cerró mientras la petición volaba:
 * una respuesta tardía del usuario anterior no debe servir al siguiente.
 *
 * @param ruta Ruta del BFF de capacidades del sujeto.
 * @param cargar Hace la petición real; lanza si la respuesta no es buena.
 * @param ahora Momento de la lectura, en ms; solo se inyecta en pruebas.
 * @returns Las capacidades leídas.
 * @throws Lo que lance `cargar`.
 */
export async function pedirCapacidadesCacheadas (ruta: string, cargar: () => Promise<CapacidadesOrbe>, ahora = Date.now()): Promise<CapacidadesOrbe> {
  const guardada = capacidadesEnCache(ruta, ahora)
  if (guardada !== null) return guardada

  const previa = enVuelo.get(ruta)
  if (previa !== undefined) return await previa

  const mia = generacion
  const peticion: Promise<CapacidadesOrbe> = cargar()
    .then(capacidades => {
      if (mia === generacion) cache.set(ruta, { capacidades, hasta: Date.now() + TTL_CAPACIDADES_MS })
      return capacidades
    })
    .finally(() => { if (enVuelo.get(ruta) === peticion) enVuelo.delete(ruta) })

  enVuelo.set(ruta, peticion)
  return await peticion
}

/** Descarta la caché y las peticiones en vuelo. Al cerrar sesión y en pruebas. */
export function vaciarCapacidadesOrbe (): void {
  generacion += 1
  cache.clear()
  enVuelo.clear()
}
