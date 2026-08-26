'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import type { Cronometro, Proceso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { pedirSobre } from '@/datos/cliente'
import {
  cronometroAbierto,
  formatearDuracion,
  mensajeDeFalloDeCronometro,
  segundosAcumulados
} from './cronometro'

/**
 * Cronometros de una tarea.
 *
 * Muestra el total acumulado —que corre en vivo mientras haya uno abierto—, los marcajes y el boton
 * de arrancar o detener.
 *
 * Pide tres cosas y no una: los marcajes (`/tasks/{id}/timers`), quien mira (`/me`) y la tarea
 * (`/tasks/{id}`). Las dos ultimas no son adorno, son las reglas del backend hechas interfaz:
 *
 *  - solo arranca quien esta **asignado** a la tarea -> hace falta el id propio y los asignados;
 *  - una tarea **facturada** no admite cronometros nuevos (`409`) -> hace falta `billed`;
 *  - `DELETE` detiene **solo el propio** -> hace falta saber cual de los abiertos es mio.
 *
 * Con eso el boton se apaga ANTES de fallar y dice por que. Los fallos que igual lleguen —el estado
 * pudo cambiar en otra pestaña— salen traducidos por `mensajeDeFalloDeCronometro`, nunca como el JSON
 * de la API.
 */

interface PropsCronometros {
  procesoId: number
  className?: string
}

interface Datos {
  timers: Cronometro[]
  tarea: Proceso
  yoId: number
}

