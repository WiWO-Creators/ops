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
  SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { pedirTodasLasPaginas } from '@/datos/cliente'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { filtrarEspaciosDelCombo, identificadorDeEspacio } from '@/dominio/live'
import { cn } from '@/lib/clases'

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
 * peticion por letra para recortar filas que ya estan en memoria.
 *
 * === EL CATALOGO ENTERO, Y CADA FILA CON SU PATENTE Y SU CLIENTE ===
 *
 * Se traen todas las paginas: con una sola, lo que caia despues del tope no estaba, y quien arrancaba
 * la jornada buscaba su Proyecto y concluia que no existia. Y los nombres se repiten entre Clientes
 * ("Campaña septiembre" hay varias), asi que cada fila lleva la patente —lo que la gente dicta y
 * anota— y el Cliente; el buscador mira los tres. Esta siempre visible, sin el umbral de los otros
 * menus: aca la lista se busca siempre, y un campo que aparece o no segun cuantas filas haya es un
 * control que cambia de forma entre personas.
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

    pedirTodasLasPaginas<Espacio>('projects', control.signal)
      .then(setEspacios)
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
  const visibles = filtrarEspaciosDelCombo(todos, busqueda)
  const nombre = GLOSARIO.espacio.singular.toLowerCase()

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        disabled={deshabilitado || cargando}
        className={cn(CLASES_DISPARADOR, 'w-full', elegido === null && 'text-texto-sutil', className)}
      >
        {elegido === null
          ? <span className="truncate">{cargando ? 'Cargando…' : `Elige un ${nombre}`}</span>
          : (
            <span className="flex min-w-0 items-baseline gap-2">
              <IdentificadorDeEspacio espacio={elegido} />
              <span className="truncate">{elegido.name}</span>
            </span>
            )}
        <ChevronSelector />
      </DisparadorMenu>

      <ContenidoMenu
        align="start"
        // Al ancho del disparador, con tope: los nombres largos se leen enteros y el panel no se sale
        // de la pantalla en un telefono.
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]"
      >
        <BuscadorMenu
          valor={busqueda}
          onCambiar={setBusqueda}
          placeholder={`Buscar por código, ${nombre} o cliente…`}
        />

        <GrupoRadioMenu
          value={elegido === null ? '' : String(elegido.id)}
          onValueChange={(nuevo) => { onElegir(Number(nuevo)) }}
        >
          {visibles.map((espacio) => (
            <ItemMenuRadio key={espacio.id} value={String(espacio.id)}>
              <FilaDeEspacio espacio={espacio} />
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
        <p role="status" aria-live="polite" className="sr-only">
          {visibles.length === 1
            ? `1 ${nombre} en la lista`
            : `${visibles.length} ${GLOSARIO.espacio.plural.toLowerCase()} en la lista`}
        </p>
      </ContenidoMenu>
    </MenuContextual>
  )
}

/**
 * La patente del Espacio, en monoespaciada: es lo que distingue dos Espacios del mismo nombre.
 * El prefijo solo para lectores de pantalla dice que es, igual que en la tarjeta de la Tarea.
 */
function IdentificadorDeEspacio ({ espacio }: { espacio: Espacio }) {
  return (
    <span data-numerico className="text-texto shrink-0 font-mono text-xs font-semibold">
      <span className="sr-only">Identificador: </span>
      {identificadorDeEspacio(espacio)}
    </span>
  )
}

/**
 * Una opcion del combo en dos lineas: patente y nombre arriba, Cliente abajo. Sin logo a proposito:
 * en un menu angosto la imagen se come el ancho que necesita el nombre.
 */
function FilaDeEspacio ({ espacio }: { espacio: Espacio }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="flex min-w-0 items-baseline gap-2">
        <IdentificadorDeEspacio espacio={espacio} />
        <span className="truncate">{espacio.name}</span>
      </span>
      <span className="text-texto-sutil truncate text-xs">
        {espacio.client?.company ?? 'Sin cliente'}
      </span>
    </span>
  )
}
