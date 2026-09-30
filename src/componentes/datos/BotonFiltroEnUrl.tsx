'use client'

import { Suspense, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'

interface PropiedadesBotonFiltroEnUrl {
  /** Texto del interruptor. */
  etiqueta: ReactNode
  /** Dice si el filtro está encendido según la URL actual. */
  activo: (params: URLSearchParams) => boolean
  /** Devuelve la query con el filtro alternado, conservando el resto. */
  alternar: (params: URLSearchParams) => URLSearchParams
}

/**
 * Interruptor de un filtro que vive en la URL, para que sobreviva al refresco y se pueda compartir.
 *
 * `replace` y no `push`: encender y apagar un filtro no son pasos de una navegacion, y con `push`
 * el boton "Atras" del navegador tendria que deshacer un clic a la vez antes de salir de la hoja.
 *
 * Las funciones no cruzan de un Server Component a uno de cliente, asi que cada filtro concreto es
 * un envoltorio de cliente de una linea (`BotonCompletados`, `BotonCompletadas`, `BotonCreadas`).
 *
 * @param props.etiqueta texto del boton
 * @param props.activo predicado sobre la query actual
 * @param props.alternar transformacion de la query al pulsar
 * Trae su propio limite de Suspense porque lee `useSearchParams`: mientras la query no esta, se
 * pinta el mismo boton deshabilitado con su etiqueta, asi el encabezado no salta al llegar.
 *
 * @returns el boton con `aria-pressed` y la variante marcada cuando esta encendido
 */
export function BotonFiltroEnUrl (props: PropiedadesBotonFiltroEnUrl) {
  return (
    <Suspense fallback={<Boton variante="secundario" disabled>{props.etiqueta}</Boton>}>
      <InterruptorEnUrl {...props} />
    </Suspense>
  )
}

/** El interruptor ya con la query en mano; ver `BotonFiltroEnUrl`. */
function InterruptorEnUrl ({ etiqueta, activo, alternar }: PropiedadesBotonFiltroEnUrl) {
  const router = useRouter()
  const params = useSearchParams()
  const encendido = activo(new URLSearchParams(params.toString()))

  return (
    <Boton
      aria-pressed={encendido}
      variante={encendido ? 'marca' : 'secundario'}
      onClick={() => {
        const siguientes = alternar(new URLSearchParams(params.toString()))

        router.replace(`?${siguientes.toString()}`, { scroll: false })
      }}
    >
      {etiqueta}
    </Boton>
  )
}
