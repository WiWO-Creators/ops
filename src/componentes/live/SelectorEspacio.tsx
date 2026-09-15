'use client'

import { useEffect, useState } from 'react'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu,
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual,
  SinResultadosMenu,
  UMBRAL_BUSCADOR
} from '@/componentes/superposiciones/MenuContextual'
import { pedirSobre } from '@/datos/cliente'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { filtrarPorNombre } from '@/dominio/live'
import { cn } from '@/lib/clases'

/**
 * Cuantos Espacios se traen para el combo.
 *
 * No pagina a proposito: es un desplegable dentro de un control de cabecera, no un listado. Quien
 * tenga mas Espacios que esto va igual a `/proyectos` y arranca el medidor desde la ficha, que es el
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
 *
 * === POR QUE UN MENU Y NO UN `Select` ===
 *
 * Porque la lista se busca. El catalogo pasa del centenar y el `Select` de Radix no admite nada que
 * no sea una opcion dentro del panel: con cien filas y sin campo de texto, encontrar el propio es
 * recorrerlas a ojo. El menu es la unica primitiva donde cabe el buscador, y es el mismo camino que
 * ya tomaron los filtros de las tablas y el selector de personas — de ahi salen `BuscadorMenu` y
 * `SinResultadosMenu`, que no se reescriben aca.
 *
 * La semantica no se pierde: `ItemMenuRadio` es `menuitemradio`, que es lo que un lector de pantalla
 * necesita para decir cual opcion esta elegida y que elegir una apaga la anterior.
 *
 * El filtro es en cliente sobre la lista que ya se trajo: pedirsela a la API en cada tecla seria una
 * peticion por letra para recortar cien filas que ya estan en memoria.
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
  /** Lo tipeado en el buscador. Se vacia al cerrar el menu: al reabrirlo la lista esta entera. */
  const [busqueda, setBusqueda] = useState('')

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

  const todos = espacios ?? []
  const elegido = todos.find((espacio) => espacio.id === valor) ?? null
  const visibles = filtrarPorNombre(todos, busqueda)
  const conBuscador = todos.length >= UMBRAL_BUSCADOR
  const nombre = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        disabled={deshabilitado || cargando}
        className={cn(CLASES_DISPARADOR, 'w-full', elegido === null && 'text-texto-sutil', className)}
      >
        <span className="truncate">
          {cargando ? 'Cargando…' : elegido?.name ?? `Elige un ${nombre}`}
        </span>
        <ChevronSelector />
      </DisparadorMenu>

      <ContenidoMenu
        align="start"
        // Al ancho del disparador, con tope: los nombres largos se leen enteros y el panel no se sale
        // de la pantalla en un telefono.
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]"
      >
        {conBuscador && (
          <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder={`Buscar ${nombre}…`} />
        )}

        <GrupoRadioMenu
          value={elegido === null ? '' : String(elegido.id)}
          onValueChange={(nuevo) => { onElegir(Number(nuevo)) }}
        >
          {visibles.map((espacio) => (
            <ItemMenuRadio key={espacio.id} value={String(espacio.id)}>
              <span className="truncate">{espacio.name}</span>
            </ItemMenuRadio>
          ))}
        </GrupoRadioMenu>

        {/* Este vacio no es el de "no tienes Proyectos" ni el de "la lista no cargo": los tres dicen
            cosas distintas y el unico que se arregla escribiendo otra cosa es este. */}
        {visibles.length === 0 && (
          <SinResultadosMenu>Ningún {GLOSARIO.espacio.singular} coincide.</SinResultadosMenu>
        )}

        {/* Filtrar no mueve el foco, asi que sin esto quien usa un lector de pantalla escribe y no se
            entera de nada: la lista cambia en silencio debajo del campo. */}
        {conBuscador && (
          <p role="status" aria-live="polite" className="sr-only">
            {visibles.length === 1
              ? `1 ${nombre} en la lista`
              : `${visibles.length} ${GLOSARIO.espacio.plural.toLowerCase()} en la lista`}
          </p>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
