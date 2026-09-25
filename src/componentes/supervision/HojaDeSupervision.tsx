'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, PenLine, Printer, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Vacio } from '@/componentes/estado/Estados'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import {
  rutaDeFirma,
  rutaDeRevisiones,
  type EstadoDeRevision,
  type FirmaDeHoja,
  type HojaDeSupervision as Hoja,
  type RevisionDeTarea,
  type TareaDeLaHoja
} from '@/datos/supervision'
import { htmlDeHojaImprimible } from '@/dominio/hoja-imprimible'
import {
  LARGO_MAXIMO_NOTA,
  avisoDeFirma,
  conRevision,
  siguienteEstado,
  sinRevisar,
  textoDeAtraso
} from '@/dominio/supervision'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'

/**
 * La hoja del día de un supervisor: las Tareas de sus clientes que vencen hoy o ya vencieron.
 *
 * Quien es el propio supervisor y la hoja sigue abierta (`puede_editar`) marca cada Tarea OK o No OK,
 * con una nota si quiere, y al final firma. Firmada, la hoja entera pasa a solo lectura con el sello
 * de quién y cuándo. Quien mira la hoja de otro —su jefatura, la administración— la ve siempre en
 * solo lectura: la API solo deja escribir al dueño.
 *
 * Cada marca se guarda al pulsarla, sin un botón de guardar: la revisión se hace recorriendo la
 * lista, y un guardado al final perdería todo si se cierra la pestaña a mitad.
 *
 * @param hojaInicial la hoja tal como la devolvió la API en el servidor
 */
