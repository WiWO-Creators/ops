'use client'

import { useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { leerError } from '@/datos/errores'
import { GLOSARIO } from '@/dominio/glosario'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Alta de una tarea dentro de un proyecto.
 *
 * Pide lo minimo que hace falta para que la tarea exista y sea encontrable; el resto —asignados,
 * seguidores, checklist, adjuntos, recurrencia— se completa en el detalle, que es donde el panel
 * viejo tambien termina llevando a todo el mundo. Asignar a varias personas de una vez ya lo resuelve
 * la accion masiva.
 *
 * El proyecto no es un campo: viaja como `rel_type`/`rel_id` y no se elige, porque el formulario se
 * abre desde la pestaña de ese proyecto.
 */

interface PropsFormulario {
  proyectoId: number
  prioridades: OpcionFiltro[]
  /** Se llama con la tarea ya creada, para que la tabla vuelva a pedir los datos. */
  onCreada: () => void
}

export function FormularioTarea ({ proyectoId, prioridades, onCreada }: PropsFormulario): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [prioridad, setPrioridad] = useState('2')
  const [inicio, setInicio] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [facturable, setFacturable] = useState(true)
  const [etiquetas, setEtiquetas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Vacia el formulario para que la proxima alta no arranque con los datos de la anterior. */
  function limpiar (): void {
    setNombre('')
    setPrioridad('2')
    setInicio('')
    setVencimiento('')
    setFacturable(true)
    setEtiquetas('')
    setDescripcion('')
    setError(null)
  }

  /** Crea la tarea. El nombre es lo unico obligatorio; el resto viaja solo si se completo. */
  async function enviar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setError('La tarea necesita un nombre.')
      return
    }

    setEnCurso(true)
    setError(null)

    const cuerpo = {
      name: nombre.trim(),
      rel_type: 'project',
      rel_id: proyectoId,
      priority: Number(prioridad),
      billable: facturable,
      ...(inicio === '' ? {} : { start_date: inicio }),
      ...(vencimiento === '' ? {} : { due_date: vencimiento }),
      ...(descripcion.trim() === '' ? {} : { description: descripcion.trim() }),
      ...(etiquetas.trim() === ''
        ? {}
        : { tags: etiquetas.split(',').map((t) => t.trim()).filter((t) => t !== '') })
    }

    try {
      const respuesta = await fetch('/api/bff/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(cuerpo)
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      limpiar()
      setAbierto(false)
      onCreada()
    } catch {
      setError('No se pudo crear: revisá la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="primario" tamano="chico">
          Nueva {GLOSARIO.proceso.singular.toLowerCase()}
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Nueva ${GLOSARIO.proceso.singular.toLowerCase()}`}
        descripcion="Sólo lo indispensable; el resto se completa en el detalle."
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void enviar(evento) }}>
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                value={nombre}
                onChange={(evento) => setNombre(evento.target.value)}
                placeholder="Revisar el contrato"
                {...props}
              />
            )}
          </Campo>

          <Campo etiqueta="Prioridad">
            {(props) => (
              <Selector value={prioridad} onValueChange={setPrioridad}>
                <DisparadorSelector marcador="Elegí una" id={props.id} />
                <ContenidoSelector>
                  {prioridades.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Fecha de inicio">
              {(props) => (
                <Entrada
                  type="date"
                  value={inicio}
                  onChange={(evento) => setInicio(evento.target.value)}
                  {...props}
                />
              )}
            </Campo>
            <Campo etiqueta="Fecha de vencimiento">
              {(props) => (
                <Entrada
                  type="date"
                  value={vencimiento}
                  onChange={(evento) => setVencimiento(evento.target.value)}
                  {...props}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Etiquetas" ayuda="Separadas por coma.">
            {(props) => (
              <Entrada
                value={etiquetas}
                onChange={(evento) => setEtiquetas(evento.target.value)}
                placeholder="urgente, cliente-clave"
                {...props}
              />
            )}
          </Campo>

          <Campo etiqueta="Descripción">
            {(props) => (
              <AreaTexto
                value={descripcion}
                onChange={(evento) => setDescripcion(evento.target.value)}
                {...props}
              />
            )}
          </Campo>

          <label className="text-texto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={facturable}
              onChange={(evento) => setFacturable(evento.target.checked)}
            />
            Facturable
          </label>

          {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={enCurso}>Crear</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
