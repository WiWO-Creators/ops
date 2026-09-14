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
import type { Cliente } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { filtrarPorNombre } from '@/dominio/live'
import { cn } from '@/lib/clases'

/**
 * Cuantos Clientes se traen para el combo.
 *
 * El mismo tope que el listado de Espacios usa para su filtro por Cliente, y por el mismo motivo: es
 * un desplegable dentro de un control de cabecera, no un listado paginado. Quien tenga mas Clientes
 * que esto igual encuentra el suyo escribiendo, mientras este entre los primeros cien que devuelve la
 * API; el caso contrario lo cubre `nombreActual`, que no depende de la lista.
 */
const CLIENTES_A_TRAER = 100

/** El valor con el que viaja "ningun Cliente" dentro del grupo de radios. */
const NINGUNO = 'ninguno'

interface PropsSelectorCliente {
  /** El Cliente elegido, o `null` si todavia no se eligio ninguno. */
  valor: number | null
  /** `null` llega solo cuando `vaciable` esta puesto: es la eleccion de quitar el Cliente. */
  onElegir: (id: number | null) => void
  /**
   * Como se llama el Cliente ya elegido, cuando se sabe por otra via.
   *
   * La jornada trae `client: {id, name}` con el nombre incluido, asi que el disparador puede decirlo
   * **antes** de que la lista termine de cargar, y lo sigue diciendo aunque ese Cliente no este entre
   * los que la lista trajo —se paso del tope, o quedo inactivo—. Sin esto, cambiar el Cliente de una
   * jornada abierta mostraria "Elige un Cliente" encima de un Cliente que si esta puesto.
   */
  nombreActual?: string | null
  /** Si se ofrece la opcion de quedarse sin Cliente. Solo tiene sentido donde ya hay uno puesto. */
  vaciable?: boolean
  deshabilitado?: boolean
  /** Para asociarlo con la etiqueta que lo nombra desde afuera. */
  id?: string
  className?: string
}

/**
 * Combo de Clientes, para decir **para quien** es el dia cuando todavia no se sabe en que Espacio.
 *
 * === POR QUE ES OTRO COMPONENTE Y NO UN `SelectorEspacio` PARAMETRIZADO ===
 *
 * Porque las dos listas se parecen en el dibujo y en nada mas. Piden rutas distintas, nombran el
 * campo distinto —un Cliente se llama `company` y un Espacio `name`—, tienen vacios que dicen cosas
 * distintas, y este ademas admite quedarse sin elegir nada, que alla no existe. Un componente con un
 * `recurso` y un `campoNombre` por prop seria un `if` por cada una de esas diferencias dentro de un
 * archivo que ya no explicaria ninguna.
 *
 * Lo que si se comparte es lo que de verdad es comun: `BuscadorMenu`, `GrupoRadioMenu`,
 * `ItemMenuRadio` y `SinResultadosMenu` salen de `MenuContextual`, y el filtro es el mismo
 * `filtrarPorNombre` que ignora acentos y mayusculas. Ver `SelectorEspacio` para por que es un menu y
 * no un `Select`: el `Select` de Radix no admite un campo de texto dentro del panel, y una lista de
 * cien Clientes sin buscador se recorre a ojo.
 *
 * Un fallo aca no puede tumbar nada: se dice que la lista no cargo, y la jornada se sigue abriendo por
 * los otros dos caminos, que es lo principal que la ventana hace.
 */
export function SelectorCliente ({
  valor,
  onElegir,
  nombreActual = null,
  vaciable = false,
  deshabilitado = false,
  id,
  className
}: PropsSelectorCliente) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Lo tipeado en el buscador. Se vacia al cerrar el menu: al reabrirlo la lista esta entera. */
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<Cliente[]>(`clients?per_page=${CLIENTES_A_TRAER}`, control.signal)
      .then((sobre) => { setClientes(sobre.data) })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la lista.')
      })

    return () => { control.abort() }
  }, [])

  const nombrePlural = GLOSARIO.cliente.plural.toLowerCase()
  const nombreSingular = GLOSARIO.cliente.singular.toLowerCase()

  if (error !== null) {
    return <p className="text-texto-peligro text-xs">{error}</p>
  }

  const cargando = clientes === null
  const vacio = clientes !== null && clientes.length === 0

  if (vacio) {
    return (
      <p className="text-texto-sutil text-xs">
        No hay {nombrePlural} que elegir.
      </p>
    )
  }

  // La API llama `company` al nombre del Cliente y `filtrarPorNombre` —igual que el resto de los
  // combos— espera `name`. La traduccion ocurre aca, una vez, y no en cada sitio que lee la lista.
  const todos = (clientes ?? []).map((cliente) => ({ id: cliente.id, name: cliente.company }))
  const elegido = todos.find((cliente) => cliente.id === valor) ?? null
  const visibles = filtrarPorNombre(todos, busqueda)
  const conBuscador = todos.length >= UMBRAL_BUSCADOR
  // El nombre que llego de la jornada manda cuando el Cliente no esta en la lista traida: la lista
  // corta en cien y esa jornada ya tiene su Cliente puesto igual.
  const etiqueta = elegido?.name ?? (valor !== null ? nombreActual : null)

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        disabled={deshabilitado || cargando}
        className={cn(CLASES_DISPARADOR, 'w-full', etiqueta === null && 'text-texto-sutil', className)}
      >
        <span className="truncate">
          {/* Cargando no borra lo que ya se sabe: con `nombreActual` puesto el disparador dice el
              Cliente desde el primer pintado, y la lista solo sirve para cambiarlo. */}
          {etiqueta ?? (cargando ? 'Cargando…' : `Elige un ${nombreSingular}`)}
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
          <BuscadorMenu
            valor={busqueda}
            onCambiar={setBusqueda}
            placeholder={`Buscar ${nombreSingular}…`}
          />
        )}

        <GrupoRadioMenu
          value={valor === null ? '' : String(valor)}
          onValueChange={(nuevo) => { onElegir(nuevo === NINGUNO ? null : Number(nuevo)) }}
        >
          {/* Quitar el Cliente es una eleccion y no un descuido, asi que se ofrece como una opcion
              mas del grupo y no como una X al costado: en un `menuitemradio` un lector de pantalla
              la anuncia como la opcion elegida, que es exactamente lo que pasa al elegirla. Solo
              donde tiene sentido: en la apertura todavia no hay nada que quitar. */}
          {vaciable && (
            <ItemMenuRadio value={NINGUNO}>
              <span className="truncate">Sin {nombreSingular}</span>
            </ItemMenuRadio>
          )}

          {visibles.map((cliente) => (
            <ItemMenuRadio key={cliente.id} value={String(cliente.id)}>
              <span className="truncate">{cliente.name}</span>
            </ItemMenuRadio>
          ))}
        </GrupoRadioMenu>

        {/* Este vacio no es el de "no hay Clientes" ni el de "la lista no cargo": los tres dicen
            cosas distintas y el unico que se arregla escribiendo otra cosa es este. */}
        {visibles.length === 0 && (
          <SinResultadosMenu>Ningún {GLOSARIO.cliente.singular} coincide.</SinResultadosMenu>
        )}

        {/* Filtrar no mueve el foco, asi que sin esto quien usa un lector de pantalla escribe y no se
            entera de nada: la lista cambia en silencio debajo del campo. */}
        {conBuscador && (
          <p role="status" aria-live="polite" className="sr-only">
            {visibles.length === 1
              ? `1 ${nombreSingular} en la lista`
              : `${visibles.length} ${nombrePlural} en la lista`}
          </p>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