export function HojaDeSupervision ({ hojaInicial }: { hojaInicial: Hoja }) {
  const [hoja, setHoja] = useState(hojaInicial)
  const [guardando, setGuardando] = useState<number | null>(null)
  const [errorDeTarea, setErrorDeTarea] = useState<{ tareaId: number, mensaje: string } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const editable = hoja.puede_editar && hoja.firma === null

  /**
   * Manda la revisión de una Tarea y aplica lo que la API guardó.
   *
   * Un 409 significa que la hoja se firmó en otra pestaña: se pasa a solo lectura en vez de dejar
   * botones que van a fallar todos.
   */
  async function revisar (tarea: TareaDeLaHoja, estado: EstadoDeRevision | null, nota: string | null) {
    if (!editable || guardando !== null) return

    setGuardando(tarea.id)
    setErrorDeTarea(null)

    const cuerpo = estado === null ? { task_id: tarea.id, estado } : { task_id: tarea.id, estado, nota }
    const resultado = await escribirEnBff<RevisionDeTarea | null>(rutaDeRevisiones(hoja.fecha), 'PUT', cuerpo)

    setGuardando(null)

    if (!resultado.ok) {
      if (resultado.estado === 409) {
        setHoja((actual) => ({ ...actual, puede_editar: false }))
        setAviso('Esta hoja ya está firmada: no se pueden cambiar sus revisiones. Recarga la página para ver el sello.')

        return
      }

      setErrorDeTarea({ tareaId: tarea.id, mensaje: resultado.mensaje })

      return
    }

    setHoja((actual) => conRevision(actual, tarea.id, resultado.datos ?? null))
  }

  /** Cierra la hoja con la firma de quien mira. */
  function firmada (firma: FirmaDeHoja) {
    setHoja((actual) => ({ ...actual, firma, puede_editar: false }))
  }

  return (
    <div className="flex flex-col gap-6">
      <Resumen hoja={hoja} editable={editable} onFirmada={firmada} />

      {aviso !== null && <p role="alert" className="text-texto-peligro text-sm">{aviso}</p>}

      {hoja.clientes.length === 0
        ? <HojaVacia />
        : hoja.clientes.map((cliente) => (
          <section key={cliente.client_id} className="flex flex-col gap-2" aria-labelledby={`cliente-${cliente.client_id}`}>
            <h2 id={`cliente-${cliente.client_id}`} className="text-base font-semibold">
              {cliente.company}
              <span className="text-texto-tenue ml-2 text-sm font-normal">{cliente.tareas.length}</span>
            </h2>
            <ul className="border-linea rounded-tarjeta divide-linea flex flex-col divide-y border">
              {cliente.tareas.map((tarea) => (
                <FilaDeTarea
                  key={tarea.id}
                  tarea={tarea}
                  editable={editable}
                  guardando={guardando === tarea.id}
                  error={errorDeTarea?.tareaId === tarea.id ? errorDeTarea.mensaje : null}
                  onRevisar={(estado, nota) => { void revisar(tarea, estado, nota) }}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

/** El vacío de una hoja sin Tareas, que no es un error: es un buen día. */
function HojaVacia () {
  return (
    <Vacio
      titulo="Sin tareas por supervisar este día"
      descripcion="Ninguna tarea de tus clientes vence este día ni está atrasada. Si esperabas ver alguna, revisa en la ficha del cliente que figures como supervisor."
    />
  )
}

/** La barra de totales, el sello o el botón de firmar, y el de imprimir. */
function Resumen ({ hoja, editable, onFirmada }: { hoja: Hoja, editable: boolean, onFirmada: (firma: FirmaDeHoja) => void }) {
  const { totales } = hoja

  return (
    <div id="firma" className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-wrap items-center justify-between gap-3 border p-3">
      <p className="text-sm">
        <strong>{totales.tareas}</strong> tareas · <strong className={cn(totales.atrasadas > 0 && 'text-texto-peligro')}>{totales.atrasadas}</strong> atrasadas ·{' '}
        <strong>{totales.revisadas}</strong> revisadas ({totales.ok} OK, {totales.no_ok} No OK)
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {hoja.firma !== null && <Sello firma={hoja.firma} />}
        <Boton tamano="chico" onClick={() => { imprimirHoja(htmlDeHojaImprimible(hoja)) }}>
          <Printer className="size-4" aria-hidden />
          Imprimir hoja
        </Boton>
        {editable && totales.tareas > 0 && <FirmarHoja hoja={hoja} onFirmada={onFirmada} />}
      </div>
    </div>
  )
}

/** Quién firmó y cuándo. */
function Sello ({ firma }: { firma: FirmaDeHoja }) {
  return (
    <p role="status" className="bg-relleno-exito text-relleno-exito-contenido rounded-control flex items-center gap-1.5 px-3 py-1 text-sm">
      <PenLine className="size-4" aria-hidden />
      Firmada por {firma.nombre} el {formatearFecha(firma.firmado_en, true)}
    </p>
  )
}

/**
 * El botón de firma con su confirmación.
 *
 * El diálogo dice cuántas Tareas quedan sin revisar: firmar con pendientes está permitido, pero no
 * puede pasar sin que se vea, porque firmada ya no se marca nada.
 */
function FirmarHoja ({ hoja, onFirmada }: { hoja: Hoja, onFirmada: (firma: FirmaDeHoja) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Firma y cierra el diálogo; un 409 también cierra, porque la hoja ya estaba firmada. */
  async function firmar () {
    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff<FirmaDeHoja>(rutaDeFirma(hoja.fecha), 'POST', {})

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.estado === 409
        ? 'Esta hoja ya estaba firmada. Recarga la página para ver el sello.'
        : resultado.mensaje)

      return
    }

    setAbierto(false)
    onFirmada(resultado.datos)
  }

  return (
    <>
      <Boton tamano="chico" variante="primario" onClick={() => { setError(null); setAbierto(true) }}>
        <PenLine className="size-4" aria-hidden />
        Firmar hoja
      </Boton>
      <Dialogo open={abierto} onOpenChange={setAbierto}>
        <ContenidoDialogo titulo="¿Firmar la hoja?" descripcion={avisoDeFirma(hoja.totales)}>
          <div className="flex flex-col gap-4">
            {sinRevisar(hoja.totales) > 0 && (
              <p className="text-texto-aviso text-sm">Las tareas sin revisar quedan así en la hoja firmada.</p>
            )}
            {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <CerrarDialogo asChild>
                <Boton variante="secundario">Cancelar</Boton>
              </CerrarDialogo>
              <Boton variante="primario" cargando={enviando} onClick={() => { void firmar() }}>
                Sí, firmar
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </>
  )
}

interface PropsFilaDeTarea {
  tarea: TareaDeLaHoja
  editable: boolean
  guardando: boolean
  error: string | null
  onRevisar: (estado: EstadoDeRevision | null, nota: string | null) => void
}

/** Una Tarea de la hoja, con sus botones de revisión cuando la hoja se puede editar. */
function FilaDeTarea ({ tarea, editable, guardando, error, onRevisar }: PropsFilaDeTarea) {
  const estado = tarea.revision?.estado ?? null
  const [nota, setNota] = useState(tarea.revision?.nota ?? '')

  /** La nota recortada, o `null` si quedó vacía. */
  const notaAMandar = (): string | null => (nota.trim() === '' ? null : nota.trim())

  /** Guarda la nota al salir del campo, solo si cambió y la Tarea ya tiene un estado. */
  function guardarNota () {
    if (estado === null || notaAMandar() === (tarea.revision?.nota ?? null)) return

    onRevisar(estado, notaAMandar())
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="min-w-0 text-sm">
          {tarea.patente !== null && <span className="text-texto-tenue mr-2 font-mono text-xs">{tarea.patente}</span>}
          <Link href={`/procesos?${PARAMETRO_TAREA}=${tarea.id}`} className="font-medium underline-offset-4 hover:underline">
            {tarea.name}
          </Link>
        </p>
        <p className="text-texto-tenue flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>{tarea.proyecto?.name ?? 'Sin proyecto'}</span>
          <span>{tarea.asignados.length === 0 ? 'Sin asignar' : tarea.asignados.map((a) => a.nombre).join(', ')}</span>
          <span>Vence {formatearFecha(tarea.duedate)}</span>
          <span className={cn('font-semibold', tarea.dias_atraso > 0 ? 'text-texto-peligro' : 'text-texto-aviso')}>
            {textoDeAtraso(tarea.dias_atraso)}
          </span>
        </p>
        {!editable && tarea.revision?.nota !== null && tarea.revision?.nota !== undefined && (
          <p className="text-texto-sutil text-xs">Nota: {tarea.revision.nota}</p>
        )}
        {editable && estado !== null && (
          <Entrada
            value={nota}
            maxLength={LARGO_MAXIMO_NOTA}
            placeholder="Nota (opcional)"
            aria-label={`Nota de ${tarea.name}`}
            onChange={(evento) => { setNota(evento.target.value) }}
            onBlur={guardarNota}
            className="max-w-md"
          />
        )}
        {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
      </div>

      {editable
        ? (
          <div className="flex shrink-0 gap-2" role="group" aria-label={`Revisión de ${tarea.name}`}>
            <Boton
              tamano="chico"
              variante={estado === 'ok' ? 'marca' : 'secundario'}
              aria-pressed={estado === 'ok'}
              aria-label={`OK: ${tarea.name}`}
              cargando={guardando}
              onClick={() => { onRevisar(siguienteEstado(estado, 'ok'), notaAMandar()) }}
            >
              <Check className="size-4" aria-hidden />
              OK
            </Boton>
            <Boton
              tamano="chico"
              variante={estado === 'no_ok' ? 'peligro' : 'secundario'}
              aria-pressed={estado === 'no_ok'}
              aria-label={`No OK: ${tarea.name}`}
              disabled={guardando}
              onClick={() => { onRevisar(siguienteEstado(estado, 'no_ok'), notaAMandar()) }}
            >
              <X className="size-4" aria-hidden />
              No OK
            </Boton>
          </div>
          )
        : <EstadoLeido estado={estado} />}
    </li>
  )
}

/** El estado de una Tarea en una hoja de solo lectura. */
function EstadoLeido ({ estado }: { estado: EstadoDeRevision | null }) {
  if (estado === null) return <span className="text-texto-tenue shrink-0 text-xs">Sin revisar</span>

  return (
    <span
      className={cn(
        'rounded-control shrink-0 px-2 py-0.5 text-xs font-semibold',
        estado === 'ok' ? 'bg-relleno-exito text-relleno-exito-contenido' : 'bg-relleno-peligro text-relleno-peligro-contenido'
      )}
    >
      {estado === 'ok' ? 'OK' : 'No OK'}
    </span>
  )
}

/**
 * Abre el diálogo de impresión con la hoja en papel.
 *
 * El mismo camino que la impresión del Gantt (`ExportarGantt.tsx`): un iframe propio con el
 * documento entero, y no un `@media print` sobre la página, que obligaría a esconder la barra, la
 * cabecera y los botones con reglas globales. `allow-same-origin` deja llamar a `print()` desde acá
 * y `allow-modals` abrir el diálogo; sin `allow-scripts` el documento no ejecuta nada. El iframe se
 * retira cuando el diálogo se cierra.
 *
 * @param html el documento, ya escapado por `htmlDeHojaImprimible`
 */
function imprimirHoja (html: string): void {
  const marco = document.createElement('iframe')

  marco.setAttribute('sandbox', 'allow-same-origin allow-modals')
  marco.setAttribute('aria-hidden', 'true')
  marco.setAttribute('title', 'Impresión de la hoja de supervisión')
  // Fuera de la vista pero con tamaño real: un iframe de 0x0 o en `display:none` no maqueta su
  // documento y se imprime en blanco.
  marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0'
  marco.srcdoc = html

  marco.addEventListener('load', () => {
    const ventana = marco.contentWindow

    if (ventana === null) {
      marco.remove()

      return
    }

    ventana.addEventListener('afterprint', () => { marco.remove() }, { once: true })
    ventana.focus()
    ventana.print()
  })

  document.body.append(marco)
}
