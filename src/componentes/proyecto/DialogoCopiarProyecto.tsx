'use client'

import { useState } from 'react'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { hoyLocal } from '@/lib/fechas'

/**
 * Copia de un Proyecto, con las mismas opciones que el panel viejo.
 *
 * Copiar no es una accion de un clic: decide si arrastra tareas, hitos y miembros, y con que estado
 * quedan las tareas copiadas. Por eso es un dialogo con opciones y no un item de menu — el panel viejo
 * tampoco pedia confirmacion, pedia decisiones.
 */

/** Opciones de arrastre, cada una con el nombre exacto que espera el backend. */
const OPCIONES_DE_COPIA = [
  { clave: 'tasks', etiqueta: `${GLOSARIO.proceso.plural} del ${GLOSARIO.espacio.singular.toLowerCase()}` },
  { clave: 'tasks_include_checklist_items', etiqueta: 'Listas de control de las tareas' },
  { clave: 'task_include_assignees', etiqueta: 'Asignados de las tareas' },
  { clave: 'task_include_followers', etiqueta: 'Seguidores de las tareas' },
  { clave: 'milestones', etiqueta: `${GLOSARIO.hito.plural}` },
  { clave: 'members', etiqueta: 'Miembros del equipo' }
] as const

type ClaveDeCopia = typeof OPCIONES_DE_COPIA[number]['clave']

/** Lo que el panel viejo trae marcado al abrir el modal. */
const MARCADAS_POR_DEFECTO: Record<ClaveDeCopia, boolean> = {
  tasks: true,
  tasks_include_checklist_items: false,
  task_include_assignees: false,
  task_include_followers: false,
  milestones: true,
  members: true
}

/**
 * Estado con el que nacen las tareas copiadas.
 *
 * `copy_project_task_status` es un id de estado de tarea, no un modo: el panel viejo marca el 1 —"No
 * iniciada"— y con ese valor arranca acá tambien.
 */
const ESTADO_INICIAL_DE_TAREAS = '1'

interface PropsDialogoCopiar {
  /** Proyecto a copiar, o `null` cuando el dialogo esta cerrado. */
  espacio: Espacio | null
  /** Clientes disponibles, con la misma forma que las opciones de filtro. */
  clientes: OpcionFiltro[]
  /** Estados de tarea de `/lookups`: con cual nacen las tareas copiadas. */
  estadosDeTarea: OpcionFiltro[]
  onCerrar: () => void
  /** Se llama cuando la copia se creo: quien llama decide como refrescar la vista. */
  onCopiado: () => void
}

/**
 * Dialogo de copia.
 *
 * @param espacio fila a copiar; `null` cierra el dialogo
 * @param clientes opciones del selector de cliente
 * @param estadosDeTarea opciones de `copy_project_task_status`
 */
export function DialogoCopiarProyecto ({ espacio, clientes, estadosDeTarea, onCerrar, onCopiado }: PropsDialogoCopiar) {
  if (espacio === null) return null

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={`Copiar ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion={espacio.name}
      >
        {/* `key` fuerza un formulario limpio por cada proyecto: sin esto, abrir el segundo conserva lo
            que se tipeo en el primero. */}
        <FormularioCopia
          key={espacio.id}
          espacio={espacio}
          clientes={clientes}
          estadosDeTarea={estadosDeTarea}
          onCopiado={onCopiado}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** Cuerpo del dialogo. Separado para que el `key` lo remonte y el estado arranque de cero. */
function FormularioCopia ({
  espacio,
  clientes,
  estadosDeTarea,
  onCopiado
}: {
  espacio: Espacio
  clientes: OpcionFiltro[]
  estadosDeTarea: OpcionFiltro[]
  onCopiado: () => void
}) {
  const [nombre, setNombre] = useState(`${espacio.name} (copia)`)
  const [cliente, setCliente] = useState(espacio.client === null ? '' : String(espacio.client.id))
  const [inicio, setInicio] = useState(hoyLocal())
  const [entrega, setEntrega] = useState(espacio.deadline ?? '')
  const [estadoTareas, setEstadoTareas] = useState(ESTADO_INICIAL_DE_TAREAS)
  const [marcadas, setMarcadas] = useState<Record<ClaveDeCopia, boolean>>(MARCADAS_POR_DEFECTO)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Manda la copia al backend.
   *
   * `name`, `clientid` y `start_date` son obligatorios en el contrato: se validan acá para no gastar
   * un viaje y para que el mensaje diga cual falta, no un 422 generico.
   */
  async function copiar (evento: React.FormEvent) {
    evento.preventDefault()

    if (nombre.trim() === '' || cliente === '' || inicio === '') {
      setError('Hacen falta el nombre, el cliente y la fecha de inicio.')
      return
    }

    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff(`projects/${espacio.id}/actions/copy`, 'POST', {
      name: nombre.trim(),
      clientid: Number(cliente),
      start_date: inicio,
      deadline: entrega === '' ? null : entrega,
      ...marcadas,
      copy_project_task_status: Number(estadoTareas)
    })

    setEnviando(false)

    if (resultado.ok) {
      onCopiado()
      return
    }

    setError(resultado.mensaje)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void copiar(evento) }}>
      <Campo etiqueta="Nombre" requerido>
        {(props) => (
          <Entrada {...props} value={nombre} onChange={(e) => { setNombre(e.target.value) }} />
        )}
      </Campo>

      <Campo etiqueta={GLOSARIO.cliente.singular} requerido>
        {(props) => (
          <Selector value={cliente} onValueChange={setCliente}>
            <DisparadorSelector id={props.id} marcador="Elige un cliente" />
            <ContenidoSelector>
              {clientes.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha de inicio" requerido>
          {(props) => (
            <Entrada {...props} type="date" value={inicio} onChange={(e) => { setInicio(e.target.value) }} />
          )}
        </Campo>
        <Campo etiqueta="Fecha de entrega">
          {(props) => (
            <Entrada {...props} type="date" value={entrega} min={inicio} onChange={(e) => { setEntrega(e.target.value) }} />
          )}
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-texto mb-1 text-sm font-medium">Qué se copia</legend>
        {OPCIONES_DE_COPIA.map((opcion) => (
          <label key={opcion.clave} className="text-texto-tenue flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-acento size-4"
              checked={marcadas[opcion.clave]}
              onChange={(e) => { setMarcadas({ ...marcadas, [opcion.clave]: e.target.checked }) }}
            />
            {opcion.etiqueta}
          </label>
        ))}
      </fieldset>

      <Campo etiqueta="Estado de las tareas copiadas">
        {(props) => (
          <Selector value={estadoTareas} onValueChange={setEstadoTareas}>
            <DisparadorSelector id={props.id} />
            <ContenidoSelector>
              {estadosDeTarea.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      {error !== null && (
        <p role="alert" className="text-texto-peligro text-sm">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil">Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" variante="primario" cargando={enviando}>Copiar</Boton>
      </div>
    </form>
  )
}
