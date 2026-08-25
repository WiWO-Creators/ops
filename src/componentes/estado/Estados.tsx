import { Orbe, type TamanoOrbe } from '@/componentes/estado/Orbe'
import { cn } from '@/lib/clases'

interface PropsVacio {
  titulo: string
  descripcion?: string
  accion?: React.ReactNode
  className?: string
}

/**
 * Estado vacio de una lista o panel.
 *
 * Siempre lleva `titulo`, y la `accion` es opcional pero recomendada: un vacio sin salida deja a la
 * persona sin saber que hacer, que es la diferencia entre "no hay nada" y "no funciona".
 */
export function Vacio ({ titulo, descripcion, accion, className }: PropsVacio) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <p className="text-texto font-semibold">{titulo}</p>
      {descripcion && <p className="text-texto-tenue max-w-prose text-sm">{descripcion}</p>}
      {accion}
    </div>
  )
}

interface PropsError {
  titulo?: string
  detalle?: string
  onReintentar?: () => void
  className?: string
}

/**
 * Estado de error recuperable.
 *
 * `detalle` muestra el `message` que normaliza el cliente de datos, nunca un stack: el stack no le
 * dice nada a quien usa la aplicacion y puede filtrar rutas del servidor.
 */
export function ErrorEstado ({ titulo = 'Algo salió mal', detalle, onReintentar, className }: PropsError) {
  return (
    <div
      role="alert"
      className={cn(
        'border-linea bg-superficie-peligro rounded-tarjeta flex flex-col items-center gap-3 border px-6 py-10 text-center',
        className
      )}
    >
      <p className="text-texto-peligro font-semibold">{titulo}</p>
      {detalle && <p className="text-texto-tenue max-w-prose text-sm">{detalle}</p>}
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="text-acento text-sm font-semibold underline underline-offset-4"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

/**
 * Estado de permiso denegado.
 *
 * Se muestra cuando la API responde 403. Es distinto de un error: no hay nada que reintentar, y
 * ofrecer un boton de reintento seria mentir sobre lo que va a pasar.
 */
export function SinPermiso ({ className }: { className?: string }) {
  return (
    <Vacio
      titulo="No tenés permiso para ver esto"
      descripcion="Si creés que deberías tener acceso, pedíselo a quien administre el sistema."
      className={className}
    />
  )
}

/**
 * Bloque de carga.
 *
 * Reparte el trabajo en dos: las filas neutras reservan el alto real del contenido que viene, para
 * que la pantalla no salte cuando llega, y el orbe centrado encima es el que dice que hay algo en
 * curso. Por eso las filas ya no pulsan: quedan quietas y el unico movimiento es el del orbe, que se
 * desmonta apenas hay datos — la regla prohibe animaciones infinitas en elementos siempre visibles.
 *
 * @param filas cuantas lineas se dibujan
 * @param alto alto de cada linea, en utilidades de Tailwind
 * @param tamano medida del orbe: `chico` en linea, `medio` en una tarjeta, `grande` en un panel
 * @param className clases extra del contenedor
 * @returns el bloque que ocupa el lugar del contenido mientras se lo espera
 */
export function Cargando ({
  filas = 3,
  alto = 'h-10',
  tamano = 'grande',
  className
}: {
  filas?: number
  alto?: string
  tamano?: TamanoOrbe
  className?: string
}) {
  return (
    <div className={cn('relative flex flex-col gap-2', className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} aria-hidden="true" className={cn('bg-relleno-neutro rounded-chico', alto)} />
      ))}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Orbe tamano={tamano} estado="thinking" />
      </span>
    </div>
  )
}
