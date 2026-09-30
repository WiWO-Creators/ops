'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { animate, stagger } from 'animejs'
import { Campo } from '@/componentes/formularios/Campo'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import type { Contrato } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { useRecurso } from './carga'

/** Lo que el alta de Proyecto manda sobre el Contrato. */
export interface VinculoDeContrato {
  /** Va dentro del scope principal del contrato (`true`) o es una cotización aparte (`false`). */
  dentro: boolean
  /** El contrato elegido, o `null` si todavía no se eligió entre varios. */
  contrato: number | null
}

interface PropsSeccionContrato {
  clienteId: number
  /** Cambia cada vez que la persona decide; `null` mientras no haya contratos vigentes que elegir. */
  onCambio: (vinculo: VinculoDeContrato | null) => void
}

const MODOS = [
  { valor: 'dentro', etiqueta: 'Dentro del scope' },
  { valor: 'aparte', etiqueta: 'Cotización aparte' }
] as const

/**
 * Pregunta del alta de Proyecto: ¿va dentro del scope principal del contrato o es una cotización
 * aparte?
 *
 * Aparece solo cuando el cliente tiene contratos vigentes y la persona ve la seccion Contratos: si la
 * lista viene vacia o el BFF la niega (404), no se pinta nada y el alta sigue como siempre. Dentro
 * del scope, el Proyecto hereda el scope del contrato y sus Tareas se analizan contra el; como
 * cotizacion aparte, ese scope no cuenta.
 *
 * Con un solo contrato vigente —el caso normal— se elige solo. Entra con una coreografia de dos
 * tiempos (pregunta y despues nota) y la nota se vuelve a revelar al cambiar de opcion; solo mueve
 * `opacity` y `translateY`, y con `prefers-reduced-motion` no anima.
 *
 * @param clienteId cliente del Proyecto que se esta creando
 * @param onCambio recibe la decision o `null` si no aplica
 * @returns la seccion, o `null` si no hay nada que preguntar
 */
export function SeccionContratoDelProyecto ({ clienteId, onCambio }: PropsSeccionContrato): ReactElement | null {
  const { estado } = useRecurso<Contrato[]>(
    `contratos?filter[client]=${clienteId}&filter[vigencia]=vigentes&per_page=50`,
    'No se pudieron cargar los contratos.'
  )
  const [modo, setModo] = useState<'dentro' | 'aparte'>('dentro')
  const [elegido, setElegido] = useState('')
  const raiz = useRef<HTMLDivElement | null>(null)

  const contratos = estado.fase === 'listo' ? estado.datos : []
  const unico = contratos.length === 1 ? contratos[0] : undefined
  const contrato = elegido !== '' ? elegido : unico === undefined ? '' : String(unico.id)
  const hayQueElegir = estado.fase === 'listo' && contratos.length > 0

  useEffect(() => {
    onCambio(hayQueElegir ? { dentro: modo === 'dentro', contrato: contrato === '' ? null : Number(contrato) } : null)
  }, [hayQueElegir, modo, contrato, onCambio])

  // Entrada: pregunta y nota en dos tiempos, una sola vez al aparecer la seccion.
  useLayoutEffect(() => {
    const contenedor = raiz.current

    if (!hayQueElegir || contenedor === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const animacion = animate(contenedor.querySelectorAll('[data-contrato="paso"]'), {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 320,
      ease: 'outQuad',
      delay: stagger(90)
    })

    return () => { animacion.cancel() }
  }, [hayQueElegir])

  // La nota cambia con la opcion: se vuelve a revelar para que el cambio se lea como consecuencia.
  useLayoutEffect(() => {
    const nota = raiz.current?.querySelector('[data-contrato="nota"]')

    if (!hayQueElegir || nota == null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const animacion = animate(nota, { opacity: [0, 1], translateY: [4, 0], duration: 220, ease: 'outQuad' })

    return () => { animacion.cancel() }
  }, [hayQueElegir, modo])

  if (!hayQueElegir) return null

  const pregunta = `¿Este ${GLOSARIO.espacio.singular.toLowerCase()} va dentro del ${GLOSARIO.scope.singular.toLowerCase()} del contrato?`

  return (
    <div ref={raiz} className="border-linea rounded-tarjeta flex flex-col gap-3 border p-3">
      <div data-contrato="paso" className="flex flex-col gap-2">
        <p className="text-texto text-sm font-medium">{pregunta}</p>
        <Segmentado
          etiqueta={pregunta}
          opciones={MODOS}
          activo={modo}
          onElegir={(valor) => { setModo(valor === 'aparte' ? 'aparte' : 'dentro') }}
          className="w-fit"
        />
        <p data-contrato="nota" aria-live="polite" className="text-texto-tenue text-xs">
          {modo === 'dentro'
            ? `Hereda el ${GLOSARIO.scope.singular.toLowerCase()} principal: sus tareas se revisan contra él.`
            : `No cuenta contra el ${GLOSARIO.scope.singular.toLowerCase()} principal: se cotiza por separado.`}
        </p>
      </div>

      <div data-contrato="paso">
        <Campo etiqueta={GLOSARIO.contrato.singular} requerido={modo === 'dentro'}>
          {(props) => (
            <Selector value={contrato} onValueChange={setElegido}>
              <DisparadorSelector id={props.id} marcador={`Elige un ${GLOSARIO.contrato.singular.toLowerCase()}`} />
              <ContenidoSelector>
                {contratos.map((opcion) => (
                  <Opcion key={opcion.id} value={String(opcion.id)}>
                    {opcion.subject === '' ? `Contrato #${opcion.id}` : opcion.subject}
                    {opcion.dateend !== null && ` · hasta ${formatearFecha(opcion.dateend)}`}
                  </Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>
      </div>
    </div>
  )
}
