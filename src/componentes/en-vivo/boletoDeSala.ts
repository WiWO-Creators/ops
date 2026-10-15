import { conLimite, TIEMPO_LECTURA_MS } from '@/datos/red'

/**
 * Quién es la persona de esta pestaña, según el último boleto que el BFF le dio. La presencia lo usa
 * para no mostrarle a nadie su propio avatar. Vive en el módulo y no en un componente porque el cliente
 * del bus guarda un solo pedido de boleto por sala, aunque varios componentes la usen.
 */
let quienSoy: number | null = null
const oyentesDeQuienSoy = new Set<() => void>()

/** El id de la persona de esta pestaña, o `null` mientras ningún boleto lo haya dicho. */
export function staffIdConocido (): number | null {
  return quienSoy
}

/**
 * Avisa cuando se llega a saber quién es la persona de esta pestaña.
 *
 * @param oyente se llama sin argumentos; leer el valor con {@link staffIdConocido}
 * @returns la función que deja de avisar
 */
export function escucharQuienSoy (oyente: () => void): () => void {
  oyentesDeQuienSoy.add(oyente)

  return () => { oyentesDeQuienSoy.delete(oyente) }
}

function recordarQuienSoy (staffId: unknown): void {
  if (typeof staffId !== 'number' || !Number.isSafeInteger(staffId) || staffId <= 0 || staffId === quienSoy) return

  quienSoy = staffId
  for (const oyente of [...oyentesDeQuienSoy]) oyente()
}

/**
 * Pide al BFF un boleto para una sala suelta (la de un recurso que se está mirando).
 *
 * El BFF comprueba con la API, con el token de la persona, que puede leer el recurso y firma un
 * boleto de pocos segundos; por eso se pide uno en cada suscripción y no se guarda.
 *
 * @param sala la sala pedida, por ejemplo `recurso:tarea:12`
 * @returns el boleto, o `null` si no se pudo (sin sesión, sin permiso, apagado, red caída)
 */
export async function pedirBoletoDeSala (sala: string): Promise<string | null> {
  try {
    const respuesta = await fetch('/api/en-vivo/boleto', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ salas: [sala] }),
      cache: 'no-store',
      signal: conLimite(undefined, TIEMPO_LECTURA_MS)
    })

    if (!respuesta.ok) return null

    const sobre = await respuesta.json() as { data?: { boleto?: unknown, staff_id?: unknown } }
    const { boleto, staff_id: staffId } = sobre.data ?? {}

    recordarQuienSoy(staffId)

    return typeof boleto === 'string' && boleto !== '' ? boleto : null
  } catch {
    return null
  }
}
