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
  /** `peligro` si la acción pierde algo (por defecto); `primario` si se puede deshacer, como restaurar. */
  variante?: 'peligro' | 'primario'
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
  variante = 'peligro',
  onConfirmar
}: PropsConfirmacion): ReactElement {
  return (
    <Dialogo open={abierto} onOpenChange={onCambiar}>
      <ContenidoDialogo titulo={titulo} descripcion={descripcion} ancho="chico">
        <div className="flex justify-end gap-2">
          <Boton variante="sutil" onClick={() => { onCambiar(false) }}>{etiquetaCancelar}</Boton>
          <Boton variante={variante} cargando={cargando} onClick={onConfirmar}>
            {etiquetaConfirmar}
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
