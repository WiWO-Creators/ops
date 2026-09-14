import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  alertasDeLicitaciones,
  contarAlertas,
  etiquetaDeMotivo,
  textoDeAlerta,
  type LicitacionParaAlerta,
  type VencimientoParaAlerta
} from '@/dominio/alertas-licitacion'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'

/**
 * La banda de alertas de plazo, arriba del listado de Licitaciones.
 *
 * === POR QUE ARRIBA Y SIEMPRE VISIBLE ===
 *
 * Porque el pedido era que las alertas se vean sin buscarlas: una Licitacion se pierde el dia que
 * cierra, y hasta ahora el vencimiento solo se veia entrando a cada ficha. El resumen —cuantas
 * vencidas, cuantas hoy, cuantas por vencer— va siempre desplegado; el detalle vive en un `<details>`
 * nativo, sin estado ni JavaScript, porque la lista puede tener decenas de lineas y no puede empujar
 * la tabla fuera de la pantalla.
 *
 * Se abre sola cuando hay algo vencido o que vence hoy. Es el unico caso en que el detalle vale el
 * espacio que ocupa: lo que vence dentro de dos semanas se lee cuando alguien lo decide.
 *
 * === POR QUE NO DIBUJA NADA CUANDO NO HAY NADA ===
 *
 * Una banda vacia que dice "sin alertas" es una linea de ruido permanente encima de la tabla, y
 * ademas entrena a no mirarla. Sin alertas devuelve `null` y la pantalla queda como estaba.
 *
 * === SERVIDOR, NO CLIENTE ===
 *
 * No tiene estado ni eventos: los datos los resuelve la pagina y el desplegable es HTML. No hay
 * motivo para mandar este arbol al navegador, y el listado ya paga su propio `'use client'`.
 */
interface PropsAlertasLicitaciones {
  /** Las Licitaciones abiertas, tal como las devolvio `GET /licitaciones?filter[estado]=abierta`. */
  licitaciones: LicitacionParaAlerta[]
  /** Las Tareas propias por vencer (`GET /me/vencimientos`). Vacio si esa lectura fallo. */
  vencimientos: VencimientoParaAlerta[]
  /**
   * Por que falta alguna de las dos lecturas.
   *
   * Se avisa en una linea y la tabla sigue: que el endpoint de vencimientos conteste `503` —pasa en
   * una instalacion sin `wiwo_core`— no puede dejar la pantalla de Licitaciones sin listado.
   */
  error?: string | null
}

export function AlertasLicitaciones ({
  licitaciones,
  vencimientos,
  error = null
}: PropsAlertasLicitaciones) {
  const alertas = alertasDeLicitaciones(licitaciones, vencimientos)

  if (alertas.length === 0) {
    if (error === null) return null

    return (
      <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
        No se pudieron cargar las alertas de plazo: {error}
      </p>
    )
  }

  const { vencidas, hoy, proximas } = contarAlertas(alertas)
  const urgente = vencidas > 0
  const nombre = GLOSARIO.licitacion.plural.toLowerCase()

  return (
    <details
      open={urgente || hoy > 0}
      className={cn(
        'rounded-tarjeta border-linea-fuerte border-l-4 p-3',
        urgente ? 'bg-superficie-peligro' : 'bg-superficie-aviso'
      )}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
        <AlertTriangle
          size={16}
          aria-hidden="true"
          className={cn('shrink-0', urgente ? 'text-texto-peligro' : 'text-texto-aviso')}
        />
        <span className={cn('font-semibold', urgente ? 'text-texto-peligro' : 'text-texto-aviso')}>
          Plazos de {nombre}
        </span>
        {vencidas > 0 && (
          <Insignia tono="peligro" tamano="chico">
            {vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}
          </Insignia>
        )}
        {hoy > 0 && (
          <Insignia tono="aviso" tamano="chico">
            {hoy} {hoy === 1 ? 'vence' : 'vencen'} hoy
          </Insignia>
        )}
        {proximas > 0 && (
          <Insignia tono="contorno" tamano="chico">{proximas} por vencer</Insignia>
        )}
      </summary>

      {error !== null && (
        <p role="alert" className="text-texto-tenue mt-2 text-xs">
          La lista puede estar incompleta: {error}
        </p>
      )}

      <ul data-lenis-prevent className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {alertas.map((alerta) => (
          <li key={alerta.clave} className="flex flex-wrap items-center gap-2 text-xs">
            <Insignia
              tono={alerta.tramo === 'vencido' ? 'peligro' : alerta.tramo === 'hoy' ? 'aviso' : 'contorno'}
              tamano="chico"
            >
              {textoDeAlerta(alerta)}
            </Insignia>
            <Link
              href={`/licitaciones/${alerta.licitacionId}`}
              className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
            >
              {alerta.empresa}
            </Link>
            <span className="text-texto-tenue">
              {etiquetaDeMotivo(alerta.motivo)}: {alerta.detalle}
            </span>
            <span className="text-texto-sutil">{formatearFecha(alerta.fecha)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
