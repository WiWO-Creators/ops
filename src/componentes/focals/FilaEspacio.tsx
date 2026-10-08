'use client'

import { useState } from 'react'
import { ChevronRight, Sparkles } from 'lucide-react'
import { CLASES_DE_ENLACE_DE_FICHA, EnlaceDeFicha } from './EnlaceDeFicha'
import { FOCO_INTERIOR } from './clases-de-foco'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { EnlaceProyecto } from '@/componentes/presentadores/EnlaceProyecto'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { DesgloseSenales, NumeroDeScore, TRAMOS } from '@/componentes/clientes/SemaforoCliente'
import { nombreDe, pedirEstado, type EstadoDeSalud, type ScoreEspacio } from '@/datos/focals'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'

/** Por qué falló el último intento de redactar, y si es un desenlace normal del sistema o un fallo. */
interface ErrorDeEstado {
  mensaje: string
  esperado: boolean
}

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
 * La fila entera abre y cierra, igual que la de la cuenta: un solo gesto en los dos niveles. El enlace
 * al Proyecto vive dentro del detalle, donde es un destino elegido y no un accidente del clic.
 *
 * @param espacio el Proyecto con su score
 * @param estado el estado a mostrar: el redactado en esta sesión o el que trajo el servidor
 * @param onEstado recibe el estado recién redactado, para que el panel lo conserve
 * @param coincide `true` si este Proyecto es el que hizo aparecer a su cuenta en la búsqueda
 */
export function FilaEspacio (
  { espacio, estado, onEstado, coincide }: PropsDeEspacio
) {
  const [abierto, setAbierto] = useState(false)

  return (
    <article
      className={cn('rounded-medio overflow-hidden border', coincide ? 'border-acento' : 'border-linea')}
    >
      <button
        type="button"
        onClick={() => { setAbierto(!abierto) }}
        aria-expanded={abierto}
        className={cn(
          'hover:bg-hover ease-neo duration-rapida flex w-full items-center gap-2 px-3 py-2 text-start',
          'transition-colors pointer-coarse:min-h-11',
          FOCO_INTERIOR
        )}
      >
        <CabeceraDeEspacio espacio={espacio} coincide={coincide} />
        <ChevronRight
          size={16}
          aria-hidden="true"
          className={cn(
            'text-texto-sutil ease-neo duration-rapida ms-auto shrink-0 transition-transform',
            abierto && 'rotate-90'
          )}
        />
      </button>

      {abierto && (
        <div className="border-linea border-t px-3 py-3">
          <DetalleEspacio espacio={espacio} estado={estado} onEstado={onEstado} />
        </div>
      )}
    </article>
  )
}

/**
 * El único Proyecto de una cuenta cuyo desglose es el mismo que el de la cuenta.
 *
 * Sin acordeón: el desglose ya está arriba, así que acá solo queda lo que es propio del Proyecto —su
 * puntaje, su ficha y el estado en palabras—, a la vista y sin un clic de por medio.
 *
 * @param espacio el Proyecto
 * @param estado el estado a mostrar: el redactado en esta sesión o el que trajo el servidor
 * @param onEstado recibe el estado recién redactado, para que el panel lo conserve
 * @param coincide `true` si este Proyecto es el que hizo aparecer a su cuenta en la búsqueda
 */
export function ProyectoUnico (
  { espacio, estado, onEstado, coincide }: PropsDeEspacio
) {
  return (
    <article
      className={cn(
        'rounded-medio flex flex-col gap-3 border px-3 py-3',
        coincide ? 'border-acento' : 'border-linea'
      )}
    >
      <div className="flex items-center gap-2">
        <CabeceraDeEspacio espacio={espacio} coincide={coincide} />
      </div>
      <DetalleEspacio espacio={espacio} estado={estado} onEstado={onEstado} conDesglose={false} />
    </article>
  )
}

interface PropsDeEspacio {
  espacio: ScoreEspacio
  estado: EstadoDeSalud | null
  onEstado: (proyecto: number, estado: EstadoDeSalud) => void
  coincide: boolean
}

