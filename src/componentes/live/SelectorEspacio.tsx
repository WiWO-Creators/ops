'use client'

import { useEffect, useState } from 'react'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { pedirSobre } from '@/datos/cliente'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * Cuantos Espacios se traen para el combo.
 *
 * No pagina a proposito: es un desplegable dentro de un control de cabecera, no un listado. Quien
 * tenga mas Espacios que esto va igual a `/espacios` y arranca el medidor desde la ficha, que es el
 * camino que ya existia.
 */
const ESPACIOS_A_TRAER = 100

interface PropsSelectorEspacio {
  /** El Espacio elegido, o `null` si todavia no se eligio ninguno. */
  valor: number | null
  onElegir: (id: number) => void
  deshabilitado?: boolean
  /** Para asociarlo con la etiqueta que lo nombra desde afuera. */
  id?: string
  className?: string
}

/**
 * Combo de Espacios para arrancar el medidor sin salir de donde uno esta.
 *
 * Pide su lista **una vez, al montarse**, y nunca mas: los Espacios de una persona no cambian entre
 * dos pulsaciones de un boton, y meterlos en el intervalo del control convertiria un dato estable en
 * trafico permanente. LIVE tiene exactamente dos sitios que repreguntan solos, y este no es ninguno.
 *
 * Un fallo aca no puede tumbar el control: se dice que la lista no cargo y la jornada se sigue
 * abriendo y cerrando igual, que es lo principal que el control hace.
 */
export function SelectorEspacio ({
  valor,
  onElegir,
  deshabilitado = false,
  id,
  className
}: PropsSelectorEspacio) {
  const [espacios, setEspacios] = useState<Espacio[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<Espacio[]>(`projects?per_page=${ESPACIOS_A_TRAER}`, control.signal)
      .then((sobre) => { setEspacios(sobre.data) })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la lista.')
      })

    return () => { control.abort() }
  }, [])

  if (error !== null) {
    return <p className="text-texto-peligro text-xs">{error}</p>
  }

  const cargando = espacios === null
  const vacio = espacios !== null && espacios.length === 0

  if (vacio) {
    return (
      <p className="text-texto-sutil text-xs">
        No tienes {GLOSARIO.espacio.plural.toLowerCase()} donde medir tiempo.
      </p>
    )
  }

  return (
    <Selector
      value={valor === null ? undefined : String(valor)}
      onValueChange={(elegido) => { onElegir(Number(elegido)) }}
      disabled={deshabilitado || cargando}
    >
      <DisparadorSelector
        id={id}
        marcador={cargando ? 'Cargando…' : `Elige un ${GLOSARIO.espacio.singular.toLowerCase()}`}
        className={cn('w-full', className)}
      />
      <ContenidoSelector>
        {(espacios ?? []).map((espacio) => (
          <Opcion key={espacio.id} value={String(espacio.id)}>
            {espacio.name}
          </Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}