export function Cronometros ({ procesoId, className }: PropsCronometros): ReactElement {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [intento, setIntento] = useState(0)
  const [ahora, setAhora] = useState(() => new Date())

  // Limpia el error antes de volver a pedir: si no, un reintento deja el cartel viejo en pantalla
  // mientras la peticion nueva viaja.
  const recargar = useCallback(() => {
    setError(null)
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void cargar(procesoId, control.signal).then((resultado) => {
      if (control.signal.aborted) return

      if (resultado.ok) {
        setDatos(resultado.datos)
        setError(null)
      } else {
        setError(resultado.mensaje)
      }
    })

    return () => { control.abort() }
  }, [procesoId, intento])

  // El total solo tiene que latir mientras haya un cronometro corriendo. Un intervalo que sigue vivo
  // despues de desmontar escribe estado en un componente que ya no existe y no se apaga nunca.
  const hayAbierto = datos !== null && datos.timers.some((timer) => timer.end_time === null)

  useEffect(() => {
    if (!hayAbierto) return

    const tic = setInterval(() => { setAhora(new Date()) }, 1000)

    return () => { clearInterval(tic) }
  }, [hayAbierto])

  if (error !== null) return <ErrorEstado detalle={error} onReintentar={recargar} className={className} />

  if (datos === null) return <Cargando alto="min-h-36" mensaje="Cargando los cronómetros…" className={className} />

  /** Arranca o detiene, y vuelve a leer del servidor: arrancar cierra otros cronometros y puede mover el estado. */
  async function accionar (metodo: 'POST' | 'DELETE'): Promise<void> {
    setEnCurso(true)
    setAviso(null)

    const respuesta = await fetch(`/api/bff/tasks/${procesoId}/timer`, {
      method: metodo,
      headers: { 'content-type': 'application/json' },
      body: metodo === 'POST' ? '{}' : undefined
    })

    setEnCurso(false)

    if (respuesta.ok) {
      recargar()
      return
    }

    setAviso(mensajeDeFalloDeCronometro(respuesta.status, metodo === 'POST'))
  }

  const mio = cronometroAbierto(datos.timers, datos.yoId)
  const impedimento = motivoParaNoArrancar(datos)

  return (
    <section className={cn('border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-4 border p-4', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-texto-tenue text-sm font-semibold">Tiempo registrado</h2>
          <p className="text-texto font-mono text-2xl font-semibold tabular-nums">
            {formatearDuracion(segundosAcumulados(datos.timers, ahora))}
          </p>
        </div>

        {mio !== null
          ? (
            <Boton variante="peligro" cargando={enCurso} onClick={() => { void accionar('DELETE') }}>
              Detener cronómetro
            </Boton>
            )
          : (
            <Boton
              variante="marca"
              cargando={enCurso}
              disabled={impedimento !== null}
              title={impedimento ?? undefined}
              onClick={() => { void accionar('POST') }}
            >
              Arrancar cronómetro
            </Boton>
            )}
      </header>

      {impedimento !== null && mio === null && (
        <p className="text-texto-sutil text-sm">{impedimento}</p>
      )}

      {aviso !== null && (
        <p role="alert" className="border-linea bg-superficie-peligro text-texto-peligro rounded-chico border px-3 py-2 text-sm">
          {aviso}
        </p>
      )}

      {datos.timers.length === 0
        ? <Vacio titulo="Todavía no hay marcajes" descripcion="El tiempo que registres en esta tarea aparece acá." />
        : (
          <ul className="flex flex-col">
            {datos.timers.map((timer) => (
              <Marcaje
                key={timer.id}
                timer={timer}
                ahora={ahora}
                persona={nombreDePersona(datos.tarea, timer.staff_id)}
              />
            ))}
          </ul>
          )}
    </section>
  )
}

/** Una fila de la lista de marcajes. El que corre se distingue con un punto, no solo con el texto. */
function Marcaje ({
  timer,
  ahora,
  persona
}: {
  timer: Cronometro
  ahora: Date
  persona: string
}): ReactElement {
  const corriendo = timer.end_time === null

  return (
    <li className="border-linea-suave flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="text-texto truncate text-sm font-medium">
          {corriendo && <span aria-hidden="true" className="bg-relleno-exito mr-2 inline-block size-2 rounded-full" />}
          {persona}
        </span>
        <span className="text-texto-sutil text-xs">
          {formatearFecha(timer.start_time, true)} → {corriendo ? 'en curso' : formatearFecha(timer.end_time, true)}
        </span>
        {timer.note !== null && timer.note !== '' && (
          <span className="text-texto-tenue text-xs">{timer.note}</span>
        )}
      </div>

      <span className="text-texto font-mono text-sm tabular-nums">
        {formatearDuracion(segundosAcumulados([timer], ahora))}
      </span>
    </li>
  )
}

/**
 * Por que no se puede arrancar, o `null` si se puede.
 *
 * Replica las reglas que el backend hace cumplir con `403` y `409`. Ofrecer un boton que siempre
 * falla es peor que apagarlo diciendo el motivo.
 */
function motivoParaNoArrancar (datos: Datos): string | null {
  if (datos.tarea.billed) return 'La tarea ya está facturada: no admite tiempo nuevo.'

  if (!datos.tarea.assignees.some((persona) => persona.id === datos.yoId)) {
    return 'Solo quien está asignado a la tarea puede registrar tiempo.'
  }

  return null
}

/** Nombre de quien marco. Un id sin correspondencia se muestra como tal, que es mas util que un vacio. */
function nombreDePersona (tarea: Proceso, staffId: number): string {
  const gente = [...tarea.assignees, ...tarea.followers]

  return gente.find((persona) => persona.id === staffId)?.full_name ?? `#${staffId}`
}

type Resultado = { ok: true, datos: Datos } | { ok: false, mensaje: string }

/**
 * Trae los marcajes, la tarea y quien mira.
 *
 * Nunca lanza: el error del contrato es un valor mas y el panel tiene que poder mostrarlo.
 *
 * @param procesoId la tarea
 * @param senal aborta las tres peticiones si el componente se desmonta
 * @returns los datos, o el mensaje ya legible del fallo
 */
async function cargar (procesoId: number, senal: AbortSignal): Promise<Resultado> {
  try {
    const [timers, tarea, yo] = await Promise.all([
      pedirSobre<Cronometro[]>(`tasks/${procesoId}/timers`, senal),
      pedirSobre<Proceso>(`tasks/${procesoId}`, senal),
      pedirSobre<Yo>('me', senal)
    ])

    return { ok: true, datos: { timers: timers.data, tarea: tarea.data, yoId: yo.data.id } }
  } catch (fallo) {
    if (senal.aborted) return { ok: false, mensaje: 'Petición cancelada' }

    return { ok: false, mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los cronómetros.' }
  }
}