/** El número, el nombre y las insignias de un Proyecto: lo que ven la fila y el Proyecto único. */
function CabeceraDeEspacio ({ espacio, coincide }: { espacio: ScoreEspacio, coincide: boolean }) {
  const tramo = TRAMOS[espacio.semaforo] ?? TRAMOS.sin_datos

  return (
    <>
      <NumeroDeScore
        score={espacio.score}
        semaforo={espacio.semaforo}
        className="w-8 shrink-0 text-end text-base"
      />
      <span className="text-texto min-w-0 truncate text-sm">{nombreDe(espacio)}</span>
      <Insignia tono={tramo.tono} tamano="chico" className="shrink-0">{tramo.etiqueta}</Insignia>
      {coincide && <Insignia tono="acento" tamano="chico" className="shrink-0">Coincide</Insignia>}
    </>
  )
}

/**
 * Lo que hay dentro de un Proyecto: su ficha, su desglose y el estado en palabras.
 *
 * @param espacio el Proyecto
 * @param estado el estado a mostrar
 * @param onEstado recibe el estado recién redactado
 * @param conDesglose `false` cuando el desglose idéntico ya se mostró arriba, en la cuenta
 */
function DetalleEspacio (
  { espacio, estado, onEstado, conDesglose = true }: Omit<PropsDeEspacio, 'coincide'> & { conDesglose?: boolean }
) {
  const [redactando, setRedactando] = useState(false)
  const [error, setError] = useState<ErrorDeEstado | null>(null)

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
    else setError({ mensaje: resultado.error, esperado: resultado.esperado })
  }

  return (
    <div className="flex flex-col gap-3">
      <EnlaceDeFicha etiqueta={`Ficha del ${GLOSARIO.espacio.singular}`}>
        <EnlaceProyecto
          id={espacio.project_id}
          nombre={nombreDe(espacio)}
          className={CLASES_DE_ENLACE_DE_FICHA}
        />
      </EnlaceDeFicha>

      {conDesglose && <DesgloseSenales senales={espacio.senales} conNota={false} />}

      <EstadoEnPalabras
        estado={estado}
        error={error}
        redactando={redactando}
        onRedactar={() => { void redactar() }}
      />
    </div>
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
    error: ErrorDeEstado | null
    redactando: boolean
    onRedactar: () => void
  }
) {
  const fecha = estado === null ? '' : formatearFecha(estado.generado_en, true)

  return (
    <section className="flex flex-col gap-2">
      {estado !== null && (
        <>
          <p className="text-texto text-sm text-pretty">{estado.texto}</p>
          <p className="text-texto-tenue text-xs">
            {estado.vigente
              ? `Redactado por ${ASISTENTE} el ${fecha}.`
              : `Redactado por ${ASISTENTE} el ${fecha}, con números que desde entonces cambiaron.`}
          </p>
        </>
      )}

      {error !== null && <AvisoDeEstado error={error} />}

      {(estado === null || !estado.vigente) && (
        <div>
          <Boton
            tamano="chico"
            variante="secundario"
            className="pointer-coarse:h-11"
            onClick={onRedactar}
            cargando={redactando}
          >
            <Sparkles size={14} aria-hidden="true" />
            {estado === null ? `Explicar con ${ASISTENTE}` : 'Rehacer la explicación'}
          </Boton>
        </div>
      )}
    </section>
  )
}

/**
 * Por qué no hay explicación, dicho con el tono que le toca.
 *
 * Un desenlace esperado —la IA apagada, la foto del día que aún no existe— es el sistema
 * funcionando como se diseñó y se dice en gris, como una nota. Un fallo real (red, tiempo, respuesta
 * ilegible) es un error y se pinta como tal: con la misma leyenda tenue para los dos, el segundo
 * pasaba por una indicación más.
 */
function AvisoDeEstado ({ error }: { error: ErrorDeEstado }) {
  if (error.esperado) return <p role="status" className="text-texto-tenue text-xs">{error.mensaje}</p>

  return <AvisoEnLinea variante="error" mensaje={error.mensaje} />
}
