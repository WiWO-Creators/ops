'use client'

import { useState } from 'react'
import { Maximize2, RotateCcw, ScrollText } from 'lucide-react'
import { CapaDeBienvenida } from '@/componentes/estructura/bienvenida/CapaDeBienvenida'
import { ESCENAS, type EscenaDeBienvenida } from '@/componentes/estructura/bienvenida/escenas'
import { RecorridoDeNovedades } from '@/componentes/estructura/bienvenida/RecorridoDeNovedades'
import { Boton } from '@/componentes/formularios/Boton'
import type { Novedad } from '@/dominio/novedades'

/** Lo que esta ocupando la pantalla completa, si algo. */
type PantallaCompleta = { tipo: 'capa', escena: EscenaDeBienvenida } | { tipo: 'recorrido' } | null

const CLASE_TARJETA = 'border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-4 border p-4'
const CLASE_VISTA = 'border-linea-suave bg-superficie relative grid aspect-video place-items-center overflow-hidden rounded-xl border p-3'

/**
 * La galeria de las animaciones de actualizacion, para mirarlas sin esperar un despliegue.
 *
 * Cada coreografia se reproduce en su tarjeta al entrar y se repite con un boton: repetir es volver
 * a montarla —cambia la `key`—, que es exactamente lo que pasa despues de una recarga real. La
 * pantalla completa monta la misma capa que ve el equipo, con su salida en iris y su boton hacia el
 * recorrido, sin el telon ni la marca de `sessionStorage`: nada de lo que se haga aca afecta a la
 * bienvenida de verdad.
 *
 * @param novedades las que cuenta el recorrido, las mismas que recibe el vigilante de version
 */
export function LaboratorioDeAnimaciones ({ novedades }: { novedades: readonly Novedad[] }) {
  const [vueltas, setVueltas] = useState<Record<string, number>>({})
  const [pantalla, setPantalla] = useState<PantallaCompleta>(null)

  /** Vuelve a montar la escena de una tarjeta, que es lo que la hace arrancar de cero. */
  function repetir (clave: string): void {
    setVueltas((previas) => ({ ...previas, [clave]: (previas[clave] ?? 0) + 1 }))
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ESCENAS.map((escena) => (
          <article key={escena.clave} className={CLASE_TARJETA}>
            <div className={CLASE_VISTA}>
              <escena.Dibujo key={vueltas[escena.clave] ?? 0} />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-texto text-sm font-semibold">{escena.nombre}</h2>
                <span className="text-texto-sutil text-xs tabular-nums">{formatearSegundos(escena.duracion)}</span>
              </div>
              <p className="text-texto-tenue mt-1 text-sm">{escena.frase}</p>
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <Boton variante="secundario" tamano="chico" onClick={() => { repetir(escena.clave) }}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Repetir
              </Boton>
              <Boton variante="sutil" tamano="chico" onClick={() => { setPantalla({ tipo: 'capa', escena }) }}>
                <Maximize2 className="size-3.5" aria-hidden="true" />
                Pantalla completa
              </Boton>
            </div>
          </article>
        ))}

        <article className={CLASE_TARJETA}>
          <div className={CLASE_VISTA}>
            <ScrollText className="text-acento size-10" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-texto text-sm font-semibold">Recorrido de novedades</h2>
              <span className="text-texto-sutil text-xs tabular-nums">
                {novedades.length === 1 ? '1 novedad' : `${novedades.length} novedades`}
              </span>
            </div>
            <p className="text-texto-tenue mt-1 text-sm">
              Se maneja con el scroll: cada novedad reordena las piezas del fondo. Se abre desde «Ver qué cambió».
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Boton variante="secundario" tamano="chico" onClick={() => { setPantalla({ tipo: 'recorrido' }) }}>
              <Maximize2 className="size-3.5" aria-hidden="true" />
              Abrir recorrido
            </Boton>
          </div>
        </article>
      </div>

      {pantalla?.tipo === 'capa' && (
        <CapaDeBienvenida
          key={pantalla.escena.clave}
          escena={pantalla.escena}
          onTerminar={() => { setPantalla(null) }}
          onVerNovedades={novedades.length > 0 ? () => { setPantalla({ tipo: 'recorrido' }) } : undefined}
        />
      )}

      {pantalla?.tipo === 'recorrido' && (
        <RecorridoDeNovedades novedades={novedades} onCerrar={() => { setPantalla(null) }} />
      )}
    </>
  )
}

/**
 * Escribe una duracion en segundos con una cifra decimal y coma: `3200` es `3,2 s`.
 *
 * @param milisegundos la duracion
 * @returns el texto a mostrar
 */
function formatearSegundos (milisegundos: number): string {
  return `${(milisegundos / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} s`
}
