'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { MetaPresencia, PersonaConectada, SuplantacionViva } from '@/datos/auditoria'
import { formatearFecha } from '@/lib/fechas'
import { haceCuanto } from './presentacion'
import { cn } from '@/lib/clases'

/**
 * Lo que pasa **ahora mismo**: quién está conectado, qué está haciendo, y quién está entrando como
 * otra persona.
 *
 * Es el único bloque de la pantalla que se refresca solo, y no usa `router.refresh()` a propósito:
 * eso volvería a ejecutar la página entera y le reiniciaría la posición y los filtros a la tabla de
 * historial, que la persona está leyendo. Pide sus dos endpoints y se repinta él.
 *
 * Los dos viajes van juntos en el mismo intervalo porque contestan la misma pregunta desde dos
 * lados: `presence` sabe quién está trabajando, y `sessions/impersonations` sabe si alguna de esas
 * sesiones no es de quien parece. La suplantación se pide aparte y no se deduce de la presencia
 * porque una sesión prestada puede estar abierta sin que nadie lata en ella: el aviso tiene que salir
 * igual.
 */

interface PropsPanelEnVivo {
  inicial: { conectados: PersonaConectada[], meta: MetaPresencia | null, suplantaciones: SuplantacionViva[] }
  /** Cada cuántos segundos se vuelve a preguntar. */
  segundos: number
}

export function PanelEnVivo ({ inicial, segundos }: PropsPanelEnVivo) {
  const [conectados, setConectados] = useState(inicial.conectados)
  const [meta, setMeta] = useState(inicial.meta)
  const [suplantaciones, setSuplantaciones] = useState(inicial.suplantaciones)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async (senal: AbortSignal): Promise<void> => {
    const [presencia, impersonaciones] = await Promise.all([
      fetch('/api/bff/presence', { signal: senal }),
      fetch('/api/bff/sessions/impersonations', { signal: senal })
    ])

    if (!presencia.ok || !impersonaciones.ok) {
      throw new Error('La API no respondió a la consulta de actividad en vivo.')
    }

    const datosPresencia = await presencia.json() as { data: PersonaConectada[], meta?: MetaPresencia }
    const datosSuplantacion = await impersonaciones.json() as { data: SuplantacionViva[] }

    setConectados(datosPresencia.data)
    setMeta(datosPresencia.meta ?? null)
    setSuplantaciones(datosSuplantacion.data)
    setError(null)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    function tic (): void {
      // Con la pestaña oculta no se pregunta: nadie está mirando, y el bloque se pone al día solo
      // en cuanto vuelve al frente.
      if (document.hidden) return

      refrescar(control.signal).catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo actualizar la actividad en vivo.')
      })
    }

    const intervalo = globalThis.setInterval(tic, segundos * 1000)
    document.addEventListener('visibilitychange', tic)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', tic)
      control.abort()
    }
  }, [refrescar, segundos])

  return (
    <div className="flex flex-col gap-4">
      <AvisoSuplantacion suplantaciones={suplantaciones} />
      <AhoraMismo conectados={conectados} meta={meta} error={error} />
    </div>
  )
}

/**
 * Aviso destacado y persistente: alguien está usando el panel con la cuenta de otra persona.
 *
 * Se queda mientras la sesión prestada siga viva, no sólo en el momento en que se abrió: el dato
 * cuelga de la fila del token, que caduca sola, así que el aviso se apaga cuando la suplantación
 * termina de verdad y no cuando alguien se acuerda de cerrarla.
 *
 * `role="alert"` y no un simple recuadro de color: quien audita con lector de pantalla también tiene
 * que enterarse, y es la misma decisión que ya toma `ErrorEstado`.
 */
