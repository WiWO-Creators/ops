'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual,
  SeparadorMenu
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { FormularioRecurso } from './FormularioRecurso'
import { ImportarTareas } from './ImportarTareas'
import type { CampoFormulario } from './formulario'
import type { EstadoLookup, Espacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'

/**
 * Menu "Más" de la cabecera del Proyecto: editar, copiar, marcar como, exportar y eliminar.
 *
 * Cada opcion aparece solo con la capacidad que corresponde, igual que en el panel. Ocultar el boton
 * no alcanza —el backend vuelve a exigir el permiso—, pero ofrecer una accion que va a fallar es una
 * forma de mentir.
 *
 * Sobre Radix: foco, `Escape` y `aria` del menu y del dialogo no se reimplementan.
 */

interface PropsMenuProyecto {
  proyecto: Espacio
  /** Estados de proyecto, de `lookups.project_statuses`, para las opciones "Marcar como". */
  estados: EstadoLookup[]
  /** Capacidades sobre `projects`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
  /**
   * Capacidades sobre `tasks`. Rige el item de importar: el endpoint exige `tasks.create`, no
   * `projects.edit`, y ofrecer una accion que va a dar 403 es una forma de mentir.
   */
  capacidadesTareas: Capacidad[]
  /**
   * Si quien mira figura en el equipo del Espacio. Rige el item "Salir".
   *
   * Es opcional porque la misma cabecera la monta `/licitaciones/{id}`, donde la accion no aplica:
   * ahi la prop no viaja y el item no se pinta.
   */
  esMiembro?: boolean
}

/** Campos editables de un Espacio, exactamente los que acepta `PATCH /projects/{id}`. */
function camposDeEdicion (): CampoFormulario[] {
  return [
    { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 600 },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'area' },
    { clave: 'start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha' },
    { clave: 'deadline', etiqueta: 'Fecha límite', tipo: 'fecha' },
    { clave: 'estimated_hours', etiqueta: 'Horas estimadas', tipo: 'numero' }
  ]
}

/**
 * Campos del duplicado.
 *
 * `name`, `clientid` y `start_date` son obligatorios por contrato. Los tres interruptores replican
 * las casillas del panel; lo que no se marca, no se copia.
 */
function camposDeCopia (): CampoFormulario[] {
  return [
    { clave: 'name', etiqueta: 'Nombre de la copia', tipo: 'texto', requerido: true, maximo: 600 },
    { clave: 'clientid', etiqueta: `${GLOSARIO.cliente.singular} (id)`, tipo: 'numero', requerido: true },
    { clave: 'start_date', etiqueta: 'Fecha de inicio', tipo: 'fecha', requerido: true },
    { clave: 'deadline', etiqueta: 'Fecha límite', tipo: 'fecha' },
    { clave: 'tasks', etiqueta: `Copiar ${GLOSARIO.proceso.plural.toLowerCase()}`, tipo: 'booleano' },
    { clave: 'milestones', etiqueta: `Copiar ${GLOSARIO.hito.plural.toLowerCase()}`, tipo: 'booleano' },
    { clave: 'members', etiqueta: 'Copiar equipo', tipo: 'booleano' }
  ]
}

