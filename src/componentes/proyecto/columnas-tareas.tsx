'use client'

import { useState, type ReactElement } from 'react'
import { conCeldasRicas } from '@/componentes/datos/celdas-procesos'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { leerError } from '@/datos/errores'
import type { DefinicionCampoPersonalizado, Proceso } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { Columna, DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'
import { procesosDelEspacio } from '@/definiciones/procesos'
import { camposDeTabla, valorDeCampo } from './tareas'

/**
 * Las columnas de la pestaña Tareas de un Espacio.
 *
 * No se escribe una tabla nueva ni una lista de columnas nueva: se parte de `procesosDelEspacio` —la
 * misma definicion que pinta la vista global, acotada por la ruta— y se le cambia **solo lo que es
 * propio de un Espacio**: el estado editable en linea y los campos personalizados. Todo lo demas
 * —que columnas hay, como se llaman, en que orden van, cuales arrancan ocultas— vive en un solo
 * lugar, `src/definiciones/procesos.ts`, para que las dos vistas no vuelvan a separarse.
 *
 * La seleccion de filas ya no vive aca: la dibuja el motor con `seleccionMasiva`, igual que en el
 * listado de Espacios.
 */

interface PropsEstado {
  proceso: Proceso
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
      setError('No se pudo cambiar el estado: revisa la conexión.')
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
        style={{ borderColor: actual?.color ?? undefined }}
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
 * La definicion de Procesos lista para la pestaña Tareas de un Espacio.
 *
 * @param opciones espacio, catalogos y el aviso de recarga
 * @returns la definicion lista para `TablaRecurso`
 */
export function definicionDeTareas ({
  proyectoId,
  camposPersonalizados,
  capacidades,
  estados,
  onCambiado
}: OpcionesDefinicion): DefinicionRecurso<Proceso> {
  const editable = capacidades.includes('edit')
  const base = procesosDelEspacio(proyectoId)

  return {
    ...base,
    columnas: [
      ...conCeldasRicas(base.columnas).map((columna): Columna<Proceso> => {
        if (columna.clave !== 'status') return columna

        // `comoInsignia` se va con el presentador: el editor ya pinta su propia insignia, y dejarlo
        // haria que el motor intentara resolver un elemento de React contra el catalogo.
        return {
          ...columna,
          comoInsignia: undefined,
          presentar: (proceso) => (
            <EstadoEditable proceso={proceso} estados={estados} editable={editable} onCambiado={onCambiado} />
          )
        }
      }),
      ...camposDeTabla(camposPersonalizados).map((campo): Columna<Proceso> => ({
        clave: campo.slug,
        encabezado: campo.name,
        presentar: (proceso) => valorDeCampo(proceso, campo.slug) || '—'
      }))
    ]
  }
}
