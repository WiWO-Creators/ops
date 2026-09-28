'use client'

import type { ReactElement } from 'react'
import { Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual } from '@/componentes/superposiciones/MenuContextual'
import { ConfirmarBorrado, useConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'

/** Una accion cualquiera del menu, para lo que no es ni "Editar" ni "Eliminar". */
export interface AccionDeFila {
  clave: string
  etiqueta: string
  /** Icono de la fila. Sin icono si se omite. */
  icono?: LucideIcon
  /** Accion destructiva: se pinta en el tono de peligro. */
  peligroso?: boolean
  deshabilitado?: boolean
  onSeleccionar: () => void
}

/** Lo que hace falta para que el menu agregue el item "Eliminar" y su confirmacion. */
export interface AccionDeBorrado {
  advertencia: string
  /** Ver `confirmacionEscrita` de `ConfirmarBorrado`. */
  confirmacionEscrita?: string
  onConfirmar: () => Promise<void> | void
  titulo?: string
}

export interface PropsMenuAccionesFila {
  /** Acciones propias de la fila, en el orden en que se dibujan. */
  acciones?: AccionDeFila[]
  /** Si viene, agrega el item "Editar" con el icono `Pencil`, al principio del menu. */
  onEditar?: () => void
  /** Si viene, agrega el item "Eliminar" al final, que abre un `ConfirmarBorrado` con este contrato. */
  borrado?: AccionDeBorrado
  /** Deshabilita el disparador entero, por ejemplo mientras otra accion de la fila esta en curso. */
  deshabilitado?: boolean
  /** Muestra el disparador con el indicador de carga de `Boton` (tambien lo deshabilita). */
  cargando?: boolean
  /** Etiqueta accesible del disparador. Por defecto, "Acciones". */
  ariaLabel?: string
}

/**
 * Menu de acciones de una fila: el disparador "⋯" unico, con Editar y Eliminar en su lugar canonico.
 *
 * Reemplaza los distintos menus de fila que habia por pantalla —el "⋯" de `TablaRecurso`, el
 * `MoreHorizontal` de `Tablero`, el "Más" de `MenuProyecto`— por una sola primitiva: mismo disparador,
 * mismos iconos para Editar (`Pencil`) y Eliminar (que siempre abre `ConfirmarBorrado`, nunca borra al
 * primer clic).
 *
 * `acciones` cubre lo que no es Editar ni Eliminar —duplicar, archivar, lo que cada pantalla tenga—;
 * `onEditar` y `borrado` son la forma corta para los dos casos que **siempre** se ven igual.
 */
export function MenuAccionesFila ({
  acciones = [],
  onEditar,
  borrado,
  deshabilitado = false,
  cargando = false,
  ariaLabel = 'Acciones'
}: PropsMenuAccionesFila): ReactElement {
  const confirmarBorrado = useConfirmarBorrado()

  return (
    <>
      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="sutil" tamano="chico" soloIcono cargando={cargando} disabled={deshabilitado} aria-label={ariaLabel}>
            <span aria-hidden="true">⋯</span>
          </Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end">
          {onEditar !== undefined && (
            <ItemMenu onSelect={onEditar}>
              <Pencil size={14} aria-hidden="true" />
              Editar
            </ItemMenu>
          )}

          {acciones.map((accion) => (
            <ItemMenu
              key={accion.clave}
              peligroso={accion.peligroso}
              disabled={accion.deshabilitado}
              onSelect={accion.onSeleccionar}
            >
              {accion.icono !== undefined && <accion.icono size={14} aria-hidden="true" />}
              {accion.etiqueta}
            </ItemMenu>
          ))}

          {borrado !== undefined && (
            <ItemMenu
              peligroso
              // Radix cierra el menu y le devuelve el foco al disparador al seleccionar un item; sin
              // `preventDefault` esa devolucion de foco gana la carrera contra la apertura del
              // dialogo y el `ConfirmarBorrado` nace y se cierra en el mismo instante.
              onSelect={(evento) => { evento.preventDefault(); confirmarBorrado.abrir() }}
            >
              <Trash2 size={14} aria-hidden="true" />
              {borrado.titulo ?? 'Eliminar'}
            </ItemMenu>
          )}
        </ContenidoMenu>
      </MenuContextual>

      {borrado !== undefined && (
        <ConfirmarBorrado
          abierto={confirmarBorrado.abierto}
          onCerrar={confirmarBorrado.cerrar}
          titulo={borrado.titulo ?? 'Eliminar'}
          advertencia={borrado.advertencia}
          confirmacionEscrita={borrado.confirmacionEscrita}
          onConfirmar={borrado.onConfirmar}
        />
      )}
    </>
  )
}