function AvisoSuplantacion ({ suplantaciones }: { suplantaciones: SuplantacionViva[] }) {
  if (suplantaciones.length === 0) return null

  return (
    <div
      role="alert"
      className="border-linea bg-superficie-peligro rounded-tarjeta flex flex-col gap-2 border p-4"
    >
      <p className="text-texto-peligro flex items-center gap-2 font-semibold">
        <ShieldAlert size={18} strokeWidth={2} aria-hidden="true" />
        {suplantaciones.length === 1
          ? 'Hay una sesión abierta a nombre de otra persona'
          : `Hay ${suplantaciones.length} sesiones abiertas a nombre de otras personas`}
      </p>

      <ul className="flex flex-col gap-2">
        {suplantaciones.map((suplantacion) => (
          <li key={suplantacion.session_id} className="flex flex-wrap items-center gap-2 text-sm">
            <Avatar
              nombre={suplantacion.admin?.full_name ?? 'Desconocido'}
              imagen={suplantacion.admin?.profile_image_url}
              tamano="chico"
            />
            <span className="text-texto font-medium">{suplantacion.admin?.full_name ?? 'Cuenta eliminada'}</span>
            <span className="text-texto-tenue">está entrando como</span>
            <Avatar
              nombre={suplantacion.target?.full_name ?? 'Desconocido'}
              imagen={suplantacion.target?.profile_image_url}
              tamano="chico"
            />
            <span className="text-texto font-medium">{suplantacion.target?.full_name ?? 'Cuenta eliminada'}</span>
            <span className="text-texto-sutil text-xs">
              desde {formatearFecha(suplantacion.started_at, true)}
              {suplantacion.ip === null ? '' : ` · ${suplantacion.ip}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Quién está conectado y qué está haciendo.
 *
 * "Conectado" es "latió hace menos que la ventana que informa el servidor", y la ventana se muestra:
 * sin ella, una lista vacía se lee como "no hay nadie" cuando puede querer decir "nadie latió en los
 * últimos dos minutos". Son cosas distintas y la pantalla no las confunde.
 */
function AhoraMismo ({
  conectados,
  meta,
  error
}: {
  conectados: PersonaConectada[]
  meta: MetaPresencia | null
  error: string | null
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-texto text-titulo font-semibold">Ahora mismo</h2>
        <p className="text-texto-sutil text-xs">
          {meta === null
            ? 'Actividad de los últimos minutos.'
            : `Quien dio señales en los últimos ${Math.round(meta.window_seconds / 60)} min.`}
        </p>
        {error !== null && <span className="text-texto-peligro text-xs">{error}</span>}
      </div>

      {conectados.length === 0
        ? (
          <Vacio
            titulo="Nadie conectado en este momento"
            descripcion="Aparece aquí quien tenga el panel abierto y a la vista. Una pestaña en segundo plano no cuenta."
            className="border-linea bg-superficie-hundida rounded-tarjeta border"
          />
          )
        : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {conectados.map((persona) => (
              <li
                key={persona.staff.id}
                className={cn(
                  'border-linea bg-superficie-elevada rounded-tarjeta flex items-center gap-3 border p-3',
                  // Una persona suplantada no se pinta igual que el resto: lo que se ve en su cuenta
                  // puede no estar haciéndolo ella.
                  persona.impersonated_by !== null && 'border-texto-peligro/40 bg-superficie-peligro'
                )}
              >
                <Avatar nombre={persona.staff.full_name} imagen={persona.staff.profile_image_url} tamano="grande" />

                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-texto truncate font-medium">{persona.staff.full_name}</span>
                  <span className="text-texto-tenue truncate text-sm" title={persona.route}>
                    {persona.activity}
                  </span>

                  {/* La acción tapa el lugar en la frase principal; acá vuelve, para no perder dónde. */}
                  {persona.action !== null && (
                    <span className="text-texto-sutil truncate text-xs">{persona.location}</span>
                  )}

                  <span className="text-texto-sutil text-xs">{haceCuanto(persona.seconds_ago)}</span>

                  {persona.impersonated_by !== null && (
                    <Insignia tono="peligro" tamano="chico" className="mt-1 self-start">
                      Suplantada por {persona.impersonated_by.full_name}
                    </Insignia>
                  )}
                </div>
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}
