import { CalendarClock, CircleCheck, CircleHelp, OctagonAlert } from 'lucide-react'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearVencimiento } from '@/lib/fechas'
import {
  MOTIVO_SIN_BLOQUEOS,
  MOTIVO_SIN_FECHA_PROXIMA,
  etiquetaDeResponsable,
  textoDeAntiguedad,
  type BloqueoLeido,
  type LecturaDeBloqueos,
  type LecturaDeProximosHitos
} from './resumen'

/**
 * Las piezas que comparten las pantallas del portal que le hablan al cliente de sus {espacios}.
 *
 * Existen una sola vez porque la portada (`ResumenDelPortal`) y el estado de los {espacios}
 * (`EstadoDeMisProyectos`) dicen las MISMAS cosas: que espera su respuesta, que esta trabado y por
 * que un numero no esta. Con dos copias, las dos pantallas se separan en el primer retoque y el
 * cliente termina leyendo la misma noticia con dos caras distintas segun por donde entro.
 *
 * Todas son Server Components sin estado: en estas pantallas no hay nada que tocar, solo enlaces.
 */

/** El fondo y el borde de las tres clases de noticia que el portal le da al cliente. */
const TONOS_DE_TARJETA = {
  atencion: 'border-linea-fuerte bg-superficie-aviso border-l-4',
  tranquilo: 'border-linea bg-superficie-elevada border',
  apagado: 'border-linea-suave bg-superficie-hundida border border-dashed'
} as const

export type TonoDeTarjeta = keyof typeof TONOS_DE_TARJETA

/**
 * La tarjeta ancha de la parte de arriba, en el tono que le toque.
 *
 * El tono no es decoracion: `atencion` es lo que le pide algo al cliente, `tranquilo` es la buena
 * noticia y `apagado` es el hueco que se dibuja como hueco. Un cartel que no se puede distinguir de
 * los otros dos se aprende a ignorar en dos dias.
 *
 * @param tono que clase de noticia trae
 * @param icono el simbolo de la izquierda, ya dimensionado
 * @param children el texto de la tarjeta
 */
