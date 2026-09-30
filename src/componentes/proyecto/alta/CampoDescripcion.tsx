import type { ReactElement, RefObject } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { AdjuntosDeAlta } from '../AdjuntosDeAlta'
import { AsistenteDescripcion } from '../AsistenteDescripcion'

interface PropsCampoDescripcion {
  /**
   * Caja del campo, solo para poder enfocarlo.
   *
   * Se apunta al contenedor y se busca el `textarea` adentro, como ya hace `ChatDeSala`: `AreaTexto`
   * no reenvia `ref`, y el `id` que cablea `Campo` lo genera `Campo` con su `useId()` y no sale de
   * su funcion hija.
   */
  caja: RefObject<HTMLDivElement | null>
  /** El nombre de la tarea, que usa el asistente como contexto. */
  titulo: string
  descripcion: string
  onDescripcion: (texto: string) => void
  error: string | null
  /** Archivos elegidos para subir a Drive cuando la tarea exista. */
  adjuntos: File[]
  onAdjuntos: (archivos: File[]) => void
  /** Motivos de los archivos que no se aceptaron; vacío cuando ya no hay ninguno. */
  onAdjuntosRechazados: (motivos: string[]) => void
  conIa: boolean
  proyectoId: number | null
  deshabilitado: boolean
}

/** La descripción obligatoria con sus adjuntos, y el asistente que la redacta cuando la IA está encendida. */
export function CampoDescripcion ({
  caja, titulo, descripcion, onDescripcion, error, adjuntos, onAdjuntos, onAdjuntosRechazados, conIa, proyectoId, deshabilitado
}: PropsCampoDescripcion): ReactElement {
  return (
    <div ref={caja} className="flex flex-col gap-2">
      <Campo
        etiqueta="Descripción"
        requerido
        error={error ?? undefined}
        ayuda="Qué hay que hacer y con qué se da por terminada. Quien abra la tarea no estuvo en esta conversación."
      >
        {(campo) => (
          <AreaTexto
            {...campo}
            rows={4}
            value={descripcion}
            onChange={(evento) => { onDescripcion(evento.target.value) }}
          />
        )}
      </Campo>

      <AdjuntosDeAlta
        archivos={adjuntos}
        onCambiar={onAdjuntos}
        onRechazados={onAdjuntosRechazados}
        deshabilitado={deshabilitado}
      />

      {/* Con la capa de IA apagada el asistente no existe y el campo se escribe a mano.
          `conIa` evita hasta la sonda; el propio componente se oculta igual si la API
          dice que no. */}
      {conIa && (
        <div className="flex justify-end">
          <AsistenteDescripcion
            titulo={titulo}
            descripcionActual={descripcion}
            proyectoId={proyectoId}
            deshabilitado={deshabilitado}
            onRedactada={onDescripcion}
          />
        </div>
      )}
    </div>
  )
}
