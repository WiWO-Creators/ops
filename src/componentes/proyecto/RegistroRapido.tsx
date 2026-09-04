'use client'

import { Minus, Plus } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { leerError } from '@/datos/errores'
import { cn } from '@/lib/clases'
import {
  ATAJOS_MINUTOS,
  MINUTOS_MAXIMOS,
  PASO_MINUTOS,
  ajustarMinutos,
  duracionDesdeMinutos
} from './timesheet'

/**
 * Registro rapido de tiempo ya trabajado, dentro del detalle de una Tarea.
 *
 * Para quien no arranca el cronometro en el momento y al final del dia tiene que dejar sus horas
 * anotadas. Sin esto, la unica via es el formulario completo del Registro de horas de un Espacio:
 * hay que salir de la tarea, entrar al proyecto, buscarla de nuevo en un selector y escribir la
 * duracion a mano. Aca son dos clics y ya se sabe de que tarea se habla.
 *
 * Manda `duration` a `POST /projects/{id}/timesheets`, el mismo endpoint que el formulario completo.
 * El backend interpreta la duracion como un tramo que **termina ahora** y empieza hacia atras, que es
 * justo lo que quiere decir "hoy le dediqué dos horas a esto".
 *
 * El tiempo entra por atajos (30 min, 1 h, 2 h) y se corrige con `−` y `+` de a cuarto de hora, sin
 * teclear. Nada se manda de un solo toque: los atajos preparan la cifra y "Registrar" la confirma,
 * porque un clic de mas aca son horas facturadas que despues hay que ir a borrar.
 */

interface PropsRegistroRapido {
  /** La tarea a la que se le carga el tiempo. */
  procesoId: number
  /** El Espacio de la tarea. El endpoint de registro de horas cuelga del proyecto, no de la tarea. */
  espacioId: number
  /** Por que no se puede registrar, o `null` si se puede. Son las reglas del cronometro. */
  impedimento: string | null
  /** Se llama tras un alta exitosa, para que la lista de marcajes vuelva a leerse del servidor. */
  onRegistrado: () => void
}

export function RegistroRapido ({
  procesoId,
  espacioId,
  impedimento,
  onRegistrado
}: PropsRegistroRapido): ReactElement {
  const [minutos, setMinutos] = useState(0)
  const [enCurso, setEnCurso] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const bloqueado = impedimento !== null || enCurso

  /** Manda el tramo y deja el control en cero, listo para otra carga sin repetir la anterior. */
  async function registrar (): Promise<void> {
    if (minutos <= 0) return

    setEnCurso(true)
    setAviso(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${espacioId}/timesheets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ task_id: procesoId, duration: duracionDesdeMinutos(minutos) })
      })

      if (!respuesta.ok) {
        setAviso((await leerError(respuesta)).message)
        return
      }

      setMinutos(0)
      onRegistrado()
    } catch {
      setAviso('No se pudo registrar el tiempo: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <section className="border-linea-suave flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col">
        <h3 className="text-texto-tenue text-sm font-semibold">Registrar tiempo ya trabajado</h3>
        <p className="text-texto-sutil text-xs">
          Para lo que hiciste sin el cronómetro andando. Se anota como recién terminado.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ATAJOS_MINUTOS.map((atajo) => (
          <Boton
            key={atajo}
            variante={minutos === atajo ? 'primario' : 'secundario'}
            tamano="chico"
            disabled={bloqueado}
            aria-pressed={minutos === atajo}
            onClick={() => setMinutos(atajo)}
          >
            {duracionDesdeMinutos(atajo)} h
          </Boton>
        ))}

        <div className="border-linea bg-superficie rounded-control flex items-center gap-1 border p-1">
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label={`Quitar ${PASO_MINUTOS} minutos`}
            disabled={bloqueado || minutos <= 0}
            onClick={() => setMinutos((actual) => ajustarMinutos(actual, -PASO_MINUTOS))}
          >
            <Minus size={16} aria-hidden="true" />
          </Boton>

          <output
            aria-live="polite"
            className={cn(
              'w-14 text-center font-mono text-sm tabular-nums',
              minutos > 0 ? 'text-texto' : 'text-texto-sutil'
            )}
          >
            {duracionDesdeMinutos(minutos)}
          </output>

          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label={`Sumar ${PASO_MINUTOS} minutos`}
            disabled={bloqueado || minutos >= MINUTOS_MAXIMOS}
            onClick={() => setMinutos((actual) => ajustarMinutos(actual, PASO_MINUTOS))}
          >
            <Plus size={16} aria-hidden="true" />
          </Boton>
        </div>

        <Boton
          variante="marca"
          tamano="chico"
          className="ml-auto"
          cargando={enCurso}
          disabled={bloqueado || minutos <= 0}
          title={impedimento ?? undefined}
          onClick={() => { void registrar() }}
        >
          Registrar
        </Boton>
      </div>

      {aviso !== null && (
        <p role="alert" className="border-linea bg-superficie-peligro text-texto-peligro rounded-chico border px-3 py-2 text-sm">
          {aviso}
        </p>
      )}
    </section>
  )
}
