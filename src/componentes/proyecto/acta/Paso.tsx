import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/clases'
import type { ReactElement, ReactNode } from 'react'

/**
 * Un paso del asistente de Meeting Paper.
 *
 * Existe porque la pantalla tenía todo a la vista y en el mismo peso —cinco modos de entrada, seis
 * campos y el bloque de generación—, así que no contestaba "¿qué hago primero?". Numerar los pasos lo
 * contesta sin texto de ayuda: el número es la jerarquía.
 *
 * `plegable` convierte el encabezado en un botón. Se usa en el paso que es OPCIONAL: plegado muestra
 * un resumen de lo que ya trae —el asistente rellena cliente, fecha y asistentes desde el Proyecto—,
 * así que quien no necesita tocarlo ve una línea en vez de seis campos, y quien sí lo abre de un clic.
 *
 * El encabezado es un `h3` aunque adentro lleve un botón: es contenido de frase, válido ahí, y así el
 * paso sigue apareciendo en el esquema de encabezados de la pantalla.
 */
interface PropsPaso {
  /** Número que se dibuja en el chip. Es el orden de lectura, no un identificador. */
  numero: number
  titulo: string
  /** Chip a la derecha del título, p. ej. "Opcional". */
  insignia?: ReactNode
  /** Línea bajo el título. Solo se dibuja cuando el paso está plegado. */
  resumen?: string
  /**
   * Cuando viene, el encabezado pliega y despliega el contenido.
   *
   * `idPanel` cablea `aria-controls`: sin él, un lector de pantalla anuncia el botón como expandido
   * pero no sabe decir qué expandió.
   */
  plegable?: { abierto: boolean, idPanel: string, onAlternar: () => void }
  children: ReactNode
  className?: string
}

export function Paso ({ numero, titulo, insignia, resumen, plegable, children, className }: PropsPaso): ReactElement {
  const cabecera = (
    <>
      <span
        aria-hidden="true"
        className="bg-relleno-neutro text-relleno-neutro-contenido grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold"
      >
        {numero}
      </span>

      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-texto text-sm font-semibold">{titulo}</span>
          {insignia}
        </span>
        {plegable !== undefined && !plegable.abierto && resumen !== undefined && (
          <span className="text-texto-tenue text-xs font-normal">{resumen}</span>
        )}
      </span>
    </>
  )

  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {/* El `-m-1.5` del encabezado con el `p-1.5` del botón agrandan el área de clic hacia afuera,
          así el texto del paso plegable sigue alineado con el del paso que no lo es. */}
      <h3 className={cn('text-sm font-semibold', plegable !== undefined && '-m-1.5')}>
        {plegable === undefined
          ? <span className="flex items-center gap-2.5">{cabecera}</span>
          : (
            <button
              type="button"
              aria-expanded={plegable.abierto}
              aria-controls={plegable.idPanel}
              onClick={plegable.onAlternar}
              className="rounded-chico hover:bg-hover ease-neo flex w-full items-start gap-2.5 p-1.5 text-left transition-colors duration-rapida"
            >
              {cabecera}
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn(
                  'text-texto-sutil ease-neo mt-0.5 ml-auto shrink-0 transition-transform duration-rapida',
                  plegable.abierto && 'rotate-180'
                )}
              />
            </button>
            )}
      </h3>

      {/* Plegado se oculta con el atributo `hidden` en vez de desmontarse: asi `aria-controls`
          apunta siempre a un elemento que existe, que es lo que el patron de divulgacion pide, y el
          contenido sale del recorrido del tabulador igual que si no estuviera. */}
      <div id={plegable?.idPanel} hidden={plegable !== undefined && !plegable.abierto}>
        {children}
      </div>
    </section>
  )
}