export function MenuProyecto ({
  proyecto,
  estados,
  capacidades,
  capacidadesTareas,
  esMiembro = false
}: PropsMenuProyecto): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [archivando, setArchivando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const puedeCrear = capacidades.includes('create')
  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')
  const puedeImportar = capacidadesTareas.includes('create')
  const archivado = proyecto.archived

  /**
   * Cambia el estado del proyecto.
   *
   * `status` de un Espacio si es editable por `PATCH` y arrastra `date_finished` del lado del
   * servidor: no se toca esa fecha desde aca.
   */
  async function marcarComo (status: number): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ status })
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      router.refresh()
    } catch {
      setFallo('No se pudo cambiar el estado: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  /**
   * Archiva o desarchiva el proyecto.
   *
   * Al archivar se vuelve al listado: el proyecto acaba de salir de el, y quedarse en una ficha de
   * solo lectura sin decir por que es peor que mostrar la lista de la que ya no forma parte. Al
   * desarchivar se refresca en el sitio, que es donde la persona queria seguir trabajando.
   */
  async function cambiarArchivado (archivar: boolean): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    try {
      const respuesta = await fetch(
        `/api/bff/projects/${proyecto.id}/actions/${archivar ? 'archive' : 'unarchive'}`,
        { method: 'POST', headers: { accept: 'application/json' } }
      )

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      setArchivando(false)

      if (archivar) {
        router.push('/espacios')
        return
      }

      router.refresh()
    } catch {
      setFallo(`No se pudo ${archivar ? 'archivar' : 'desarchivar'}: revisa la conexión.`)
    } finally {
      setEnCurso(false)
    }
  }

  /** Borra el proyecto y vuelve al listado. El detalle deja de existir: quedarse aca daria un 404. */
  async function eliminar (): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyecto.id}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' }
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      router.push('/espacios')
    } catch {
      setFallo('No se pudo eliminar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  /**
   * Saca a quien mira del equipo del Espacio.
   *
   * Se vuelve al listado en vez de refrescar: sin `projects.view` global, el Espacio deja de ser
   * visible en cuanto se sale, y quedarse aca daria un 404 al primer refresco.
   *
   * El error del backend se muestra literal a proposito. El 422 de "te quedan N tareas abiertas" es
   * la mitad del valor de la accion: reemplazarlo por un generico dejaria a la persona sin saber
   * que tiene que pasar para poder salir.
   */
  async function salir (): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    const resultado = await escribirEnBff(`projects/${proyecto.id}/actions/leave`, 'POST')

    setEnCurso(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setSaliendo(false)
    router.push('/espacios')
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-2">
      {/* Salir es un boton y no un item del menu "Mas" porque es la salida de quien ya no trabaja
          aca: enterrada tras un menu no la encuentra justamente quien la necesita. NO mira
          capacidades, y ese es todo el punto: `projects.edit` protege reescribir el equipo ajeno, y
          quien se queda pegado a un Espacio del que no participa es quien no lo tiene. La unica
          condicion es estar en el equipo. */}
      {esMiembro && (
        <Boton variante="sutil" tamano="chico" disabled={enCurso} onClick={() => { setSaliendo(true) }}>
          Salir del {GLOSARIO.espacio.singular.toLowerCase()}
        </Boton>
      )}

      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="secundario" tamano="chico" disabled={enCurso}>Más</Boton>
        </DisparadorMenu>

        <ContenidoMenu align="end">
          {/* Editar y "Marcar como" desaparecen mientras esta archivado: el backend responde 422 a
              cualquier `PATCH` sobre un archivado, y ofrecer una accion que va a fallar es mentir. */}
          {puedeEditar && !archivado && (
            <ItemMenu onSelect={() => { setEditando(true) }}>
              Editar {GLOSARIO.espacio.singular.toLowerCase()}
            </ItemMenu>
          )}
          {puedeCrear && (
            <ItemMenu onSelect={() => { setCopiando(true) }}>
              Copiar {GLOSARIO.espacio.singular.toLowerCase()}
            </ItemMenu>
          )}

          {/* Importar no se ofrece sobre un Espacio archivado: recibiria tareas que nadie va a ver
              hasta desarchivarlo, que es lo contrario de lo que se estaba ordenando. */}
          {puedeImportar && !archivado && (
            <ItemMenu onSelect={() => { setImportando(true) }}>
              Importar {GLOSARIO.proceso.plural.toLowerCase()} de otro {GLOSARIO.espacio.singular.toLowerCase()}
            </ItemMenu>
          )}

          {(puedeCrear || puedeEditar) && !archivado && estados.length > 0 && <SeparadorMenu />}

          {(puedeCrear || puedeEditar) && !archivado && estados
            .filter((estado) => estado.id !== proyecto.status)
            .map((estado) => (
              <ItemMenu key={estado.id} onSelect={() => { void marcarComo(estado.id) }}>
                Marcar como {estado.name.toLowerCase()}
              </ItemMenu>
            ))}

          {puedeCrear && (
            <>
              <SeparadorMenu />
              <ItemMenu
                onSelect={() => {
                  // Se abre en una pestaña nueva porque devuelve un PDF: navegar en la misma
                  // dejaria a la persona fuera del proyecto que estaba mirando.
                  window.open(`/api/bff/projects/${proyecto.id}/export`, '_blank', 'noopener')
                }}
              >
                Exportar datos
              </ItemMenu>
            </>
          )}

          {/* Archivar pide `edit`, no `delete`: saca el proyecto de la vista de todo el equipo pero
              no borra nada, y siempre se puede deshacer desde el mismo menu. */}
          {puedeEditar && (
            <>
              <SeparadorMenu />
              <ItemMenu onSelect={() => { setArchivando(true) }}>
                {archivado ? 'Desarchivar' : 'Archivar'} {GLOSARIO.espacio.singular.toLowerCase()}
              </ItemMenu>
            </>
          )}

          {puedeBorrar && (
            <>
              <SeparadorMenu />
              <ItemMenu peligroso onSelect={() => { setBorrando(true) }}>
                Eliminar {GLOSARIO.espacio.singular.toLowerCase()}
              </ItemMenu>
            </>
          )}

        </ContenidoMenu>
      </MenuContextual>
      </span>

      {/* La ficha no dice en ninguna otra parte que esta archivada: quien llega por un enlace
          directo se enteraria recien al intentar editar. */}
      {archivado && (
        <span className="rounded-full border border-borde px-2 py-0.5 text-xs text-texto-sutil">
          Archivado
        </span>
      )}

      {fallo !== null && <span role="alert" className="text-texto-peligro text-xs">{fallo}</span>}

      <FormularioRecurso
        abierto={editando}
        onAbiertoCambia={setEditando}
        titulo={`Editar ${GLOSARIO.espacio.singular.toLowerCase()}`}
        campos={camposDeEdicion()}
        ruta={`projects/${proyecto.id}`}
        metodo="PATCH"
        registro={proyecto as unknown as Record<string, unknown>}
        onGuardado={() => { router.refresh() }}
      />

      <FormularioRecurso
        abierto={copiando}
        onAbiertoCambia={setCopiando}
        titulo={`Copiar ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion="Se crea un proyecto nuevo con lo que elijas copiar."
        campos={camposDeCopia()}
        ruta={`projects/${proyecto.id}/actions/copy`}
        metodo="POST"
        registro={{
          name: `${proyecto.name} (copia)`,
          clientid: proyecto.client?.id ?? '',
          start_date: proyecto.start_date ?? '',
          deadline: proyecto.deadline ?? '',
          tasks: true,
          milestones: true,
          members: true
        }}
        onGuardado={() => { router.push('/espacios') }}
      />

      <ImportarTareas
        destino={{ id: proyecto.id, name: proyecto.name }}
        abierto={importando}
        onAbiertoCambia={setImportando}
        onImportado={() => { router.refresh() }}
        onArchivado={() => { router.refresh() }}
      />

      <Dialogo open={archivando} onOpenChange={setArchivando}>
        <ContenidoDialogo
          titulo={`${archivado ? 'Desarchivar' : 'Archivar'} ${GLOSARIO.espacio.singular.toLowerCase()}`}
          descripcion={archivado
            ? `"${proyecto.name}" vuelve al listado y se puede volver a editar.`
            : `"${proyecto.name}" sale del listado y queda de solo lectura. No se borra nada y se puede deshacer.`}
          ancho="chico"
        >
          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { setArchivando(false) }}>Cancelar</Boton>
            <Boton
              variante="primario"
              cargando={enCurso}
              onClick={() => { void cambiarArchivado(!archivado) }}
            >
              {archivado ? 'Desarchivar' : 'Archivar'}
            </Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>

      <Dialogo open={saliendo} onOpenChange={setSaliendo}>
        <ContenidoDialogo
          titulo={`Salir del ${GLOSARIO.espacio.singular.toLowerCase()}`}
          descripcion={`Dejás de ser parte del equipo de "${proyecto.name}". Si no tenés permiso `
            + `para ver todos los ${GLOSARIO.espacio.plural.toLowerCase()}, este va a dejar de `
            + 'aparecerte y vas a necesitar que alguien te vuelva a sumar.'}
          ancho="chico"
        >
          {/* El error se repite aca dentro y no solo bajo el boton "Mas": el dialogo tapa la
              cabecera, y el 422 de las tareas abiertas es justo lo que hay que leer. */}
          {fallo !== null && (
            <p role="alert" className="text-texto-peligro mb-3 text-sm">{fallo}</p>
          )}

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { setSaliendo(false) }}>Cancelar</Boton>
            <Boton variante="peligro" cargando={enCurso} onClick={() => { void salir() }}>Salir</Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>

      <Dialogo open={borrando} onOpenChange={setBorrando}>
        <ContenidoDialogo
          titulo={`Eliminar ${GLOSARIO.espacio.singular.toLowerCase()}`}
          descripcion={`"${proyecto.name}" se borra con todo lo que cuelga de él. No se puede deshacer.`}
          ancho="chico"
        >
          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { setBorrando(false) }}>Cancelar</Boton>
            <Boton variante="peligro" cargando={enCurso} onClick={() => { void eliminar() }}>Eliminar</Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </span>
  )
}

/**
 * Boton "Nueva tarea" de la cabecera.
 *
 * Lleva a la pestaña de tareas con `?nuevaTarea=1`. El alta en si vive en el panel de Tareas —es
 * quien conoce los campos, los asignados y el hito— y duplicar ese formulario aca seria mantener dos
 * altas del mismo recurso.
 *
 * @param capacidades capacidades sobre `tasks`: sin `create` el boton no se pinta, igual que en el panel
 */
export function BotonNuevaTarea ({ capacidades }: { capacidades: Capacidad[] }): ReactElement | null {
  const router = useRouter()

  if (!capacidades.includes('create')) return null

  return (
    <Boton
      variante="primario"
      tamano="chico"
      onClick={() => { router.push('?tab=tareas&nuevaTarea=1', { scroll: false }) }}
    >
      Nueva {GLOSARIO.proceso.singular.toLowerCase()}
    </Boton>
  )
}
