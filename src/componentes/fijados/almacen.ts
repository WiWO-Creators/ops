'use client'

import { useSyncExternalStore } from 'react'
import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import { avisarError } from '@/lib/aviso-de-error'
import { estaFijado, type Fijado, type TipoFijable } from './fijados'

/**
 * La lista de fijados del navegador, compartida por el menu, la paleta, el Inicio y el boton de las
 * fichas.
 *
 * Una sola copia en el modulo y no un contexto: los cuatro lectores viven en ramas distintas del
 * arbol —el armazon, una pagina, un dialogo en portal— y un proveedor tendria que envolver el panel
 * entero desde el layout, que es un componente de servidor. `useSyncExternalStore` es la forma que
 * React tiene para leer un valor de afuera sin desgarros entre dos lectores del mismo render.
 *
 * El servidor trae la lista con la pagina (`GET /me/fijados` en el armazon y en el Inicio) y la
 * SIEMBRA aca; desde ese momento la verdad es esta copia. Asi fijar desde la ficha de un Proyecto
 * aparece en el menu en el mismo fotograma, sin volver a pedir el armazon.
 */

/** `null` mientras nadie sembro la lista: los lectores usan la que les dio el servidor. */
let lista: Fijado[] | null = null
const oyentes = new Set<() => void>()

/** Avisa a todos los lectores que la lista cambio. */
function emitir (): void {
  for (const oyente of oyentes) oyente()
}

/**
 * Suscripcion para `useSyncExternalStore`.
 *
 * @param oyente callback de React
 * @returns la baja
 */
function suscribir (oyente: () => void): () => void {
  oyentes.add(oyente)

  return () => { oyentes.delete(oyente) }
}

/**
 * Deja la lista que trajo el servidor, salvo que ya haya una en el navegador.
 *
 * La que ya esta gana porque puede ser mas nueva: alguien fijo algo en esta pestaña y despues
 * navego a una pagina que se renderizo con la lista vieja.
 *
 * @param inicial la lista del servidor
 */
export function sembrarFijados (inicial: Fijado[]): void {
  if (lista !== null) return
  lista = inicial
  emitir()
}

/**
 * Lee los fijados vigentes.
 *
 * @param inicial lo que trajo el servidor, para el primer render y para el HTML del servidor
 * @returns la lista vigente
 */
export function useFijados (inicial: Fijado[] = SIN_FIJADOS): Fijado[] {
  return useSyncExternalStore(suscribir, () => lista ?? inicial, () => inicial)
}

/** Referencia estable para "sin lista": un `[]` literal por render haria que React re-renderizara sin fin. */
const SIN_FIJADOS: Fijado[] = []

/**
 * Fija o quita un elemento, con la lista actualizada antes de que conteste la API.
 *
 * Optimista a proposito: la estrella tiene que responder en el mismo toque. Si la API rechaza, la
 * lista vuelve a como estaba y el error se avisa —con su codigo, si lo hay— en el aviso flotante,
 * porque el boton no tiene un lugar propio donde escribirlo.
 *
 * @param elemento lo que se fija, con lo necesario para pintarlo mientras contesta la API
 * @returns el resultado de la escritura
 */
export async function alternarFijado (
  elemento: { type: TipoFijable, id: number, name: string, client: Fijado['client'] }
): Promise<Resultado<Fijado[]>> {
  const antes = lista ?? []
  const quitar = estaFijado(antes, elemento.type, elemento.id)

  lista = quitar
    ? antes.filter((fijado) => !(fijado.type === elemento.type && fijado.id === elemento.id))
    : [...antes, { ...elemento, position: antes.length }]
  emitir()

  const resultado = await escribirEnBff<Fijado[]>(
    `me/fijados/${elemento.type}/${elemento.id}`,
    quitar ? 'DELETE' : 'PUT'
  )

  if (resultado.ok && Array.isArray(resultado.datos)) {
    lista = resultado.datos
  } else if (!resultado.ok) {
    lista = antes
    avisarError({ mensaje: resultado.mensaje })
  }
  emitir()

  return resultado
}
