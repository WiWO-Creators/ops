'use client'

import { useState } from 'react'
import { Building2, X } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { CLASES_CONTROL } from '@/componentes/formularios/Entrada'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  ContenidoMenu, DisparadorMenu, ItemMenuMarcable, MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { GLOSARIO } from '@/dominio/glosario'
import { normalizar } from '@/dominio/salas'
import { cn } from '@/lib/clases'

/** Lo minimo que el selector necesita de un Cliente: como se llama y con que se lo dibuja. */
export interface ClienteElegible {
  id: number
  company: string
  image_url: string | null
}

interface PropsSelectorClientes {
  clientes: ClienteElegible[]
  elegidos: number[]
  onCambiar: (ids: number[]) => void
  id?: string
}

/**
 * Filtra la lista por lo que se escribio, con el mismo criterio que el selector de personas.
 *
 * Busca por partes sueltas —"norte constructora" encuentra a "Constructora Norte"— porque el nombre
 * de una empresa casi nunca se recuerda en el orden en que esta escrito, y `normalizar` saca acentos
 * y mayusculas antes de comparar. Una busqueda vacia devuelve todo.
 *
 * @param clientes lista completa
 * @param busqueda lo tipeado
 * @returns los que coinciden, en el mismo orden en que llegaron
 */
function filtrarClientes (clientes: ClienteElegible[], busqueda: string): ClienteElegible[] {
  const partes = normalizar(busqueda).split(/\s+/).filter((parte) => parte !== '')

  if (partes.length === 0) return clientes

  return clientes.filter((cliente) => {
    const nombre = normalizar(cliente.company)

    return partes.every((parte) => nombre.includes(parte))
  })
}

/**
 * Elige varios Clientes: hoy, de cuales es {@link GLOSARIO.focal} una persona.
 *
 * Es el gemelo de `SelectorPersonas` para el otro lado de la relacion, y se ve igual a proposito: la
 * misma pantalla se edita desde la ficha del Cliente con uno y desde la de la persona con el otro, y
 * dos controles distintos para la misma decision se leen como dos decisiones distintas.
 *
 * Menu con marcas y no un `Select`: se eligen varios, y el `Select` de Radix es de una sola opcion.
 * El buscador no es opcional —la instalacion tiene cientos de Clientes— y sus teclas se frenan con
 * `stopPropagation` porque Radix implementa "tipear para saltar a una opcion" dentro del menu: sin
 * eso, cada letra mueve el foco a otra fila en vez de escribirse.
 *
 * Los elegidos se muestran como chips debajo, y cada chip es el boton que lo saca: el resumen
 * "3 clientes" obliga a abrir el menu para saber cuales son, que es justo lo que se esta revisando.
 *
 * @param clientes catalogo completo entre el que se elige
 * @param elegidos ids ya elegidos
 * @param onCambiar recibe la lista entera de ids cada vez que se agrega o se saca uno
 * @param id para enlazar la etiqueta del campo con el disparador
 */
export function SelectorClientes ({ clientes, elegidos, onCambiar, id }: PropsSelectorClientes) {
  const [busqueda, setBusqueda] = useState('')

  const visibles = filtrarClientes(clientes, busqueda)
  const elegidosEnOrden = clientes.filter((cliente) => elegidos.includes(cliente.id))

  const singular = GLOSARIO.cliente.singular.toLowerCase()
  const plural = GLOSARIO.cliente.plural.toLowerCase()

  /** Agrega o saca un Cliente de la lista. */
  function alternar (clienteId: number): void {
    onCambiar(
      elegidos.includes(clienteId)
        ? elegidos.filter((elegido) => elegido !== clienteId)
        : [...elegidos, clienteId]
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
        <DisparadorMenu
          id={id}
          className={cn(CLASES_DISPARADOR, elegidos.length === 0 && 'text-texto-sutil')}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">
              {elegidos.length === 0
                ? `Agregar ${plural}`
                : `${elegidos.length} ${elegidos.length === 1 ? singular : plural}`}
            </span>
          </span>
          <ChevronSelector />
        </DisparadorMenu>

        <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <div className="p-1">
            <input
              className={cn(CLASES_CONTROL, 'h-8 text-sm')}
              placeholder="Buscar por nombre…"
              value={busqueda}
              aria-label={`Buscar un ${singular}`}
              onChange={(evento) => setBusqueda(evento.target.value)}
              onKeyDown={(evento) => evento.stopPropagation()}
            />
          </div>

          {/* La lista scrollea dentro del menú: con cientos de filas, un menú del alto del contenido
              tapa la pantalla entera y deja el resto del panel inalcanzable. */}
          <div className="max-h-64 overflow-y-auto">
            {visibles.length === 0
              ? <p className="text-texto-sutil px-2.5 py-3 text-center text-xs">Ninguno con ese nombre.</p>
              : visibles.map((cliente) => (
                <ItemMenuMarcable
                  key={cliente.id}
                  checked={elegidos.includes(cliente.id)}
                  onCheckedChange={() => alternar(cliente.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar nombre={cliente.company} imagen={cliente.image_url} tamano="chico" />
                    <span className="truncate">{cliente.company}</span>
                  </span>
                </ItemMenuMarcable>
                ))}
          </div>
        </ContenidoMenu>
      </MenuContextual>

      {elegidosEnOrden.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {elegidosEnOrden.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                onClick={() => alternar(cliente.id)}
                aria-label={`Sacar a ${cliente.company}`}
                className={cn(
                  'bg-relleno-neutro text-relleno-neutro-contenido rounded-control',
                  'flex items-center gap-1.5 py-0.5 pl-0.5 pr-2 text-xs',
                  'transition-[filter] duration-150 hover:brightness-95'
                )}
              >
                <Avatar nombre={cliente.company} imagen={cliente.image_url} tamano="chico" />
                <span className="max-w-40 truncate">{cliente.company}</span>
                <X size={12} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
