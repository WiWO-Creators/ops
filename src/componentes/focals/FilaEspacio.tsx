'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Sparkles } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { DesgloseSenales, NumeroDeScore, TRAMOS } from '@/componentes/clientes/SemaforoCliente'
import { nombreDe, pedirEstado, type EstadoDeSalud, type ScoreEspacio } from '@/datos/focals'
import { ASISTENTE } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/** Los párrafos redactados en esta sesión, por Proyecto: viven en el panel y no en cada fila. */
export type EstadosRedactados = Record<number, EstadoDeSalud>

/**
 * Un Proyecto con su semáforo, su desglose y su estado en palabras.
 *
 * El estado que ya viene del servidor se muestra de entrada: está pagado y guardado. El botón
 * aparece cuando no hay ninguno, o cuando el que hay dejó de ser vigente porque las señales se
 * movieron después de redactarlo.
 *
 * El estado redactado no se guarda acá sino que se entrega a `onEstado`: el detalle se desmonta al
 * cerrar la cuenta o al filtrar, y un `useState` propio perdería el párrafo que ya se pagó.
 *
 * @param espacio el Proyecto con su score
 * @param estado el estado a mostrar: el redactado en esta sesión o el que trajo el servidor
 * @param onEstado recibe el estado recién redactado, para que el panel lo conserve
 */
export function FilaEspacio (
  { espacio, estado, onEstado }: {
    espacio: ScoreEspacio
    estado: EstadoDeSalud | null
    onEstado: (proyecto: number, estado: EstadoDeSalud) => void
  }
) {
  const [abierto, setAbierto] = useState(false)
  const [redactando, setRedactando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tramo = TRAMOS[espacio.semaforo] ?? TRAMOS.sin_datos

  /** Pide el párrafo. Con las mismas señales el servidor devuelve el que ya estaba, sin cobrar. */
  async function redactar (): Promise<void> {
    if (redactando) return

    setRedactando(true)
    setError(null)

    const resultado = await pedirEstado(espacio.project_id)
    setRedactando(false)

    // Un fallo NO borra el párrafo que ya estaba: si había uno viejo, sigue explicando de dónde
    // venía el puntaje, y dejar la tarjeta vacía por un error de red sería perder información.
    if (resultado.ok) onEstado(espacio.project_id, resultado.estado)
    else setError(resultado.error)
  }

  return (
    <article className="border-linea rounded-control border">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <NumeroDeScore
            score={espacio.score}
            semaforo={espacio.semaforo}
            className="w-8 shrink-0 text-end text-base"
          />
          <Link
            href={`/proyectos/${espacio.project_id}`}
            className="text-texto hover:text-acento max-w-64 truncate text-sm underline-offset-4 hover:underline"
          >
            {nombreDe(espacio)}
          </Link>
          <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
        </div>

        <BotonDetalle
          abierto={abierto}
          onAlternar={() => { setAbierto(!abierto) }}
          etiqueta={`Detalle de ${nombreDe(espacio)}`}
        />
      </header>

      {abierto && (
        <div className="border-linea flex flex-col gap-3 border-t px-3 py-3">
          <DesgloseSenales senales={espacio.senales} />

          <EstadoEnPalabras
            estado={estado}
            error={error}
            redactando={redactando}
            onRedactar={() => { void redactar() }}
          />
        </div>
      )}
    </article>
  )
}

/**
 * El estado redactado, o el botón para pedirlo.
 *
 * Cuando el texto no es vigente se muestra igual, con la advertencia al lado: sigue explicando de
 * dónde venía el puntaje, y esconderlo dejaría la tarjeta sin nada mientras alguien decide si vale
 * la pena volver a pagarlo.
 */
function EstadoEnPalabras (
  { estado, error, redactando, onRedactar }: {
    estado: EstadoDeSalud | null
    error: string | null
    redactando: boolean
    onRedactar: () => void
  }
) {
  return (
    <section className="flex flex-col gap-2">
      {estado !== null && (
        <>
          <p className="text-texto text-sm text-pretty">{estado.texto}</p>
          <p className="text-texto-tenue text-xs">
            {estado.vigente
              ? `Redactado por ${ASISTENTE} el ${estado.generado_en}.`
              : `Redactado por ${ASISTENTE} el ${estado.generado_en}, con números que desde entonces cambiaron.`}
          </p>
        </>
      )}

      {error !== null && <p role="alert" className="text-texto-tenue text-xs">{error}</p>}

      {(estado === null || !estado.vigente) && (
        <div>
          <Boton tamano="chico" variante="secundario" onClick={onRedactar} cargando={redactando}>
            <Sparkles size={14} aria-hidden="true" />
            {estado === null ? `Explicar con ${ASISTENTE}` : 'Rehacer la explicación'}
          </Boton>
        </div>
      )}
    </section>
  )
}

/** La flecha que abre y cierra un bloque. Un `button` de verdad, para que el teclado lo alcance. */
function BotonDetalle (
  { abierto, onAlternar, etiqueta }: { abierto: boolean, onAlternar: () => void, etiqueta: string }
) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={abierto}
      aria-label={etiqueta}
      className={cn(
        'text-texto-tenue hover:text-texto hover:bg-hover rounded-control flex h-8 w-8 shrink-0',
        'items-center justify-center',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
      )}
    >
      <ChevronRight
        size={16}
        aria-hidden="true"
        className={cn('ease-neo duration-rapida transition-transform', abierto && 'rotate-90')}
      />
    </button>
  )
}
