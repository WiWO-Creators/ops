'use client'

import { useEffect, useState } from 'react'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeLectura, pedirRespuesta } from '@/datos/cliente'
import type { FilaDeLive, ResumenDeJornada } from '@/datos/live'
import { agruparCierre, nombreDeItem, segundosDeItem } from '@/dominio/cierre-jornada'
import { horaDeInicio } from '@/dominio/equipo-en-vivo'

/** Lo que el diálogo sabe decir de la lectura del resumen. */
type Lectura =
  | { estado: 'cargando' }
  | { estado: 'vacio' }
  | { estado: 'error', mensaje: string }
  | { estado: 'listo', resumen: ResumenDeJornada }

/**
 * Pide el resumen de la jornada de una persona.
 *
 * El `404` no es un fallo: la API lo da cuando la persona no está en el alcance de quien pregunta
 * y cuando no tiene jornada abierta, y no distingue entre los dos a propósito (no confirma que
 * alguien existe). Para quien mira son lo mismo: no hay nada que mostrar.
 *
 * @param staffId la persona de la tarjeta
 * @param senal para abortar al cerrar el diálogo
 * @returns la lectura final; nunca lanza por un aborto
 */
async function leerResumen (staffId: number, senal: AbortSignal): Promise<Lectura> {
  const ruta = `live/personas/${staffId}/resumen`

  try {
    const respuesta = await pedirRespuesta(ruta, senal)

    if (respuesta.status === 404) return { estado: 'vacio' }
    if (!respuesta.ok) return { estado: 'error', mensaje: await mensajeDeLectura(respuesta, { metodo: 'GET', ruta: `/api/bff/${ruta}` }) }

    const sobre = await respuesta.json() as { data: ResumenDeJornada }

    return { estado: 'listo', resumen: sobre.data }
  } catch {
    return { estado: 'error', mensaje: 'No se pudo cargar el resumen. Intenta de nuevo en un momento.' }
  }
}

/**
 * El resumen de la jornada de una persona del tablero, en un diálogo de solo lectura.
 *
 * Es el mismo reparto que ve la persona al cerrar su día (`GET /me/jornada/resumen`) pero pedido por
 * quien la supervisa (`GET /live/personas/{id}/resumen`): cuánto lleva de jornada, cuánto está
 * medido, cuánto falta por cubrir y en qué Proyecto y Tarea se fue el tiempo. No tiene acciones: no
 * se agrega tiempo ni se cierra nada a nombre de otra persona.
 *
 * Sin jornada abierta, o sin permiso para verla, es un estado vacío y no un error.
 *
 * @param fila la persona cuyo resumen se pide, o `null` con el diálogo cerrado
 * @param onCerrar se llama al cerrar con `Escape`, la X o un clic fuera
 */
export function ResumenDePersona ({ fila, onCerrar }: { fila: FilaDeLive | null, onCerrar: () => void }) {
  return (
    <Dialogo open={fila !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      {fila !== null && (
        <ContenidoDialogo
          titulo={`Jornada de ${fila.staff.name}`}
          descripcion="Lo medido desde que abrió su jornada. Es de solo lectura."
          cerrable
        >
          <CuerpoDelResumen key={fila.staff.id} staffId={fila.staff.id} />
        </ContenidoDialogo>
      )}
    </Dialogo>
  )
}

/** Pide y pinta el resumen; vive mientras el diálogo esté abierto. */
function CuerpoDelResumen ({ staffId }: { staffId: number }) {
  const [lectura, setLectura] = useState<Lectura>({ estado: 'cargando' })

  useEffect(() => {
    const control = new AbortController()

    void leerResumen(staffId, control.signal).then((resultado) => {
      if (!control.signal.aborted) setLectura(resultado)
    })

    return () => { control.abort() }
  }, [staffId])

  if (lectura.estado === 'cargando') {
    return <p className="text-texto-sutil text-sm">Cargando el resumen…</p>
  }

  if (lectura.estado === 'vacio') {
    return (
      <Vacio
        titulo="Sin jornada para mostrar"
        descripcion="Esta persona no tiene una jornada abierta, o no tienes permiso para ver su detalle."
      />
    )
  }

  if (lectura.estado === 'error') {
    return <p role="status" className="text-texto-peligro text-sm text-pretty">{lectura.mensaje}</p>
  }

  return <DetalleDelResumen resumen={lectura.resumen} />
}

/** Los tres totales y el reparto por Proyecto y Tarea. */
function DetalleDelResumen ({ resumen }: { resumen: ResumenDeJornada }) {
  const grupos = agruparCierre(resumen.items)
  const desde = horaDeInicio(resumen.jornada.started_at)
  const cliente = resumen.jornada.client ?? null

  return (
    <div className="flex flex-col gap-4">
      <dl className="border-linea bg-superficie-hundida rounded-chico grid grid-cols-3 gap-x-4 border p-3">
        <Total etiqueta="Jornada" segundos={resumen.jornada.seconds} />
        <Total etiqueta="Medido" segundos={resumen.measured_seconds} />
        <Total etiqueta="Sin cubrir" segundos={resumen.uncovered_seconds} destacado />
      </dl>

      {(desde !== null || cliente !== null) && (
        <p className="text-texto-tenue text-sm text-pretty">
          {desde !== null && `Abierta desde las ${desde}.`}
          {cliente !== null && ` Día para ${cliente.name}.`}
        </p>
      )}

      {grupos.length === 0
        ? <p className="text-texto-sutil text-sm text-pretty">Todavía no midió tiempo en esta jornada.</p>
        : (
          <ul className="flex flex-col gap-3">
            {grupos.map((grupo) => (
              <li key={grupo.espacioId ?? 'sin-espacio'} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-texto truncate text-sm font-semibold">{grupo.nombre}</span>
                  <span data-numerico className="text-texto-tenue shrink-0 font-mono text-xs tabular-nums">
                    {formatearDuracion(grupo.segundos)}
                  </span>
                </div>

                <ul className="border-linea-suave flex flex-col gap-1 border-l pl-3">
                  {grupo.items.map((item, indice) => (
                    <li key={item.task?.id ?? `sin-tarea-${indice}`} className="flex items-baseline justify-between gap-3">
                      <span className="text-texto-tenue min-w-0 truncate text-sm">
                        {nombreDeItem(item)}
                        {item.corriendo && <span className="text-texto-aviso ml-1.5 text-xs">· corriendo</span>}
                      </span>
                      <span data-numerico className="text-texto-tenue shrink-0 font-mono text-xs tabular-nums">
                        {formatearDuracion(segundosDeItem(item))}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          )}
    </div>
  )
}

/** Un total: etiqueta y duración. «Sin cubrir» se destaca cuando hay algo sin cubrir. */
function Total ({ etiqueta, segundos, destacado = false }: { etiqueta: string, segundos: number, destacado?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-texto-sutil text-xs">{etiqueta}</dt>
      <dd
        data-numerico
        className={destacado && segundos > 0
          ? 'text-texto-aviso font-mono text-sm font-semibold tabular-nums'
          : 'text-texto font-mono text-sm font-semibold tabular-nums'}
      >
        {formatearDuracion(segundos)}
      </dd>
    </div>
  )
}
