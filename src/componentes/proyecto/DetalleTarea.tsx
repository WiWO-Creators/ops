'use client'

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { ArbolDrive } from '@/componentes/archivos/ArbolDrive'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { listaDe, nombreDe } from '@/datos/catalogos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type { EstadoLookup, Lookups, Proceso } from '@/datos/recursos'
import type { Sobre } from '@/datos/tipos'
import { Cronometros } from './Cronometros'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'

/**
 * Detalle de una Tarea, para el modal que lo muestra (`ModalTarea`).
 *
 * Pide dos cosas: la tarea (`/tasks/{id}`, que ya trae `description`) y los catalogos (`/lookups`).
 * Los catalogos no son adorno: `status` y `priority` llegan como numeros, y sin la lista un "2" en
 * pantalla no dice nada. Van en la misma tanda porque mostrar el detalle sin ellos es mostrarlo a
 * medias.
 *
 * El 404 se separa del error a proposito: un id que no existe —un enlace viejo, una tarea borrada—
 * no tiene nada que reintentar, y ofrecer un boton que va a fallar igual es mentir.
 */

interface PropsDetalleTarea {
  procesoId: number
  className?: string
}

/** Estado de la carga. El error es un texto ya listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', tarea: Proceso, lookups: Lookups }
  | { fase: 'noEncontrada' }
  | { fase: 'error', mensaje: string }

export function DetalleTarea ({ procesoId, className }: PropsDetalleTarea): ReactElement {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  // Vuelve a la fase de carga antes de pedir: si no, el reintento deja el cartel viejo en pantalla
  // mientras la peticion nueva viaja.
  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void cargar(procesoId, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [procesoId, intento])

  if (carga.fase === 'cargando') return <Cargando mensaje="Cargando la tarea…" className={className} />

  if (carga.fase === 'noEncontrada') {
    return (
      <Vacio
        titulo={`No encontramos esta ${GLOSARIO.proceso.singular.toLowerCase()}`}
        descripcion="Puede que la hayan borrado o que el enlace apunte a otra cosa."
        className={className}
      />
    )
  }

  if (carga.fase === 'error') {
    return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} className={className} />
  }

  const { tarea, lookups } = carga
  const estado = valorDeCatalogo(listaDe(lookups, 'task_statuses'), tarea.status)
  const prioridad = valorDeCatalogo(listaDe(lookups, 'task_priorities'), tarea.priority)

  return (
    <div className={cn('flex flex-col gap-5', className)}>
        <header className="border-linea bg-superficie-acentuada rounded-tarjeta flex flex-col gap-2 border p-4">
          <h3 className="font-titular text-texto text-base leading-snug font-extrabold">{tarea.name}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tamano="chico" color={estado.color}>{estado.nombre}</Insignia>
            <Insignia tamano="chico" color={prioridad.color}>{prioridad.nombre}</Insignia>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Dato etiqueta={GLOSARIO.espacio.singular}>{tarea.project?.name ?? SIN_DATO}</Dato>
          <Dato etiqueta={GLOSARIO.hito.singular}>{tarea.milestone?.name ?? SIN_DATO}</Dato>
          <Dato etiqueta="Inicio"><Fecha valor={tarea.start_date} /></Dato>
          <Dato etiqueta="Entrega"><Fecha valor={tarea.due_date} comoVencimiento /></Dato>
          <Dato etiqueta="Asignados">
            <GrupoAvatares personas={tarea.assignees} tamano="chico" />
          </Dato>
          <Dato etiqueta="Etiquetas">
            {tarea.tags.length === 0 ? SIN_DATO : <Etiquetas etiquetas={tarea.tags} maximo={4} />}
          </Dato>
        </dl>

        <Contadores counts={tarea.counts} />

        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Descripción</h4>
          <Descripcion html={tarea.description} />
        </section>

        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Archivos</h4>
          <ArbolDrive raiz="tasks" id={procesoId} />
        </section>

        <Cronometros procesoId={procesoId} />
    </div>
  )
}

const SIN_DATO = '—'

/** Un par etiqueta/valor de la ficha. La etiqueta va en versalita, como en `ResumenProyecto`. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

/**
 * Los contadores que la API ya resuelve.
 *
 * La lista de control se muestra como "hechos de total" y no como dos numeros sueltos: "3" sin el
 * total no dice si falta todo o nada.
 */
