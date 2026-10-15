'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Cajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import type { Acta } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import type { FiltroDeHistorial, RevisionDelActa } from '@/dominio/historial-acta'
import { useRecurso } from '../carga'
import { ConfirmacionDelActa } from './ConfirmacionDelActa'
import { DetalleDelCambio } from './DetalleDelCambio'
import { ListaDelHistorial } from './ListaDelHistorial'

/** Cómo se llama el documento en los textos de este panel; sale del glosario. */
const DOCUMENTO = GLOSARIO.acta.singular

/** El código de estado con que la API avisa que el acta cambió desde la versión que se veía. */
const ESTADO_CONFLICTO = 409

interface PropsHistorial {
  abierto: boolean
  /** Ruta del acta (`projects/{id}/actas/{actaId}`). */
  ruta: string
  /** El `date_updated` del acta que se está viendo; viaja como `revision` al restaurar. */
  revision: string | null
  /** Quien mira puede restaurar: puede editar y no tiene el editor abierto. */
  puedeRestaurar: boolean
  /** Recibe el acta ya restaurada, tal como la devolvió la API. */
  onRestaurada: (acta: Acta) => void
  /** La API contestó 409: el acta cambió; quien monta la vuelve a pedir. */
  onCambioAjeno: () => void
  onCerrar: () => void
}

/**
 * El historial de cambios del Meeting Paper, en un panel lateral.
 *
 * Quién cambió el documento, con qué origen (el Thinking Orb, la IA, una persona, la edición conjunta
 * o una restauración) y cuándo; al elegir un cambio se ve qué texto se movió y se puede volver a la
 * versión de antes. Restaurar no borra nada: la versión vigente pasa al historial.
 *
 * El contenido solo existe mientras el panel está abierto (Radix desmonta el contenido al cerrar):
 * reabrirlo vuelve a pedir la lista y vuelve a la lista, sin arrastrar el filtro ni el cambio de la
 * vez anterior.
 *
 * @param props el estado abierto, la ruta del acta y lo que se hace al restaurar o cerrar
 * @returns el panel
 */
export function HistorialDelActa ({ abierto, onCerrar, ...resto }: PropsHistorial): ReactElement {
  return (
    <Cajon open={abierto} onOpenChange={(siguiente) => { if (!siguiente) onCerrar() }}>
      <ContenidoCajon
        titulo="Historial de cambios"
        descripcion={`Quién cambió el ${DOCUMENTO} y cuándo. Restaurar no borra nada.`}
        className="sm:w-[34rem]"
      >
        <ContenidoDelHistorial {...resto} />
      </ContenidoCajon>
    </Cajon>
  )
}

/** Lo mismo que el panel, sin el marco: la lista, el detalle y el flujo de restaurar. */
function ContenidoDelHistorial ({
  ruta,
  revision,
  puedeRestaurar,
  onRestaurada,
  onCambioAjeno
}: Omit<PropsHistorial, 'abierto' | 'onCerrar'>): ReactElement {
  const { estado, recargar, revalidar } = useRecurso<RevisionDelActa[]>(`${ruta}/revisiones`, 'No se pudo cargar el historial.')
  const [filtro, setFiltro] = useState<FiltroDeHistorial>('todos')
  const [elegido, setElegido] = useState<number | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const aviso = useAviso()
  const raiz = useRef<HTMLDivElement>(null)
  const ultimoElegido = useRef<number | null>(null)

  // Al volver a la lista el foco regresa al botón del cambio que se estaba mirando: el del detalle
  // se desmontó y sin esto el foco se pierde en el panel.
  useEffect(() => {
    if (elegido !== null || ultimoElegido.current === null) return

    raiz.current?.querySelector<HTMLElement>(`[data-revision="${ultimoElegido.current}"]`)?.focus()
  }, [elegido])

  /** Abre el detalle de un cambio y recuerda cuál para devolver el foco. */
  function elegir (entrada: RevisionDelActa): void {
    ultimoElegido.current = entrada.id
    setElegido(entrada.id)
  }

  /**
   * Devuelve el acta a la versión de antes del cambio elegido.
   *
   * Manda `revision` para que, si el acta cambió mientras se miraba, la API conteste 409 y no pise el
   * cambio de otra persona (o del Orbe). Con éxito revalida la lista, que gana la entrada de
   * «Restauración»; con 409 avisa y revalida las dos cosas.
   */
  async function restaurar (): Promise<void> {
    if (elegido === null) return

    setRestaurando(true)

    const resultado = await escribirEnBff<Acta>(
      `${ruta}/revisiones/${elegido}/restaurar`,
      'POST',
      revision === null ? {} : { revision }
    )

    setRestaurando(false)
    setConfirmando(false)

    if (resultado.ok) {
      onRestaurada(resultado.datos)
      revalidar()
      setElegido(null)
      aviso.exito(`${DOCUMENTO} restaurado. La versión anterior quedó en el historial.`)

      return
    }

    if (resultado.estado === ESTADO_CONFLICTO) {
      onCambioAjeno()
      revalidar()
      setElegido(null)
      aviso.advertencia(`No se restauró: el ${DOCUMENTO} cambió mientras mirabas el historial. Revisa el cambio y vuelve a intentarlo.`)

      return
    }

    aviso.error(resultado.mensaje)
  }

  return (
    <div ref={raiz} className="flex min-h-full flex-col">
      {elegido !== null
        ? (
          <DetalleDelCambio
            ruta={ruta}
            revisionId={elegido}
            puedeRestaurar={puedeRestaurar}
            restaurando={restaurando}
            onVolver={() => { setElegido(null) }}
            onRestaurar={() => { setConfirmando(true) }}
          />
          )
        : (
          <>
            {estado.fase === 'cargando' && <Cargando alto="min-h-48" mensaje="Cargando el historial…" />}
            {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
            {estado.fase === 'listo' && (
              <ListaDelHistorial revisiones={estado.datos} filtro={filtro} onFiltrar={setFiltro} onElegir={elegir} />
            )}
          </>
          )}

      <ConfirmacionDelActa
        abierto={confirmando}
        onCambiar={setConfirmando}
        titulo="Restaurar esta versión"
        descripcion={`El ${DOCUMENTO} vuelve a como estaba antes de este cambio. La versión de hoy queda en el historial y se puede recuperar desde ahí.`}
        etiquetaCancelar="Cancelar"
        etiquetaConfirmar="Restaurar"
        variante="primario"
        cargando={restaurando}
        onConfirmar={() => { void restaurar() }}
      />
    </div>
  )
}
