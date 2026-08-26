'use client'

import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { leerError } from '@/datos/errores'
import type { DefinicionCampoPersonalizado, ProcesoAmpliado } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { Columna, DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import { PROCESOS } from '@/definiciones/procesos'
import { alternarSeleccion, camposDeTabla, valorDeCampo } from './tareas'

/**
 * Las columnas de la pestaña Tareas de un proyecto.
 *
 * No se escribe una tabla nueva: se arma una `DefinicionRecurso` a partir de la de Procesos y la
 * consume `TablaRecurso`. Lo unico propio es *como se pinta* cada celda.
 *
 * La seleccion y el editor de estado en linea viven en celdas y no en props del motor porque
 * `presentar` recibe solo la fila: un contexto es la unica via para que la casilla de una fila sepa
 * si esta marcada sin atar la definicion memoizada al estado del panel.
 */

interface ValorContextoSeleccion {
  seleccion: number[]
  alternar: (id: number) => void
}

const ContextoSeleccion = createContext<ValorContextoSeleccion>({ seleccion: [], alternar: () => {} })

interface PropsProveedorSeleccion {
  seleccion: number[]
  onSeleccion: (seleccion: number[]) => void
  children: ReactNode
}

/** Comparte la seleccion con las casillas de cada fila. */
export function ProveedorSeleccion ({ seleccion, onSeleccion, children }: PropsProveedorSeleccion): ReactElement {
  return (
    <ContextoSeleccion.Provider
      value={{ seleccion, alternar: (id) => onSeleccion(alternarSeleccion(seleccion, id)) }}
    >
      {children}
    </ContextoSeleccion.Provider>
  )
}

/** Casilla de seleccion de una fila. */
function CasillaFila ({ proceso }: { proceso: ProcesoAmpliado }): ReactElement {
  const { seleccion, alternar } = useContext(ContextoSeleccion)

  return (
    <input
      type="checkbox"
      checked={seleccion.includes(proceso.id)}
      onChange={() => alternar(proceso.id)}
      aria-label={`Seleccionar «${proceso.name}»`}
    />
  )
}

/**
 * El nombre de la tarea, como enlace al detalle.
 *
 * Lee `useSearchParams` por su cuenta en vez de recibir la URL por prop: `presentar` solo recibe la
 * fila, y un componente propio es la unica forma de que el enlace conserve los parametros vigentes
 * —filtros, orden, pagina— sin atar la definicion memoizada al estado.
 */
function EnlaceTarea ({ proceso }: { proceso: ProcesoAmpliado }): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('tarea', String(proceso.id))

  return (
    <Link
      href={`?${siguientes.toString()}`}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {proceso.name}
    </Link>
  )
}

interface PropsEstado {
  proceso: ProcesoAmpliado
  estados: OpcionFiltro[]
  editable: boolean
  onCambiado: () => void
}

/**
 * Estado de la tarea, editable en linea.
 *
 * Escribe por `POST /tasks/bulk` con un solo id y no por un `PATCH`: el contrato deja el estado
 * fuera del parche porque arrastra cascadas —fecha de fin, cronometros—, y `bulk` es el unico
 * endpoint que lo cambia con las reglas de permiso del panel. Un id es un caso particular de varios.
 *
 * Sin `edit tasks` se pinta la insignia y nada mas: el backend igual decide fila por fila, pero
 * ofrecer un selector que siempre responde 403 es peor que no ofrecerlo.
 */
