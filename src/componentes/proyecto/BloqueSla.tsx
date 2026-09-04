'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { EstadoSla } from '@/componentes/presentadores/EstadoSla'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { formatearDesviacion, SIN_DATO } from '@/lib/sla'
import { GLOSARIO } from '@/dominio/glosario'
import type { AprobacionProceso, Proceso } from '@/datos/recursos'

/**
 * ETA, desviacion y aprobacion del cliente, en el detalle del Proceso.
 *
 * Los tres son un solo mecanismo: el cliente aprueba desde el portal, ahi arranca el reloj, el ETA
 * sale del tipo de Proceso configurado por Espacio, y la desviacion compara el cierre real contra la
 * fecha comprometida.
 *
 * **No pide nada por su cuenta**: los cuatro campos ya vienen dentro de la tarea que el detalle
 * cargo. Lo unico que escribe es el pedido de aprobacion, y despues le avisa al detalle que recargue
 * —el backend es quien sabe como quedo la fila—.
 *
 * El foco de la vista es la **desviacion**: es el numero que la persona vino a mirar, y gana por
 * tamano, peso y color, con la misma escala que `Contador` tres bloques mas abajo.
 */

interface PropsBloqueSla {
  tarea: Proceso
  /** `true` si quien mira tiene `edit` sobre tareas: sin eso el boton no se ofrece. */
  puedeEditar: boolean
  /** Se llama cuando se pidio la aprobacion, para que el detalle vuelva a pedir la tarea. */
  onCambiado: () => void
}

/** Como se lee cada estado de aprobacion. "Aprobada" es el unico verde del bloque, y se lo gana. */
const APROBACION: Record<string, { etiqueta: string, tono: TonoInsignia }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'acento' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' }
}

/**
 * Decide si el bloque tiene algo que decir.
 *
 * Sin `wiwo_core` instalado, el guard de tabla del backend omite las cuatro claves enteras. Ahi el
 * bloque **no se renderiza**: es la diferencia entre "no aplica" y "vacio", y ahorra tres guiones en
 * produccion.
 */
export function hayDatosDeSla (tarea: Proceso): boolean {
  return tarea.approval !== undefined || tarea.eta !== undefined || tarea.estado_sla !== undefined
}

export function BloqueSla ({ tarea, puedeEditar, onCambiado }: PropsBloqueSla): ReactElement | null {
  const [pidiendo, setPidiendo] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (!hayDatosDeSla(tarea)) return null

  const aprobacion = tarea.approval
  const desviacion = formatearDesviacion(tarea.desviacion_dias)
  const tarde = typeof tarea.desviacion_dias === 'number' && tarea.desviacion_dias > 0
  const sinDesviacion = desviacion === null

  /** Pide la aprobacion al cliente. Nunca lanza: el error del contrato se lee debajo del boton. */
  async function pedirAprobacion (): Promise<void> {
    setPidiendo(true)
    setFallo(null)

    const resultado = await escribirEnBff<AprobacionProceso>(`tasks/${tarea.id}/approval`, 'POST')

    setPidiendo(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onCambiado()
  }

  // Con el ajuste del Espacio encendido, una Tarea nace en `pendiente` pero con `solicitada_en` en
  // `null`: la requiere, y todavia nadie se la pidio al cliente. Ese es el caso principal del boton,
  // junto con el rechazo. Una ya pedida no se vuelve a pedir, y una ya aprobada queda fuera a
  // proposito: reabrirla borra `resuelta_en` del lado del backend, o sea que detiene el reloj del
  // ETA, y eso no puede pasar por un clic de mas.
  const puedePedir =
    puedeEditar &&
    aprobacion !== undefined &&
    aprobacion.requerida &&
    (aprobacion.solicitada_en === null || aprobacion.estado === 'rechazada')

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta grid grid-cols-1 gap-3 border p-3 sm:grid-cols-3">
      <Celda etiqueta="ETA">
        {tarea.eta === null || tarea.eta === undefined
          ? <span className="text-texto-sutil">{SIN_DATO}</span>
          : <Fecha valor={tarea.eta} />}
      </Celda>

      <Celda etiqueta="Desviación">
        <span
          data-numerico
          className={
            sinDesviacion
              ? 'text-texto-sutil text-lg leading-none font-semibold tabular-nums'
              : tarde
                ? 'text-texto-peligro text-lg leading-none font-semibold tabular-nums'
                : 'text-texto text-lg leading-none font-semibold tabular-nums'
          }
        >
          {desviacion ?? SIN_DATO}
        </span>
        <EstadoSla estado={tarea.estado_sla} />
      </Celda>

      <Celda etiqueta="Aprobación">
        <Aprobacion aprobacion={aprobacion} />
      </Celda>

      {puedePedir && (
        <div className="col-span-full flex flex-col items-start gap-2">
          <Boton
            variante="secundario"
            tamano="chico"
            cargando={pidiendo}
            onClick={() => { void pedirAprobacion() }}
          >
            Pedir aprobación al cliente
          </Boton>
          {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
        </div>
      )}
    </section>
  )
}

/** Una columna del bloque: rotulo en versalita arriba, valor debajo. Mismo patron que `Dato`. */
function Celda ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{etiqueta}</span>
      {children}
    </div>
  )
}

/** Estado de la aprobacion, con el comentario del cliente si lo hubo. */
function Aprobacion ({ aprobacion }: { aprobacion: AprobacionProceso | undefined }): ReactElement {
  if (aprobacion === undefined || !aprobacion.requerida) {
    return <Insignia tono="contorno" tamano="chico">No requiere</Insignia>
  }

  // `pendiente` sin `solicitada_en` no es "el cliente esta mirando esto": es "nadie se lo pidio". Las
  // dos cosas se ven igual en el `estado` y no significan lo mismo para quien tiene que actuar.
  const lectura =
    aprobacion.estado !== null && aprobacion.solicitada_en !== null
      ? APROBACION[aprobacion.estado]
      : undefined
  const instante = aprobacion.resuelta_en ?? aprobacion.solicitada_en

  return (
    <>
      {lectura === undefined
        ? <Insignia tono="contorno" tamano="chico">Sin pedir</Insignia>
        : <Insignia tono={lectura.tono} tamano="chico">{lectura.etiqueta}</Insignia>}

      {instante !== null && (
        <span className="text-texto-sutil text-xs">
          <Fecha valor={instante} conHora />
        </span>
      )}

      {aprobacion.estado === 'rechazada' && aprobacion.comentario !== null && (
        <p className="text-texto-tenue line-clamp-3 text-sm" title={aprobacion.comentario}>
          {aprobacion.comentario}
        </p>
      )}

      {aprobacion.estado === 'aprobada' && (
        <span className="text-texto-sutil text-xs">
          Desde acá corre el plazo de esta {GLOSARIO.proceso.singular.toLowerCase()}.
        </span>
      )}
    </>
  )
}
