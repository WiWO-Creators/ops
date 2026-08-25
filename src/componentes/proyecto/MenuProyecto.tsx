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
import { mensajeDeRespuesta } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { FormularioRecurso } from './FormularioRecurso'
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

export function MenuProyecto ({ proyecto, estados, capacidades }: PropsMenuProyecto): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [copiando, setCopiando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const puedeCrear = capacidades.includes('create')
  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')

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
      setFallo('No se pudo cambiar el estado: revisá la conexión.')
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
      setFallo('No se pudo eliminar: revisá la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="secundario" tamano="chico" disabled={enCurso}>Más</Boton>
        </DisparadorMenu>

        <ContenidoMenu align="end">
          {puedeEditar && (
            <ItemMenu onSelect={() => { setEditando(true) }}>
              Editar {GLOSARIO.espacio.singular.toLowerCase()}
            </ItemMenu>
          )}
          {puedeCrear && (
            <ItemMenu onSelect={() => { setCopiando(true) }}>
              Copiar {GLOSARIO.espacio.singular.toLowerCase()}
            </ItemMenu>
          )}

          {(puedeCrear || puedeEditar) && estados.length > 0 && <SeparadorMenu />}

          {(puedeCrear || puedeEditar) && estados
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
