import { useSyncExternalStore } from 'react'

/**
 * Registro de las escrituras en vuelo y de las que no se pudieron confirmar.
 *
 * Con red lenta la persona necesita saber, en cualquier pantalla, si lo que acaba de hacer ya llego al
 * servidor. Toda escritura de `escribirEnBff` se anota aca al salir y se cierra al volver; el
 * indicador global lo lee. Una escritura sin respuesta queda como "sin confirmar" hasta que alguien la
 * descarta o se comprueba, en vez de desaparecer como un fallo mas.
 */

/** Una escritura cuyo resultado se desconoce. */
export interface EscrituraSinConfirmar {
  id: number
  ruta: string
}

/** Lo que ve quien se suscribe: inmutable, para que `useSyncExternalStore` compare por referencia. */
export interface InstantaneaDePendientes {
  enCurso: number
  sinConfirmar: readonly EscrituraSinConfirmar[]
}

/** Cómo terminó una escritura. */
export type DesenlaceDeEscritura = 'ok' | 'error' | 'incierta'

const VACIA: InstantaneaDePendientes = { enCurso: 0, sinConfirmar: [] }

let instantanea: InstantaneaDePendientes = VACIA
let siguienteId = 1
const oyentes = new Set<() => void>()

/** Reemplaza la instantánea y avisa a los suscritos. */
function publicar (siguiente: InstantaneaDePendientes): void {
  instantanea = siguiente
  for (const oyente of oyentes) oyente()
}

/**
 * Anota una escritura que acaba de salir.
 *
 * @param ruta la ruta del BFF, para poder nombrarla si queda sin confirmar
 * @returns la función que la cierra con su desenlace; llamarla dos veces no hace nada la segunda
 */
export function registrarEscritura (ruta: string): (desenlace: DesenlaceDeEscritura) => void {
  const id = siguienteId++
  let cerrada = false

  publicar({ ...instantanea, enCurso: instantanea.enCurso + 1 })

  return (desenlace) => {
    if (cerrada) return
    cerrada = true

    publicar({
      enCurso: Math.max(0, instantanea.enCurso - 1),
      sinConfirmar: desenlace === 'incierta' ? [...instantanea.sinConfirmar, { id, ruta }] : instantanea.sinConfirmar
    })
  }
}

/** Quita del registro las escrituras sin confirmar (la persona ya las revisó). */
export function descartarSinConfirmar (): void {
  if (instantanea.sinConfirmar.length > 0) publicar({ ...instantanea, sinConfirmar: [] })
}

/** Estado actual, para quien no está en un componente. */
export function pendientesAhora (): InstantaneaDePendientes {
  return instantanea
}

/** Vuelve al estado inicial. Solo para pruebas. */
export function reiniciarPendientes (): void {
  siguienteId = 1
  publicar(VACIA)
}

/**
 * Se suscribe al registro.
 *
 * @param oyente se llama en cada cambio
 * @returns la baja
 */
function suscribir (oyente: () => void): () => void {
  oyentes.add(oyente)

  return () => { oyentes.delete(oyente) }
}

/** Las escrituras en vuelo y sin confirmar, reactivas. */
export function usePendientes (): InstantaneaDePendientes {
  return useSyncExternalStore(suscribir, () => instantanea, () => VACIA)
}
