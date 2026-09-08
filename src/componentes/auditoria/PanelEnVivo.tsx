'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, ChevronRight, FolderOpen, ListTodo, ShieldAlert, Users } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { MetaPresencia, PersonaConectada, SuplantacionViva } from '@/datos/auditoria'
import { formatearFecha } from '@/lib/fechas'
import { arbolDePresencia, haceCuanto, type RamaPresencia } from './presentacion'
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
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-texto text-titulo text-balance font-semibold">Ahora mismo</h2>
          <p className="text-texto-tenue text-pretty text-xs">Cliente → proyecto → tarea</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-texto flex items-center gap-2 text-sm font-medium tabular-nums">
            <span aria-hidden="true" className={cn('size-2 rounded-full', error ? 'bg-texto-peligro' : conectados.length > 0 ? 'bg-texto-exito' : 'bg-texto-sutil')} />
            {conectados.length} {conectados.length === 1 ? 'persona activa' : 'personas activas'}
          </span>
          <p className="text-texto-sutil text-xs">
            {meta === null ? 'Actividad reciente' : `Señales en los últimos ${meta.window_seconds} s`}
          </p>
        </div>
      </div>
      {error !== null && <p role="status" className="text-texto-peligro text-pretty text-sm">{error}</p>}

      {conectados.length === 0
        ? (
          <Vacio
            titulo="Nadie conectado en este momento"
            descripcion="Aparece aquí quien navegue o interactúe con el panel. La presencia caduca al dejar de usarlo."
            className="border-linea bg-superficie-hundida rounded-tarjeta border"
          />
          )
        : (
          <ul aria-label="Actividad por cliente, proyecto y tarea" className="flex flex-col gap-3">
            {arbolDePresencia(conectados).map((rama) => <RamaActividad key={rama.clave} rama={rama} />)}
          </ul>
          )}
    </section>
  )
}


/** Rama nativa con una superficie por cliente y guías que conectan proyectos y tareas. */
function RamaActividad ({ rama }: { rama: RamaPresencia }) {
  const esCliente = rama.clave.startsWith('cliente:')
  const esProyecto = rama.clave.startsWith('proyecto:')
  const Icono = esCliente ? Building2 : esProyecto ? FolderOpen : ListTodo

  return (
    <li className={cn('min-w-0', esCliente
      ? 'border-linea bg-superficie-elevada rounded-tarjeta border p-2 sm:p-3'
      : 'relative before:absolute before:top-6 before:-left-3 before:w-3 before:border-t before:border-linea')}>
      <details open className="[&[open]>summary>.chevron-rama]:rotate-90">
        <summary className={cn(
          'text-texto hover:bg-hover rounded-control flex min-h-12 cursor-pointer list-none items-center gap-2 p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento [&::-webkit-details-marker]:hidden',
          esCliente ? 'font-semibold' : 'text-sm'
        )}>
          <ChevronRight aria-hidden="true" size={14} className="chevron-rama text-texto-sutil shrink-0" />
          <span className={cn('flex shrink-0 items-center justify-center', esCliente
            ? 'bg-seleccionado text-acento rounded-control size-9'
            : 'text-texto-tenue size-6')}>
            <Icono aria-hidden="true" size={esCliente ? 18 : 16} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{rama.nombre}</span>
          <span className="text-texto-tenue flex shrink-0 items-center gap-1.5 pl-1 text-xs font-normal tabular-nums">
            <Users aria-hidden="true" size={14} />
            {rama.total}<span className="sr-only"> {rama.total === 1 ? 'persona activa' : 'personas activas'}</span>
          </span>
        </summary>
        <div className={cn('pb-1', esCliente ? 'px-1 sm:px-2' : '')}>
          {rama.personas.length > 0 && (
            <ul className="divide-linea-suave ml-3 divide-y sm:ml-6">
              {rama.personas.map((persona) => <PersonaActiva key={persona.staff.id} persona={persona} />)}
            </ul>
          )}
          {rama.ramas.length > 0 && (
            <ul className="border-linea ml-3 flex min-w-0 flex-col gap-1 border-l pl-3 sm:ml-5">
              {rama.ramas.map((hija) => <RamaActividad key={hija.clave} rama={hija} />)}
            </ul>
          )}
        </div>
      </details>
    </li>
  )
}

/** Fila de persona: identidad y actividad legibles, tiempo discreto y alerta de suplantación intacta. */
function PersonaActiva ({ persona }: { persona: PersonaConectada }) {
  return (
    <li className={cn(
      'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]',
      persona.impersonated_by !== null && 'bg-superficie-peligro rounded-control px-2'
    )}>
      <Avatar nombre={persona.staff.full_name} imagen={persona.staff.profile_image_url} tamano="medio" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-texto break-words text-sm font-medium [overflow-wrap:anywhere]">{persona.staff.full_name}</span>
        <span className="text-texto-tenue text-pretty break-words text-xs leading-relaxed [overflow-wrap:anywhere]" title={persona.location}>
          {persona.activity}
        </span>
        {persona.action !== null && persona.context?.task == null && (
          <span className="text-texto-sutil text-pretty break-words text-xs">{persona.location}</span>
        )}
        {persona.impersonated_by !== null && (
          <Insignia tono="peligro" tamano="chico" className="self-start whitespace-normal">
            Suplantada por {persona.impersonated_by.full_name}
          </Insignia>
        )}
      </div>
      <span className="text-texto-sutil col-start-2 text-xs tabular-nums sm:col-start-3 sm:pt-0.5">
        {haceCuanto(persona.seconds_ago)}
      </span>
    </li>
  )
}
