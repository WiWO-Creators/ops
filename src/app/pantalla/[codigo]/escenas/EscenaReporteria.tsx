import type { ReactNode } from 'react'
import { cierreDeMes, cuentaRegresiva } from '@/dominio/reporteria'

/** Los pasos que cada persona deja listos antes del cierre. */
const PASOS = [
  { titulo: 'Revisa tus campañas', detalle: 'Que estén al día y con los datos completos antes de reportar.' },
  { titulo: 'Limpieza de PR', detalle: 'Depura menciones y medios antes de generar las grillas.' },
  { titulo: 'Limpieza de Influencers', detalle: 'Revisa el listado y las campañas activas.' },
  { titulo: 'Genera reportes de prueba', detalle: 'Corre una prueba antes del informe final para detectar faltantes.' },
  { titulo: 'Levanta tus solicitudes', detalle: 'Todo lo que necesites pedir va por wiwo.center.' }
] as const

/**
 * El aviso rojo de que comenzo la reporteria, con la cuenta regresiva al cierre del mes.
 *
 * Ocupa la pantalla entera —tapa cabecera y pie— porque es una alerta y tiene que verse desde la otra
 * punta del piso. El fondo "arde" (`pantalla-quema-*` en `pantalla.css`). No lleva datos de la API:
 * el cierre sale del reloj del negocio, igual que `momento`.
 *
 * @param ahora instante corregido con el reloj del servidor, o `null` antes del primer tic
 * @param zona  zona IANA del negocio
 */
export function EscenaReporteria ({ ahora, zona }: { ahora: number | null, zona: string | null }): ReactNode {
  const cierre = ahora === null ? null : cierreDeMes(ahora, zona)
  const cuenta = ahora === null || cierre === null ? '--:--:--:--' : cuentaRegresiva(cierre.finMs - ahora)

  return (
    <div className="pantalla-quema fixed inset-[-1vmin] z-40 flex flex-col items-center justify-center gap-[2.4vmin] overflow-hidden px-[6vmin] text-white">
      <div className="pantalla-quema-llama" aria-hidden="true" />

      <p className="relative text-[4.6vmin] font-extrabold tracking-tight">wiwo.MetriQ</p>

      <svg className="pantalla-quema-icono relative size-[11vmin]" viewBox="0 0 100 100" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="50" cy="50" r="7" />
          <path d="M50 42 L28 6 A48 48 0 0 1 72 6 Z" transform="rotate(0 50 50) translate(0 2)" />
          <path d="M50 42 L28 6 A48 48 0 0 1 72 6 Z" transform="rotate(120 50 50) translate(0 2)" />
          <path d="M50 42 L28 6 A48 48 0 0 1 72 6 Z" transform="rotate(240 50 50) translate(0 2)" />
        </g>
      </svg>

      <h2 className="relative text-center text-[6.4vmin] leading-tight font-extrabold">Comenzó el período de reportes</h2>
      <p className="relative text-[3vmin] text-white/80">Antes de cerrar el mes, deja lista tu parte:</p>

      <div className="relative flex flex-col items-center gap-[1vmin]">
        <p className="text-[2.4vmin] font-bold tracking-[0.3em] text-white/80 uppercase">Cuenta regresiva reportería</p>
        <p className="rounded-[2vmin] border border-white/30 bg-white/15 px-[5vmin] py-[1.2vmin] text-[9vmin] leading-none font-extrabold tabular-nums">
          {cuenta}
        </p>
        <p className="text-[2.2vmin] font-semibold tracking-[0.25em] text-white/60 uppercase">
          {cierre === null ? '' : `Cierre: ${cierre.dia} de ${cierre.mes}`}
        </p>
      </div>

      <ol className="relative grid gap-[1.6vmin] landscape:grid-cols-2 landscape:gap-x-[6vmin]">
        {PASOS.map((paso, i) => (
          <li key={paso.titulo} className="flex items-start gap-[1.6vmin]">
            <span className="flex size-[4.2vmin] shrink-0 items-center justify-center rounded-full bg-white/25 text-[2.2vmin] font-bold">
              {i + 1}
            </span>
            <span>
              <span className="block text-[2.8vmin] leading-tight font-bold">{paso.titulo}</span>
              <span className="block text-[2vmin] leading-snug text-white/75">{paso.detalle}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
