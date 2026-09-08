'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { ACTAS } from '@/definiciones/actas'
import { useRecurso } from './carga'
import { AsistenteDeActa } from './AsistenteDeActa'
import { DetalleActa } from './DetalleActa'
import { PanelRecurso } from './PanelRecurso'
import type { Acta } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Meeting Paper del Proyecto.
 *
 * Es la funcionalidad de MeetingMatico traída al Proyecto del que habla el acta: se le da el audio de
 * la reunión, una foto de la pizarra o los apuntes, y un modelo escribe el documento.
 *
 * A diferencia de las Notas —que siguen existiendo aparte y son privadas de quien las escribió—, un
 * Meeting Paper lo ven **todos los miembros del Proyecto**, que es para lo que sirve un acta: la lee
 * el que no fue a la reunión.
 *
 * Qué se está mirando vive en la URL, igual que en Discusiones: `?acta={id}` abre una, `?acta=nuevo`
 * abre el asistente. Así se comparte por enlace, "atrás" hace lo que la persona espera, y el título
 * de la lista puede ser un enlace de verdad en vez de un `onClick`.
 *
 * **La pestaña se muestra aunque la capa de IA esté apagada.** Diverge del criterio de la pestaña del
 * asistente, y a propósito: el CRUD de actas no cuelga de `/ia/*`, así que sigue respondiendo con el
 * interruptor en cero. Esconder la pestaña dejaría inalcanzables las actas ya escritas por mover un
 * ajuste de instalación, que es peor que una pestaña donde no se puede crear.
 */

interface PropsPanelActas {
  proyectoId: number
  /** Sin la capa de IA se puede leer y corregir, pero no generar ni reescribir. */
  conIa: boolean
  /** Para saber si esta persona puede borrar un acta ajena. */
  yo: Yo
}

export function PanelActas (props: PropsPanelActas): ReactElement {
  // Lee `useSearchParams`: sin este límite de Suspense falla el build de la página que lo monta.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando los Meeting Papers…" />}>
      <ActasDelProyecto {...props} />
    </Suspense>
  )
}

function ActasDelProyecto ({ proyectoId, conIa, yo }: PropsPanelActas): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])
  const pedida = params.get('acta')

  /** Escribe `?acta` conservando el resto de la vista; `null` la saca. */
  const ir = useCallback((valor: string | null) => {
    const siguientes = new URLSearchParams(params.toString())
    if (valor === null) siguientes.delete('acta')
    else siguientes.set('acta', valor)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }, [params, router])

  const definicion = useMemo<DefinicionRecurso<Acta>>(
    () => ({
      ...ACTAS,
      // Se acota por ruta y no por filtro, igual que el resto de las pestañas: así el id del
      // Proyecto no queda editable en la URL de quien mira.
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/actas`,
      columnas: ACTAS.columnas.map((columna) => (
        columna.clave === 'title'
          ? { ...columna, presentar: (a: Acta) => <EnlaceActa acta={a} /> }
          : columna
      ))
    }),
    [proyectoId]
  )

  if (pedida === 'nuevo') {
    return (
      <AsistenteDeActa
        proyectoId={proyectoId}
        onCreada={(acta) => {
          recargar()
          ir(String(acta.id))
        }}
        onCancelar={() => { ir(null) }}
      />
    )
  }

  const abierta = idPositivo(pedida)
  if (abierta !== null) {
    return (
      <ActaAbierta
        actaId={abierta}
        proyectoId={proyectoId}
        conIa={conIa}
        yo={yo}
        onCambiada={recargar}
        onBorrada={() => {
          recargar()
          ir(null)
        }}
        onVolver={() => { ir(null) }}
      />
    )
  }

  const barra = (
    <div className="flex items-center justify-end gap-3">
      {!conIa && (
        <span className="text-texto-sutil text-xs">
          La escritura con IA está desactivada en esta instalación.
        </span>
      )}
      <Boton
        variante="primario"
        tamano="chico"
        disabled={!conIa}
        onClick={() => { ir('nuevo') }}
      >
        Nuevo Meeting Paper
      </Boton>
    </div>
  )

  return (
    <PanelRecurso
      definicion={definicion}
      claveFila={(acta) => acta.id}
      barra={barra}
      revision={revision}
    />
  )
}

/**
 * Trae el acta completa y la muestra.
 *
 * El listado no incluye `content` —la API lo omite a propósito, son ~20.000 caracteres por fila—, así
 * que abrir una es siempre un pedido más.
 */
function ActaAbierta ({
  actaId,
  proyectoId,
  conIa,
  yo,
  onCambiada,
  onBorrada,
  onVolver
}: {
  actaId: number
  proyectoId: number
  conIa: boolean
  yo: Yo
  onCambiada: () => void
  onBorrada: () => void
  onVolver: () => void
}): ReactElement {
  const { estado, recargar } = useRecurso<Acta>(
    `projects/${proyectoId}/actas/${actaId}`,
    'No se pudo cargar el Meeting Paper.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-48" mensaje="Cargando el Meeting Paper…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const acta = estado.datos

  return (
    <DetalleActa
      acta={acta}
      proyectoId={proyectoId}
      // La misma regla que aplica la API: el autor o quien administra. Comprobarlo acá solo evita
      // ofrecer un botón que va a devolver 403; la decisión real la toma el backend.
      puedeBorrar={acta.staff_id === yo.id || yo.is_admin}
      conIa={conIa}
      onCambiada={() => {
        recargar()
        onCambiada()
      }}
      onBorrada={onBorrada}
      onVolver={onVolver}
    />
  )
}

/**
 * Lee un id de la URL.
 *
 * La URL la escribe cualquiera: `?acta=abc` o `?acta=-3` no pueden terminar en un pedido al BFF.
 */
function idPositivo (crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === '') return null

  const id = Number(crudo)

  return Number.isInteger(id) && id > 0 ? id : null
}

/** El título del acta como enlace a su detalle, conservando el resto de la vista. */
function EnlaceActa ({ acta }: { acta: Acta }): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('acta', String(acta.id))

  return (
    <Link
      href={`?${siguientes.toString()}`}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {acta.title}
    </Link>
  )
}
