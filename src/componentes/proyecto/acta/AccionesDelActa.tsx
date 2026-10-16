'use client'

import type { ReactElement } from 'react'
import { Download, History, MessageCircleQuestion, MessageSquare } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import type { FormatoDeExportacion } from './useExportacionDelActa'

interface PropsAcciones {
  editando: boolean
  /** Edición conjunta abierta: no hay Guardar ni Descartar (guarda el servicio) ni otras acciones del acta. */
  conjunta: boolean
  guardando: boolean
  exportando: FormatoDeExportacion | null
  puedeEditar: boolean
  puedeRenombrar: boolean
  puedeBorrar: boolean
  /** Ofrece «Historial»: cualquiera que pueda corregir el acta. */
  puedeVerHistorial: boolean
  onHistorial: () => void
  /**
   * Ofrece «Comentarios» (fase 10): `abiertos` es la cantidad de hilos sin resolver, o `null` mientras
   * cargan. Se ve también con el editor abierto, donde el panel convive con la edición. Sin esto
   * (comentarios apagados o sin permiso) no hay botón.
   */
  comentarios?: { abiertos: number | null, onAbrir: () => void }
  /** Ofrece "Preguntar": abre el chat con este acta como contexto. Solo el equipo con IA activa. */
  puedePreguntar: boolean
  onPreguntar: () => void
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
  conjunta,
  guardando,
  exportando,
  puedeEditar,
  puedeRenombrar,
  puedeBorrar,
  puedeVerHistorial,
  onHistorial,
  comentarios,
  puedePreguntar,
  onPreguntar,
  onDescartar,
  onGuardar,
  onExportar,
  onImprimir,
  onCorregir,
  onRenombrar,
  onEliminar
}: PropsAcciones): ReactElement {
  const botonComentarios = comentarios !== undefined && (
    <Boton variante="secundario" tamano="chico" onClick={comentarios.onAbrir}>
      <MessageSquare size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      Comentarios
      {comentarios.abiertos !== null && comentarios.abiertos > 0 && (
        <Insignia tono="acento" tamano="chico">
          {comentarios.abiertos}
          <span className="sr-only"> sin resolver</span>
        </Insignia>
      )}
    </Boton>
  )

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {/* Con el editor abierto (de siempre o conjunto) el botón va primero: ahí no hay más acciones
          del acta que lo desplacen. En lectura va junto a Historial, que es de la misma familia. */}
      {(editando || conjunta) && botonComentarios}

      {!conjunta && (editando
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
            {puedeVerHistorial && (
              <Boton variante="secundario" tamano="chico" onClick={onHistorial}>
                <History size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Historial
              </Boton>
            )}
            {botonComentarios}
            {puedePreguntar && (
              <Boton variante="secundario" tamano="chico" onClick={onPreguntar}>
                <MessageCircleQuestion size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Preguntar
              </Boton>
            )}
            {puedeEditar && (
              <Boton variante="primario" tamano="chico" onClick={onCorregir}>
                Corregir
              </Boton>
            )}
          </>
          ))}

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
