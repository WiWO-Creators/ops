'use client'

import { useState, type ReactElement } from 'react'
import { comprobarEntidad, mutarEnBff } from '@/componentes/datos/mutar'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import type { Proceso } from '@/datos/recursos'
import { EntregaFinal, resolverArchivoDeEntrega } from './EntregaFinal'
import {
  avisoDeEntrega,
  errorDeEleccion,
  etiquetaDeCompletar,
  SIN_ENTREGA,
  type EleccionDeEntrega,
  type InfoDeEntrega
} from './entrega-final'
import { accionDeEstado } from './estado-proceso'
import { ESTADO_COMPLETO } from './tareas'

interface PropsDialogoCompletarConEntrega {
  abierto: boolean
  tareaId: number
  nombreTarea: string
  /** Cierra el diálogo sin completar. */
  onCerrar: () => void
  /** Se llama con la tarea ya completada, para que quien lo montó refresque su vista. */
  onCompletada: () => void
}

/**
 * Completar una Tarea eligiendo el archivo final que se le manda al cliente.
 *
 * Es el camino de los menús de estado (el kanban, las tablas): ahí completar es un gesto, y este
 * diálogo solo se abre cuando el correo de entrega tiene sentido (se manda de verdad, el cliente ve la
 * Tarea y alguien la sigue). Si no, completar sigue siendo un clic. La ficha de la Tarea, que ya es un
 * diálogo, usa el mismo bloque en línea (`EntregaFinal`) y no abre otro encima.
 *
 * **Si el archivo se sube pero la Tarea no se completa**, el archivo ya existe en la Tarea: el
 * reintento lo usa en vez de subirlo otra vez, para no dejar adjuntos repetidos.
 */
export function DialogoCompletarConEntrega (
  { abierto, tareaId, nombreTarea, onCerrar, onCompletada }: PropsDialogoCompletarConEntrega
): ReactElement {
  const avisar = useAviso()
  const [eleccion, setEleccion] = useState<EleccionDeEntrega>(SIN_ENTREGA)
  const [info, setInfo] = useState<InfoDeEntrega | undefined>(undefined)
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const invalida = errorDeEleccion(eleccion, info?.max_bytes) !== null

  /** Sube el archivo si hace falta y completa la tarea. Nunca lanza: el error se lee en el diálogo. */
  async function completar (): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    const archivo = await resolverArchivoDeEntrega(tareaId, eleccion)

    if (!archivo.ok) {
      setEnCurso(false)
      setFallo(archivo.mensaje)

      return
    }

    // Ya esta subido: si completar falla, el reintento usa este adjunto en vez de subir otro.
    if (eleccion.modo === 'nuevo' && archivo.datos !== null) {
      setEleccion({ modo: 'existente', archivoId: archivo.datos })
    }

    const accion = accionDeEstado(tareaId, ESTADO_COMPLETO, archivo.datos)

    if (accion === null) {
      setEnCurso(false)
      setFallo('No se pudo completar: la tarea no es válida.')

      return
    }

    const resultado = await mutarEnBff<Proceso>(accion.ruta, 'POST', accion.cuerpo, {
      servidorIdempotente: true,
      yaAplicada: comprobarEntidad<Proceso>(`tasks/${tareaId}`, (tarea) => tarea.status === ESTADO_COMPLETO)
    })

    setEnCurso(false)

    if (!resultado.ok) {
      if (resultado.incierta === true) {
        // No se sabe si quedo: se refresca para mostrar lo que hay de verdad.
        avisar.advertencia(resultado.mensaje)
        onCompletada()
        onCerrar()

        return
      }

      setFallo(resultado.mensaje)

      return
    }

    avisar.exito(`«${nombreTarea}» quedó completada.`)

    const envio = avisoDeEntrega(info, archivo.datos !== null)
    if (envio !== null) avisar.exito(envio)

    onCompletada()
    onCerrar()
  }

  return (
    <Dialogo open={abierto} onOpenChange={(siguiente) => { if (!siguiente && !enCurso) onCerrar() }}>
      <ContenidoDialogo
        titulo="Completar tarea"
        descripcion={`«${nombreTarea}». Si eliges un archivo final, el cliente lo recibe adjunto por correo.`}
        cerrable
      >
        <div className="flex flex-col gap-4">
          <EntregaFinal
            tareaId={tareaId}
            eleccion={eleccion}
            onEleccion={setEleccion}
            onInfo={setInfo}
            deshabilitado={enCurso}
          />

          {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} />}

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" disabled={enCurso} onClick={onCerrar}>Cancelar</Boton>
            <Boton
              variante="primario"
              cargando={enCurso}
              disabled={invalida}
              onClick={() => { void completar() }}
            >
              {etiquetaDeCompletar(eleccion)}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