function Contadores ({ counts }: { counts: Proceso['counts'] }): ReactElement {
  return (
    <ul className="border-linea bg-superficie-elevada rounded-tarjeta grid grid-cols-3 gap-2 border p-3">
      <Contador etiqueta="Comentarios" valor={String(counts.comments)} />
      <Contador etiqueta="Lista" valor={`${counts.checklist_done}/${counts.checklist}`} />
      <Contador etiqueta="Adjuntos" valor={String(counts.attachments)} />
    </ul>
  )
}

/** Un contador suelto: el numero grande arriba, el nombre debajo. */
function Contador ({ etiqueta, valor }: { etiqueta: string, valor: string }): ReactElement {
  return (
    <li className="flex flex-col items-center gap-0.5">
      <span data-numerico className="text-texto text-lg leading-none font-semibold tabular-nums">{valor}</span>
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </span>
    </li>
  )
}

/**
 * La descripcion de la tarea, como texto.
 *
 * **Nunca con `dangerouslySetInnerHTML`.** El HTML lo escriben personas en el editor de Perfex y
 * llega tal cual: inyectarlo seria ejecutar en nuestra sesion lo que cualquiera haya guardado ahi
 * —un `<script>`, un `onerror=` en una imagen rota—, o sea un XSS con la cookie de sesion adentro.
 * Se muestra el texto plano, que React escapa solo, y los saltos de linea se conservan con CSS.
 */
function Descripcion ({ html }: { html: string | undefined }): ReactElement {
  const texto = typeof html === 'string' ? aTextoPlano(html) : ''

  if (texto === '') {
    return <p className="text-texto-sutil text-sm">Esta {GLOSARIO.proceso.singular.toLowerCase()} no tiene descripción.</p>
  }

  return <p className="text-texto-tenue max-w-prose text-sm whitespace-pre-line">{texto}</p>
}

/** Nombre y color de un valor de catalogo, listos para una insignia. */
function valorDeCatalogo (lista: EstadoLookup[], id: number): { nombre: string, color: string | null } {
  return { nombre: nombreDe(lista, id), color: lista.find((item) => item.id === id)?.color ?? null }
}

const ENTIDADES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'"
}

/**
 * Convierte el HTML de Perfex en texto legible.
 *
 * No sanitiza para volver a inyectar: quita el marcado y devuelve texto, que es lo unico que se
 * pinta. Los cierres de bloque y los `<br>` se vuelven saltos de linea para no pegar parrafos
 * distintos en una sola frase, y el contenido de `<script>`/`<style>` se descarta entero porque no
 * es texto que nadie quiso escribir.
 *
 * @param html el `description` crudo de la API
 * @returns el texto plano, sin lineas en blanco de mas y sin espacios en los bordes
 */
function aTextoPlano (html: string): string {
  const texto = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')

  return Object.entries(ENTIDADES)
    .reduce((acumulado, [entidad, caracter]) => acumulado.replaceAll(entidad, caracter), texto)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Trae la tarea y los catalogos.
 *
 * Nunca lanza: el error del contrato es un valor mas y el cajon tiene que poder mostrarlo.
 *
 * @param procesoId la tarea
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto — `listo`, `noEncontrada` o `error`
 */
async function cargar (procesoId: number, senal: AbortSignal): Promise<Carga> {
  try {
    const [tarea, lookups] = await Promise.all([
      pedirRespuesta(`tasks/${procesoId}`, senal),
      pedirRespuesta('lookups', senal)
    ])

    if (tarea.status === 404) return { fase: 'noEncontrada' }

    if (!tarea.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(tarea) }
    if (!lookups.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(lookups) }

    const sobreTarea = await tarea.json() as Sobre<Proceso>
    const sobreLookups = await lookups.json() as Sobre<Lookups>

    return { fase: 'listo', tarea: sobreTarea.data, lookups: sobreLookups.data }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar la tarea.' }
  }
}
