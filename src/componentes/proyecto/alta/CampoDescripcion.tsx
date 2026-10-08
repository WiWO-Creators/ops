import { useState, type ReactElement, type RefObject } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { EditorRico } from '@/componentes/formularios/EditorRico'
import { AdjuntosDeAlta } from '../AdjuntosDeAlta'
import { AsistenteDescripcion } from '../AsistenteDescripcion'

interface PropsCampoDescripcion {
  /**
   * Caja del campo, solo para poder enfocarlo.
   *
   * Se apunta al contenedor y se busca el cuadro de texto (`[role="textbox"]`) adentro, como ya hace
   * `ChatDeSala`: el editor no reenvia `ref`, y el `id` que cablea `Campo` lo genera `Campo` con su
   * `useId()` y no sale de su funcion hija.
   */
  caja: RefObject<HTMLDivElement | null>
  /** El nombre de la tarea, que usa el asistente como contexto. */
  titulo: string
  /** HTML del editor de texto enriquecido; `''` si no hay nada visible. */
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

/**
 * La descripción obligatoria con sus adjuntos, y el asistente que la redacta cuando la IA está encendida.
 *
 * El editor no es controlado: toma `descripcion` solo al montarse. Cuando el valor cambia por algo
 * que no escribió la persona en el editor (interpretación de IA, asistente, deshacer, reinicio del
 * alta) se remonta con otra `key`, así siempre muestra lo que hay en el borrador.
 */
export function CampoDescripcion ({
  caja, titulo, descripcion, onDescripcion, error, adjuntos, onAdjuntos, onAdjuntosRechazados, conIa, proyectoId, deshabilitado
}: PropsCampoDescripcion): ReactElement {
  // Ultimo valor que salio del editor; si el borrador trae otro, lo escribio alguien de afuera.
  const [emitido, setEmitido] = useState(descripcion)
  const [version, setVersion] = useState(0)

  if (descripcion !== emitido) {
    setEmitido(descripcion)
    setVersion((actual) => actual + 1)
  }

  return (
    <div ref={caja} className="flex flex-col gap-2">
      <Campo
        etiqueta="Descripción"
        requerido
        error={error ?? undefined}
        ayuda="Qué hay que hacer y con qué se da por terminada. Quien abra la tarea no estuvo en esta conversación."
      >
        {(campo) => (
          <EditorRico
            {...campo}
            key={version}
            etiqueta="Descripción"
            filasMinimas={4}
            valorInicial={descripcion}
            deshabilitado={deshabilitado}
            onCambio={(html) => {
              setEmitido(html)
              onDescripcion(html)
            }}
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