function EstadoEditable ({ proceso, estados, editable, onCambiado }: PropsEstado): ReactElement {
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const actual = estados.find((estado) => estado.valor === String(proceso.status))
  const insignia = <Insignia color={actual?.color} tamano="chico">{actual?.etiqueta ?? `#${proceso.status}`}</Insignia>

  if (!editable) return insignia

  /** Cambia el estado y le pide al panel que recargue: el backend es quien sabe como quedo la fila. */
  async function cambiar (valor: string): Promise<void> {
    setEnCurso(true)
    setError(null)

    try {
      const respuesta = await fetch('/api/bff/tasks/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ids: [proceso.id], accion: 'status', valor: Number(valor) })
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      onCambiado()
    } catch {
      setError('No se pudo cambiar el estado: revisá la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  /*
   * Sin orbe, por lo mismo que el interruptor de visibilidad: el selector ya muestra el valor nuevo y
   * lo unico que falta comunicar es que no esta confirmado. Eso lo dicen `aria-busy` y el control
   * deshabilitado. Un indicador de carga por celda seria el orbe repetido por fila, que es la regla
   * de rendimiento que el proyecto no vuelve a romper.
   */
  return (
    <span className="flex flex-col gap-1" aria-busy={enCurso}>
      <select
        value={String(proceso.status)}
        disabled={enCurso}
        aria-label={`Estado de «${proceso.name}»`}
        onChange={(evento) => { void cambiar(evento.target.value) }}
        className="border-control-borde bg-control text-texto rounded-control h-8 border px-2 text-xs"
      >
        {estados.map((estado) => (
          <option key={estado.valor} value={estado.valor}>{estado.etiqueta}</option>
        ))}
      </select>
      {error !== null && <span role="alert" className="text-texto-peligro text-xs">{error}</span>}
    </span>
  )
}

/** Tipo de tarea. Trae sus dos colores de la base y por eso se pintan con `style`. */
function TipoDeTarea ({ proceso }: { proceso: ProcesoAmpliado }): ReactElement {
  const tipo = proceso.task_type

  if (tipo === null || tipo === undefined) return <span className="text-texto-sutil">—</span>

  return (
    <span
      className="rounded-control inline-flex items-center px-2 py-0.5 text-xs font-medium"
      // Los dos colores los administra quien configura los tipos en Perfex: son datos, no tokens.
      style={{
        backgroundColor: tipo.label_color ?? undefined,
        color: tipo.text_color ?? undefined
      }}
    >
      {tipo.name}
    </span>
  )
}

interface OpcionesDefinicion {
  proyectoId: number
  /** Definiciones de `GET /custom-fields?para=tasks`; solo las de `show_on_table` son columna. */
  camposPersonalizados: DefinicionCampoPersonalizado[]
  capacidades: Capacidad[]
  estados: OpcionFiltro[]
  /** Se llama cuando una celda escribio algo y la tabla tiene que volver a pedir los datos. */
  onCambiado: () => void
}

/**
 * La definicion de Procesos acotada a la pestaña Tareas de un proyecto.
 *
 * **Acotar por la ruta y no por un filtro.** `GET /projects/{id}/tasks` inyecta `filter[project_id]`
 * del lado del backend y acepta el resto de los parametros del listado. Un filtro en la URL quedaria
 * visible, editable y borrable por quien mira: sacarlo dejaria el panel de un proyecto mostrando las
 * tareas de todos.
 *
 * @param opciones proyecto, catalogos y el aviso de recarga
 * @returns la definicion lista para `TablaRecurso`
 */
export function definicionDeTareas ({
  proyectoId,
  camposPersonalizados,
  capacidades,
  estados,
  onCambiado
}: OpcionesDefinicion): DefinicionRecurso<ProcesoAmpliado> {
  const editable = capacidades.includes('edit')

  const columnas: Array<Columna<ProcesoAmpliado>> = [
    {
      clave: 'seleccion',
      encabezado: '',
      presentar: (proceso) => <CasillaFila proceso={proceso} />
    },
    { clave: 'id', encabezado: '#', numerica: true, presentar: (proceso) => proceso.id },
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (proceso) => <EnlaceTarea proceso={proceso} /> },
    { clave: 'task_type', encabezado: 'Task type', presentar: (proceso) => <TipoDeTarea proceso={proceso} /> },
    {
      clave: 'status',
      encabezado: 'Estado',
      ordenPor: 'status',
      presentar: (proceso) => (
        <EstadoEditable proceso={proceso} estados={estados} editable={editable} onCambiado={onCambiado} />
      )
    },
    {
      clave: 'start_date',
      encabezado: 'Fecha de inicio',
      ordenPor: 'start_date',
      presentar: (proceso) => <Fecha valor={proceso.start_date} />
    },
    {
      clave: 'due_date',
      encabezado: 'Fecha de vencimiento',
      ordenPor: 'due_date',
      presentar: (proceso) => <Fecha valor={proceso.due_date} comoVencimiento />
    },
    {
      clave: 'assignees',
      encabezado: 'Asignar a',
      presentar: (proceso) => <GrupoAvatares personas={proceso.assignees} />
    },
    { clave: 'tags', encabezado: 'Etiquetas', presentar: (proceso) => <Etiquetas etiquetas={proceso.tags} /> },
    {
      clave: 'iterations',
      encabezado: 'Iteraciones',
      numerica: true,
      // Es un contador propio de Wiwo (`tblwiwo_task_iterations`). Mientras el backend no lo mande,
      // la celda queda vacia en vez de mostrar un cero que no se conto.
      presentar: (proceso) => proceso.counts.iterations ?? '—'
    },
    {
      clave: 'priority',
      encabezado: 'Prioridad',
      ordenPor: 'priority',
      comoInsignia: 'task_priorities',
      presentar: (proceso) => proceso.priority
    },
    ...camposDeTabla(camposPersonalizados).map((campo): Columna<ProcesoAmpliado> => ({
      clave: campo.slug,
      encabezado: campo.name,
      presentar: (proceso) => valorDeCampo(proceso, campo.slug) || '—'
    }))
  ]

  return {
    ...PROCESOS,
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/tasks`,
    columnas,
    // Dentro de un proyecto, el filtro por proyecto ofrece cambiar de proyecto sin cambiar de
    // pantalla. Se poda.
    filtros: PROCESOS.filtros.filter((filtro) => filtro.clave !== 'project_id'),
    // Los campos personalizados son columnas: sin el include, sus celdas llegan vacias.
    incluirSiempre: ['custom_fields']
  }
}
