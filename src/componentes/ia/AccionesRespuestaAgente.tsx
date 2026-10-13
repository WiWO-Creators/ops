import { Copy, Pencil, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'

interface PropsAccionesRespuestaAgente {
  /** Hay algo que copiar. */
  conTexto: boolean
  /** El compositor está libre y no hay otra ejecución abierta: se puede iniciar una pregunta nueva. */
  puedeNueva: boolean
  onCopiar: () => void
  onReintentar: () => void
  onEditar: () => void
}

/**
 * Lo que se hace con una respuesta ya terminada del agente: copiarla, repetir la pregunta como
 * ejecución nueva o llevar la pregunta al compositor para ajustarla.
 *
 * Reintentar y Editar se apagan (con la razón en el `title`) mientras haya otra ejecución pendiente:
 * abrir una segunda es justo lo que el compositor bloquea.
 */
export function AccionesRespuestaAgente ({ conTexto, puedeNueva, onCopiar, onReintentar, onEditar }: PropsAccionesRespuestaAgente): ReactElement {
  const motivo = puedeNueva ? undefined : 'Termina o descarta la ejecución pendiente para hacer otra pregunta.'
  return (
    <div className="-ml-2 flex flex-wrap items-center gap-1" role="group" aria-label="Acciones de la respuesta">
      <Boton tamano="chico" variante="sutil" disabled={!conTexto} onClick={onCopiar}><Copy aria-hidden="true" className="size-3.5" />Copiar</Boton>
      <Boton tamano="chico" variante="sutil" disabled={!puedeNueva} title={motivo} aria-label="Reintentar esta pregunta como una nueva" onClick={onReintentar}><RotateCcw aria-hidden="true" className="size-3.5" />Reintentar</Boton>
      <Boton tamano="chico" variante="sutil" disabled={!puedeNueva} title={motivo} onClick={onEditar}><Pencil aria-hidden="true" className="size-3.5" />Editar pregunta</Boton>
    </div>
  )
}
