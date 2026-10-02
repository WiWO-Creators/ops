'use client'

import type { ReactElement } from 'react'
import { Download } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import type { FormatoDeExportacion } from './useExportacionDelActa'

interface PropsAcciones {
  editando: boolean
  guardando: boolean
  exportando: FormatoDeExportacion | null
  puedeEditar: boolean
  puedeRenombrar: boolean
  puedeBorrar: boolean
  onDescartar: () => void
  onGuardar: () => void
  onExportar: (formato: FormatoDeExportacion) => void
  onImprimir: () => void
  onCorregir: () => void
  onRenombrar: () => void
  onEliminar: () => void
}

/**
 * Las acciones del Meeting Paper: una probable con peso de primaria, una de apoyo y lo destructivo
 * guardado. Las seis en fila y con el mismo peso obligaban a leerlas todas para encontrar la que
 * se quería.
 */
export function AccionesDelActa ({
  editando,
  guardando,
  exportando,
  puedeEditar,
  puedeRenombrar,
  puedeBorrar,
  onDescartar,
  onGuardar,
  onExportar,
  onImprimir,
  onCorregir,
  onRenombrar,
  onEliminar
}: PropsAcciones): ReactElement {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {editando
        ? (
          <>
            <Boton variante="sutil" tamano="chico" onClick={onDescartar}>
              Descartar cambios
            </Boton>
            <Boton variante="primario" tamano="chico" cargando={guardando} onClick={onGuardar}>
              Guardar
            </Boton>
          </>
          )
        : (
          <>
            {/* Los tres caminos de salida en un solo control: bajar el archivo es lo que se pide
                casi siempre, e imprimir queda para quien quiere el diálogo del navegador. */}
            <MenuContextual>
              <DisparadorMenu asChild>
                <Boton variante="secundario" tamano="chico" cargando={exportando !== null}>
                  <Download size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                  Exportar
                </Boton>
              </DisparadorMenu>
              <ContenidoMenu align="end">
                <ItemMenu onSelect={() => { onExportar('pdf') }}>Descargar PDF</ItemMenu>
                <ItemMenu onSelect={() => { onExportar('docx') }}>Descargar Word (.docx)</ItemMenu>
                <ItemMenu onSelect={onImprimir}>Imprimir</ItemMenu>
              </ContenidoMenu>
            </MenuContextual>
            {puedeEditar && (
              <Boton variante="primario" tamano="chico" onClick={onCorregir}>
                Corregir
              </Boton>
            )}
          </>
          )}

      {/* El `⋯` se dibuja solo si tiene algo dentro: un menú que se abre vacío promete acciones
          que este sujeto no tiene. */}
      {(puedeRenombrar || puedeBorrar) && (
        <MenuContextual>
          <DisparadorMenu asChild>
            <Boton variante="sutil" tamano="chico" soloIcono aria-label="Más acciones del Meeting Paper">
              <span aria-hidden="true">⋯</span>
            </Boton>
          </DisparadorMenu>
          <ContenidoMenu align="end">
            {puedeRenombrar && (
              <ItemMenu onSelect={onRenombrar}>Renombrar</ItemMenu>
            )}
            {puedeBorrar && (
              <ItemMenu peligroso onSelect={onEliminar}>Eliminar</ItemMenu>
            )}
          </ContenidoMenu>
        </MenuContextual>
      )}
    </div>
  )
}