export function Tarjeta (
  { tono, icono, children }:
  { tono: TonoDeTarjeta, icono: React.ReactNode, children: React.ReactNode }
) {
  return (
    <div className={cn('rounded-tarjeta flex items-start gap-3 p-4', TONOS_DE_TARJETA[tono])}>
      <span className="text-texto-sutil mt-0.5">{icono}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** La letra chica que explica por que un numero no esta. Va debajo del dato, nunca arriba. */
export function Aclaracion ({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-linea text-texto-sutil border-l-2 pl-3 text-xs leading-relaxed">
      {children}
    </p>
  )
}

/**
 * El envoltorio de las listas del portal: un titulo con su simbolo y las filas debajo.
 *
 * @param titulo el encabezado de la lista
 * @param icono el simbolo del encabezado, ya dimensionado
 * @param children las filas, que son `<li>`
 */
export function BloqueDeLista (
  { titulo, icono, children }:
  { titulo: string, icono: React.ReactNode, children: React.ReactNode }
) {
  return (
    <div className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-4">
      <h3 className="font-titular text-texto border-linea-suave mb-3 flex items-center gap-1.5 border-b pb-2 text-sm font-semibold">
        {icono}
        {titulo}
      </h3>
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  )
}

/**
 * Un {proceso} detenido, con todo lo que hace falta para entender que pasa sin abrirlo.
 *
 * La antiguedad se omite cuando no se puede calcular, en vez de escribir "hace 0 dias": el `null`
 * de `dias_bloqueada` es una fecha ilegible y no un bloqueo de hoy. Quien lo decide es
 * `textoDeAntiguedad()`.
 *
 * Lo que depende del cliente va con la tarjeta en tono de aviso: es el unico bloqueo que quien mira
 * la pantalla puede destrabar solo.
 *
 * @param bloqueo la fila ya leida, con su marca de quien depende
 * @param conEspacio si se escribe de que {espacio} salio. La portada lo necesita —es una lista
 *   transversal—; una lista que ya vive dentro de un {espacio} repetiria el nombre en cada renglon
 */
export function FilaTrabada (
  { bloqueo, conEspacio = true }: { bloqueo: BloqueoLeido, conEspacio?: boolean }
) {
  const responsable = etiquetaDeResponsable(bloqueo.responsable)
  const antiguedad = textoDeAntiguedad(bloqueo.dias_bloqueada)

  return (
    <li
      className={cn(
        'rounded-tarjeta border p-3',
        bloqueo.deTuLado
          ? 'border-linea-fuerte bg-superficie-aviso border-l-4'
          : 'border-linea-suave bg-superficie-hundida'
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-texto min-w-0 text-sm font-medium">{bloqueo.name}</p>
        {responsable !== null && (
          <span
            className={cn(
              'text-xs font-semibold',
              bloqueo.deTuLado ? 'text-texto' : 'text-texto-sutil'
            )}
          >
            {responsable}
          </span>
        )}
      </div>

      {conEspacio && <p className="text-texto-tenue text-xs">{bloqueo.project.name}</p>}
      <p className="text-texto-tenue mt-2 text-sm">{bloqueo.motivo}</p>

      {bloqueo.accion_necesaria !== null && bloqueo.accion_necesaria !== undefined && (
        <p className="text-texto mt-1 text-sm font-medium">{bloqueo.accion_necesaria}</p>
      )}

      {antiguedad !== null && (
        <p className="text-texto-sutil mt-2 text-xs">{antiguedad}</p>
      )}
    </li>
  )
}

/**
 * Que se entrega y cuando, de todos los {espacios} a la vez.
 *
 * Complementa a `MetricaDeHitos`, no la duplica: arriba estan los dos numeros y acá las filas con
 * nombre, {espacio} y fecha. Hasta ahora el cliente tenia el contador y para saber que venia tenia
 * que entrar a sus {espacios} de a uno.
 *
 * Los vencidos van marcados y no solo contados: en una lista ordenada por fecha son las primeras
 * filas, y sin la marca se leen igual que las que todavia estan en plazo.
 *
 * Las dos formas de lista vacia se dibujan distinto y esa decision no esta acá: la toma
 * `leerProximosHitos()` contra el contador. Si no hay ningun {hito} comprometido, la tarjeta de
 * arriba ya lo dijo y este bloque se calla.
 *
 * @param lectura lo que decidio `leerProximosHitos()`
 */
export function ProximosHitos ({ lectura }: { lectura: LecturaDeProximosHitos }) {
  if (lectura.clase === 'nada_comprometido') return null

  if (lectura.clase === 'sin_fecha_proxima') {
    return <Aclaracion>{MOTIVO_SIN_FECHA_PROXIMA}</Aclaracion>
  }

  return (
    <BloqueDeLista
      titulo={`Próximos ${GLOSARIO.hito.plural.toLowerCase()}`}
      icono={<CalendarClock size={14} aria-hidden="true" className="shrink-0" />}
    >
      {lectura.filas.map((hito) => (
        <li
          key={hito.id}
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1',
            hito.vencido && 'border-linea-fuerte border-l-2 pl-3'
          )}
        >
          <div className="min-w-0">
            <p className="text-texto text-sm font-medium">
              {hito.name}
              {hito.vencido && (
                <span className="text-texto-peligro ml-2 text-xs font-semibold uppercase">
                  Vencido
                </span>
              )}
            </p>
            <p className="text-texto-tenue text-xs">{hito.project.name}</p>
          </div>
          <span
            data-numerico
            className={cn(
              'text-sm tabular-nums',
              hito.vencido ? 'text-texto-peligro font-medium' : 'text-texto-tenue'
            )}
          >
            {formatearVencimiento(hito.due_date)}
          </span>
        </li>
      ))}
    </BloqueDeLista>
  )
}

/**
 * Que esta detenido, por que y de quien depende destrabarlo.
 *
 * === LAS DOS PANTALLAS QUE NO SE PUEDEN CONFUNDIR ===
 *
 * La clave `bloqueados` puede no venir, y eso NO es una lista vacia: ausente es "no se puede saber"
 * —ningun {espacio} comparte su lista de {procesos}, o la instalacion no tiene la tabla de
 * bloqueos— y `[]` es "no tenes nada trabado". Dibujar la segunda cuando pasa la primera seria
 * tranquilizar al cliente sobre algo que nadie miro. Quien las distingue es `leerBloqueos()`.
 *
 * === LO QUE DEPENDE DEL CLIENTE VA DESTACADO ===
 *
 * `responsable = 'cliente'` es el unico bloqueo que quien mira esta pantalla puede destrabar solo,
 * asi que es lo mas accionable que hay acá: va primero y con la tarjeta en tono de aviso. Los otros
 * dos valores del enum informan, no piden nada.
 *
 * `accion_necesaria` y `responsable` pueden faltar —migracion `0699` sin correr— y entonces la fila
 * sale igual con su motivo y su antiguedad: una base atrasada pierde el dato nuevo, no la fila.
 *
 * @param lectura lo que decidio `leerBloqueos()`
 */
export function LoQueEstaTrabado ({ lectura }: { lectura: LecturaDeBloqueos }) {
  if (lectura.clase === 'no_se_sabe') {
    return (
      <Tarjeta tono="apagado" icono={<CircleHelp size={16} aria-hidden="true" className="shrink-0" />}>
        <p className="text-texto text-sm font-medium">No podemos decirte si hay algo trabado</p>
        <p className="text-texto-tenue mt-1 text-sm">{MOTIVO_SIN_BLOQUEOS}</p>
      </Tarjeta>
    )
  }

  if (lectura.clase === 'sin_bloqueos') {
    return (
      <Tarjeta tono="tranquilo" icono={<CircleCheck size={16} aria-hidden="true" className="shrink-0" />}>
        <p className="text-texto text-sm font-medium">No hay nada trabado</p>
        <p className="text-texto-tenue mt-1 text-sm">
          Si algo se detiene y necesitamos que hagas algo para seguir, lo vas a ver acá.
        </p>
      </Tarjeta>
    )
  }

  return (
    <BloqueDeLista
      titulo="Qué está trabado"
      icono={<OctagonAlert size={14} aria-hidden="true" className="shrink-0" />}
    >
      {lectura.filas.map((bloqueo) => (
        <FilaTrabada key={bloqueo.id} bloqueo={bloqueo} />
      ))}
    </BloqueDeLista>
  )
}
