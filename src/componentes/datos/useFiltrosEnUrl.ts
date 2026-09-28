'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import {
  agregarPrefijo,
  parametroPropio,
  parametrosPropios,
  urlConCambio,
  urlConParametroPropio
} from './filtros-en-url'

/**
 * Lee y escribe en la URL el estado de una vista de lista, con soporte de prefijo de parametros.
 *
 * Extraido de `TablaRecurso`: es la logica que traduce un estado (`E`) a la URL y viceversa via
 * `useSearchParams` + `router.replace`, preservando los parametros ajenos. `TablaRecurso` lo usa
 * para su `EstadoConsulta`, y `TarjetasClientes` (`VistaClientes.tsx`) lo usa igual en vez de repetir
 * la traduccion a mano.
 *
 * El prefijo es lo que deja montar dos instancias en la misma pagina sin que se pisen: "Mis Tareas"
 * pinta una tabla de Espacios/Licitaciones y otra de Tareas privadas, y sin prefijo las dos leerian y
 * escribirian `page`, `sort` y `filter[...]` en el mismo lugar.
 */
export interface OpcionesFiltrosEnUrl<E> {
  /** Traduce los parametros propios de esta instancia (ya sin el prefijo) al estado `E`. */
  leer: (params: URLSearchParams) => E
  /** Serializa el estado `E` a query string, sin `?` y sin prefijo. */
  construir: (estado: E) => string
  /** Prefijo de cada clave que esta instancia posee en la URL. Ausente = sin prefijo. */
  prefijo?: string
}

export interface FiltrosEnUrl<E> {
  /** El estado vigente, leido de la URL. */
  estado: E
  /** Los parametros crudos de la URL completa (todas las instancias, con o sin prefijo). */
  params: ReadonlyURLSearchParams
  /** Aplica un cambio parcial al estado y lo escribe en la URL, conservando lo ajeno. */
  cambiar: (parcial: Partial<E>) => void
  /** La URL con un parametro suelto propio de esta instancia puesto, sin navegar. */
  urlConParametro: (clave: string, valor: string) => string
  /** Escribe un parametro suelto propio de esta instancia, conservando el resto. */
  escribirParametro: (clave: string, valor: string) => void
  /** Lee un parametro suelto propio de esta instancia. */
  leerParametro: (clave: string) => string | null
}

/**
 * @param opciones `leer`/`construir` de la traduccion estado-URL, y el `prefijo` opcional.
 * @returns el estado vigente y las funciones para cambiarlo o leer/escribir un parametro suelto.
 */
export function useFiltrosEnUrl<E> ({ leer, construir, prefijo }: OpcionesFiltrosEnUrl<E>): FiltrosEnUrl<E> {
  const router = useRouter()
  const params = useSearchParams()

  const estado = useMemo(
    () => leer(parametrosPropios(new URLSearchParams(params.toString()), prefijo)),
    [params, prefijo, leer]
  )

  /** Aplica un cambio parcial escribiendolo en la URL. `replace` y no `push`: cada tecleo de filtro
   * seria una entrada del historial y salir de la vista con "atras" pasaria a ser imposible. */
  function cambiar (parcial: Partial<E>): void {
    const siguiente = { ...estado, ...parcial }
    const url = urlConCambio(
      new URLSearchParams(params.toString()),
      construir(estado),
      construir(siguiente),
      prefijo
    )

    router.replace(url, { scroll: false })
  }

  function urlConParametro (clave: string, valor: string): string {
    return urlConParametroPropio(new URLSearchParams(params.toString()), clave, valor, prefijo)
  }

  function escribirParametro (clave: string, valor: string): void {
    router.replace(urlConParametro(clave, valor), { scroll: false })
  }

  function leerParametro (clave: string): string | null {
    return parametroPropio(params, clave, prefijo)
  }

  return { estado, params, cambiar, urlConParametro, escribirParametro, leerParametro }
}

export interface ParametroEnUrl {
  /** El valor vigente, o `null` si el parametro no esta puesto. */
  valor: string | null
  /** Escribe el valor en la URL, conservando el resto. */
  escribir: (valor: string) => void
  /** Saca el parametro de la URL, conservando el resto. */
  quitar: () => void
}

/**
 * Version minima de `useFiltrosEnUrl` para un solo parametro suelto, sin `EstadoConsulta` de por
 * medio: `?tarea=12` que abre un modal, `?regla=8` que resalta una fila. Es el mismo mecanismo —leer
 * y escribir en la URL preservando lo ajeno, con prefijo opcional— que antes se repetia a mano en
 * `VistaRecurrentes.tsx`.
 *
 * @param clave el parametro, sin prefijo
 * @param prefijo prefijo de esta instancia, igual que en `useFiltrosEnUrl`
 */
export function useParametroEnUrl (clave: string, prefijo?: string): ParametroEnUrl {
  const router = useRouter()
  const params = useSearchParams()

  const valor = parametroPropio(params, clave, prefijo)

  function escribir (valorNuevo: string): void {
    router.replace(urlConParametroPropio(new URLSearchParams(params.toString()), clave, valorNuevo, prefijo), { scroll: false })
  }

  function quitar (): void {
    const siguientes = new URLSearchParams(params.toString())

    siguientes.delete(agregarPrefijo(clave, prefijo))

    const texto = siguientes.toString()

    router.replace(texto === '' ? '?' : `?${texto}`, { scroll: false })
  }

  return { valor, escribir, quitar }
}
