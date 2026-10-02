'use client'

import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'

interface PropsConfirmacion {
  abierto: boolean
  onCambiar: (abierto: boolean) => void
  titulo: string
  descripcion: string
  etiquetaCancelar: string
  etiquetaConfirmar: string
  cargando?: boolean
  onConfirmar: () => void
}

/** Pregunta antes de una accion del Meeting Paper que pierde algo: borrarlo, retraducirlo o salir sin guardar. */
export function ConfirmacionDelActa ({
  abierto,
  onCambiar,
  titulo,
  descripcion,
  etiquetaCancelar,
  etiquetaConfirmar,
  cargando,
  onConfirmar
}: PropsConfirmacion): ReactElement {
  return (
    <Dialogo open={abierto} onOpenChange={onCambiar}>
      <ContenidoDialogo titulo={titulo} descripcion={descripcion} ancho="chico">
        <div className="flex justify-end gap-2">
          <Boton variante="sutil" onClick={() => { onCambiar(false) }}>{etiquetaCancelar}</Boton>
          <Boton variante="peligro" cargando={cargando} onClick={onConfirmar}>
            {etiquetaConfirmar}
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
