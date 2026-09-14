import { Orbe } from '@/componentes/estado/Orbe'
import { CodigoCopiable } from '@/componentes/presentadores/CodigoCopiable'
import { mensajeParaPantalla } from '@/datos/errores'
import { cn } from '@/lib/clases'
import { NOMBRE_SOPORTE, URL_SOPORTE } from '@/lib/soporte'

/**
 * El codigo de incidente dentro del mensaje de la API (`Error interno. Incidente 4f75456f.`).
 *
 * Se lo saca de la frase para darle la misma forma que tiene en el aviso flotante: un boton que se
 * copia de un clic, al lado de a donde mandarlo. Suelto en medio de una oracion hay que
 * seleccionarlo a mano, que es justo donde se transcriben mal dos digitos.
 */
const INCIDENTE_EN_MENSAJE = /\s*Incidente ([0-9a-f]{8})\.?/

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
 * El rojo pinta el titulo, no la caja entera: un panel rojo de borde a borde grita lo mismo que un
 * titulo en rojo, pero ademas vuelve ilegible el detalle y hace parecer irreversible algo que casi
 * siempre se arregla reintentando. La superficie es la hundida del resto del producto.
 *
 * `detalle` muestra el `message` que normaliza el cliente de datos, nunca un stack: el stack no le
 * dice nada a quien usa la aplicacion y puede filtrar rutas del servidor.
 */
export function ErrorEstado ({ titulo = 'Esto no se pudo cargar', detalle, onReintentar, className }: PropsError) {
  return (
    <div
      role="alert"
      className={cn(
        'border-linea bg-superficie-hundida rounded-tarjeta flex flex-col items-center gap-2 border px-6 py-10 text-center',
        className
      )}
    >
      <p className="text-texto-peligro font-semibold">{titulo}</p>
      {/* El detalle pasa por `mensajeParaPantalla()` y no se pinta crudo: el `message` de un 500
          trae la excepcion pegada atras —clase, consulta y archivo del servidor— y eso convierte un
          aviso en un volcado que ademas nombra por dentro a la API. */}
      {detalle && <Detalle detalle={detalle} />}
      {onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="border-linea text-texto hover:bg-hover rounded-control mt-2 border px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  )
}

/**
 * El detalle de un error: la frase legible y, si la API lo registro, su codigo a mano.
 *
 * El codigo sale de la frase y se pinta aparte porque es lo unico de este bloque que la persona
 * tiene que hacer algo con el —copiarlo y mandarlo—, y dentro de la oracion no se distingue de un
 * numero cualquiera.
 */
function Detalle ({ detalle }: { detalle: string }) {
  const limpio = mensajeParaPantalla(detalle)
  const encontrado = INCIDENTE_EN_MENSAJE.exec(limpio)
  const incidente = encontrado?.[1]
  const frase = incidente === undefined ? limpio : limpio.replace(INCIDENTE_EN_MENSAJE, '')

  return (
    <>
      <p className="text-texto-tenue max-w-prose text-sm text-pretty">{frase}</p>

      {incidente !== undefined && (
        <p className="text-texto-tenue flex flex-wrap items-center justify-center gap-1 text-xs">
          <CodigoCopiable valor={incidente} className="bg-superficie" />
          <span aria-hidden="true">·</span>
          <a
            href={URL_SOPORTE}
            target="_blank"
            rel="noopener noreferrer"
            className="text-acento font-semibold underline underline-offset-2"
          >
            Reportar a {NOMBRE_SOPORTE}
          </a>
        </p>
      )}
    </>
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
      titulo="No tienes permiso para ver esto"
      descripcion="Si crees que deberías tener acceso, pídeselo a quien administre el sistema."
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
