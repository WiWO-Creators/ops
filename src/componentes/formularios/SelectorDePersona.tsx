'use client'

import { useState } from 'react'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu, ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual, SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { filtrarPorPalabras } from '@/dominio/busqueda'
import { cn } from '@/lib/clases'

/** Cuántas personas se listan de una vez. Lo demás se acota escribiendo. */
const MAXIMO_VISIBLES = 60

/** Una opción del buscador: basta con el id, el nombre y un detalle opcional debajo. */
export interface OpcionDePersona {
  staffid: number
  nombre: string
  detalle?: string
}

interface PropsSelectorDePersona {
  opciones: OpcionDePersona[]
  /** El elegido, o `null` para "nadie". */
  valor: number | null
  onCambiar: (staffid: number | null) => void
  /** Qué dice el disparador cuando no hay nadie elegido, y la fila que vuelve a "nadie". */
  marcador: string
  /** Nombre accesible del disparador. */
  etiqueta: string
  /** Sin esta fila, "nadie" no se puede volver a elegir: sirve para filtros que exigen alguien. */
  permitirNinguno?: boolean
  /** Por qué no aparece alguien que se esperaba, para el estado vacío del buscador. */
  ayudaVacia?: string
  deshabilitado?: boolean
  id?: string
}

/**
 * Elige a UNA persona de una lista larga, escribiendo.
 *
 * Es el hermano de una sola opción de `SelectorPersonas` y el selector de persona del sistema: con 180
 * personas un `Select` hay que leerlo entero para encontrar a alguien. El campo es `BuscadorMenu`, que
 * ya resuelve el foco y las teclas dentro del menú de Radix, y `filtrarPorPalabras` busca sin acentos
 * y en cualquier orden, en el nombre y en el detalle.
 */
export function SelectorDePersona ({
  opciones, valor, onCambiar, marcador, etiqueta, permitirNinguno = true, ayudaVacia, deshabilitado = false, id
}: PropsSelectorDePersona) {
  const [busqueda, setBusqueda] = useState('')

  const texto = busqueda.trim()
  const visibles = filtrarPorPalabras(opciones, busqueda, (opcion) => [opcion.nombre, opcion.detalle])
    .slice(0, MAXIMO_VISIBLES)
  const elegido = valor === null ? undefined : opciones.find((opcion) => opcion.staffid === valor)

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        aria-label={etiqueta}
        disabled={deshabilitado}
        className={cn(CLASES_DISPARADOR, elegido === undefined && 'text-texto-sutil')}
      >
        <span className="truncate">{elegido?.nombre ?? marcador}</span>
        <ChevronSelector />
      </DisparadorMenu>

      <ContenidoMenu align="start" className="max-h-80 w-[var(--radix-dropdown-menu-trigger-width)] min-w-64 overflow-y-auto">
        <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder="Buscar por nombre…" />

        <div>
          {permitirNinguno && texto === '' && (
            <ItemMenu onSelect={() => { onCambiar(null) }}>
              <span className="text-texto-tenue">{marcador}</span>
            </ItemMenu>
          )}

          {visibles.length === 0
            ? <SinResultadosMenu>{ayudaVacia ?? 'Nadie con ese nombre.'}</SinResultadosMenu>
            : visibles.map((opcion) => (
              <ItemMenu key={opcion.staffid} onSelect={() => { onCambiar(opcion.staffid) }}>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{opcion.nombre}</span>
                  {opcion.detalle !== undefined && (
                    <span className="text-texto-sutil truncate text-xs">{opcion.detalle}</span>
                  )}
                </span>
              </ItemMenu>
              ))}
        </div>
      </ContenidoMenu>
    </MenuContextual>
  )
}
