'use client'

import { useEffect, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { pedirSobre } from '@/datos/cliente'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import type { AlcanceDePersona } from '@/datos/accesos'

interface PropsSeccionAlcance {
  staffid: number
  /** Cambia después de cada guardado: el alcance se vuelve a pedir, porque lo que cambió lo mueve. */
  version: number
}

/** Por qué una persona ve todo, en palabras. */
const MOTIVOS_DE_VER_TODO: Record<NonNullable<AlcanceDePersona['motivo_ve_todo']>, string> = {
  superadmin: 'Es superadministradora: ve y edita todas las filas, y abre la configuración.',
  admin: 'Es administradora: ve y edita todas las filas.',
  coordinador_multiarea: 'Coordina varias áreas: lee todas las filas, pero solo edita lo suyo y lo de su gente.'
}

/**
 * "¿Por qué ve esto?": de dónde sale el alcance de una persona.
 *
 * Contesta la pregunta que antes solo se contestaba abriendo la base. **El cálculo es de la API**
 * (`GET /accesos/personas/{id}/alcance`), con las mismas piezas que recortan los listados de verdad;
 * acá solo se pinta. Una segunda copia de la regla en el navegador podría decir otra cosa que la que
 * manda.
 */
export function SeccionAlcance ({ staffid, version }: PropsSeccionAlcance) {
  const [alcance, setAlcance] = useState<AlcanceDePersona | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pedido, setPedido] = useState({ staffid, version })

  // Se limpia DURANTE el render y no en el efecto: así no se pinta un instante el alcance de antes.
  if (pedido.staffid !== staffid || pedido.version !== version) {
    setPedido({ staffid, version })
    setAlcance(null)
    setError(null)
  }

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<AlcanceDePersona>(`accesos/personas/${staffid}/alcance`, control.signal)
      .then((sobre) => { setAlcance(sobre.data) })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return
        setError(problema instanceof Error ? problema.message : 'No se pudo calcular el alcance.')
      })

    return () => { control.abort() }
  }, [staffid, version])

  if (error !== null) return <ErrorEstado detalle={error} />
  if (alcance === null) return <Cargando alto="min-h-24" mensaje="Calculando el alcance…" />

  return <ExplicacionDelAlcance alcance={alcance} />
}

/** El alcance ya calculado, en cuatro renglones: rol, jefes, áreas que dirige y gente alcanzada. */
function ExplicacionDelAlcance ({ alcance }: { alcance: AlcanceDePersona }) {
  const porCadena = alcance.alcanzados.filter((uno) => uno.via === 'cadena').length
  const porArea = alcance.total_alcanzados - porCadena

  return (
    <div className="flex flex-col gap-3 text-sm">
      {alcance.motivo_ve_todo !== null && (
        <p className="bg-acento-suave text-texto rounded-tarjeta px-3 py-2">{MOTIVOS_DE_VER_TODO[alcance.motivo_ve_todo]}</p>
      )}

      {!alcance.jerarquia_activa && (
        <p className="bg-superficie-aviso text-texto-aviso rounded-tarjeta px-3 py-2">
          La jerarquía está apagada: nadie alcanza a nadie por el árbol, y cada persona ve solo lo suyo.
        </p>
      )}

      <Renglon titulo="Reporta a">
        {alcance.jefes.length === 0
          ? <span className="text-texto-tenue">Nadie: no cuelga de ninguna persona ni de un área con jefatura.</span>
          : (
            <ol className="flex flex-wrap items-center gap-1">
              {alcance.jefes.map((jefe, indice) => (
                <li key={jefe.staffid} className="flex items-center gap-1">
                  {indice > 0 && <ChevronRight aria-hidden="true" className="text-texto-sutil size-3.5" />}
                  <span className="text-texto">{jefe.nombre}</span>
                  <Insignia tono="contorno" tamano="chico">{etiquetaDeEscalon(jefe.escalon)}</Insignia>
                </li>
              ))}
            </ol>
            )}
      </Renglon>

      <Renglon titulo="Dirige">
        {alcance.areas_que_dirige.length === 0
          ? <span className="text-texto-tenue">Ningún área.</span>
          : (
            <ul className="flex flex-col gap-0.5">
              {alcance.areas_que_dirige.map((area) => (
                <li key={area.id} className="text-texto">
                  {area.nombre}
                  {area.subareas.length > 0 && (
                    <span className="text-texto-tenue"> y lo que cuelga: {area.subareas.map((sub) => sub.nombre).join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
            )}
      </Renglon>

      <Renglon titulo="Alcanza a">
        {alcance.total_alcanzados === 0
          ? <span className="text-texto-tenue">Nadie más: ve solo lo suyo{alcance.ve_todo ? ' por el árbol (su rol ya le abre todo)' : ''}.</span>
          : (
            <details className="group">
              <summary className="text-texto cursor-pointer">
                {alcance.total_alcanzados} {alcance.total_alcanzados === 1 ? 'persona' : 'personas'}
                <span className="text-texto-tenue"> · {porCadena} por su cadena de jefe, {porArea} por las áreas que dirige</span>
              </summary>
              <ul className="mt-2 flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {alcance.alcanzados.map((uno) => (
                  <li key={uno.staffid} className="text-texto flex items-center justify-between gap-2">
                    <span className="truncate">{uno.nombre}</span>
                    <span className="text-texto-sutil text-xs">{uno.via === 'cadena' ? 'cadena' : 'área'}</span>
                  </li>
                ))}
              </ul>
            </details>
            )}
      </Renglon>
    </div>
  )
}

/** Un renglón con su rótulo a la izquierda. */
function Renglon ({ titulo, children }: { titulo: string, children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-baseline gap-3">
      <span className="text-texto-sutil text-xs font-medium uppercase tracking-wide">{titulo}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
