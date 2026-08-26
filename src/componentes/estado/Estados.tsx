import { Orbe } from '@/componentes/estado/Orbe'
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
 * Bloque de carga: el orbe en su ventana.
 *
 * El producto tiene un solo lenguaje para decir "esto viene en camino", y es el orbe. Antes esto
 * dibujaba ademas filas neutras que reservaban el alto, con el orbe superpuesto encima: el halo se
 * derramaba sobre las filas y sobre el texto de al lado, y no se entendia quien estaba cargando.
 *
 * La ventana resuelve las dos cosas a la vez. `overflow-hidden` **recorta el halo**, que es lo que el
 * orbe necesita para no fusionarse con lo que tiene alrededor —en neo.wiwo.me ese recorte lo hacia la
 * tarjeta del showcase; aca no habia ninguna—, y el `alto` reserva el hueco del contenido que viene,
 * para que la pantalla no salte al llegar.
 *
 * El panel es el mismo patron que ya usa la columna del tablero: superficie hundida, linea y radio de
 * tarjeta. Al salir de tokens, el color sigue al tema de la aplicacion.
 *
 * La unica animacion es la del orbe, que se desmonta apenas hay datos: la regla del proyecto prohibe
 * animaciones infinitas en elementos SIEMPRE visibles, no en las que duran lo que dura la espera.
 *
 * @param alto utilidad de alto minimo que reserva el hueco del contenido. Ej: `min-h-40`
 * @param mensaje que se esta trayendo. Sin el, la espera se anuncia igual, solo para lector de pantalla
 * @param className clases extra de la ventana
 * @returns la ventana que ocupa el lugar del contenido mientras se lo espera
 */
export function Cargando ({
  alto = 'min-h-72',
  mensaje,
  className
}: {
  alto?: string
  mensaje?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'border-linea bg-superficie-hundida rounded-tarjeta grid place-items-center gap-3',
        'overflow-hidden border p-4',
        alto,
        className
      )}
    >
      {/* Una sola medida para toda ventana, chica o grande: cargar se ve igual en todo el producto, y
          entra hasta en la ventana mas baja. La medida es absoluta a proposito — ver `medida`. */}
      <Orbe medida="4.5rem" estado="thinking" />
      {mensaje === undefined
        ? <span className="sr-only">Cargando…</span>
        : <p className="text-texto-tenue text-sm">{mensaje}</p>}
    </div>
  )
}
