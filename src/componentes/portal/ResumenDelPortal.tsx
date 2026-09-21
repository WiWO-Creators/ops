import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, CalendarClock, CircleCheck, CircleHelp, Flag, OctagonAlert
} from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { formatearPorcentaje } from '@/dominio/gestion'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearVencimiento } from '@/lib/fechas'
import type { ResumenPortal } from '@/datos/portal'
import {
  MOTIVO_SIN_BLOQUEOS,
  MOTIVO_SIN_ESPERA,
  MOTIVO_SIN_FECHA_PROXIMA,
  MOTIVO_SIN_PROCESOS,
  etiquetaDeResponsable,
  hayQueDibujarElResumen,
  leerBloqueos,
  leerEspera,
  leerHitos,
  leerProximosHitos,
  ordenarEstados,
  textoDeAntiguedad,
  type BloqueoLeido,
  type LecturaDeBloqueos,
  type LecturaDeHitos,
  type LecturaDeProximosHitos
} from './resumen'

/**
 * El dashboard del cliente: los numeros de TODOS sus {espacios}, arriba de la portada del portal.
 *
 * === POR QUE ESTA PIEZA EXISTE ===
 *
 * Porque estos numeros los sumaba el navegador. La portada pedia `/portal/projects?per_page=100` y
 * contaba sobre lo que llegaba: con mas de cien {espacios} la pantalla mentia hacia abajo y en
 * silencio. Ahora los suma el servidor en `GET /portal/resumen`, sobre el conjunto entero, y acá
 * solo se dibujan. Un agregado no se pagina.
 *
 * === EL ORDEN DE LA PANTALLA NO ES DECORATIVO ===
 *
 * Primero va lo que le pide algo al cliente —{procesos} esperando su respuesta—, y despues lo que
 * solo le informa. Es el unico bloque de la portada que exige una accion suya, asi que va arriba de
 * todo y con su camino para resolverlo: un aviso sin salida se aprende a ignorar en dos dias.
 *
 * === LOS CUATRO HUECOS QUE SE DIBUJAN COMO HUECOS ===
 *
 * `esperando_tu_respuesta` en `null`, `procesos` sin venir, `bloqueados` sin venir, y cero {hitos}
 * comprometidos. Ninguno se pinta como un 0 ni como una lista vacia: un cero se lee "no te falta
 * nada", y los cuatro significan "no hay de donde contarlo". La ausencia de `bloqueados` es la mas
 * peligrosa de las cuatro, porque su lista vacia SI existe y quiere decir lo contrario. Quien
 * decide eso es `componentes/portal/resumen.ts`, no este archivo.
 *
 * Server Component sin estado, como el resto de la portada: no hay nada que el cliente pueda tocar
 * acá, solo enlaces.
 */
export function ResumenDelPortal ({ resumen }: { resumen: ResumenPortal }) {
  if (!hayQueDibujarElResumen(resumen)) return null

  const hitos = leerHitos(resumen.hitos)
  const procesos = resumen.procesos

  return (
    <section aria-label="Resumen" className="flex flex-col gap-3">
      <EsperaTuRespuesta cantidad={resumen.esperando_tu_respuesta} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta={GLOSARIO.espacio.plural} valor={String(resumen.espacios.total)} />

        {procesos !== undefined && (
          <>
            <Metrica
              etiqueta={`${GLOSARIO.proceso.plural} abiertas`}
              valor={String(procesos.open)}
            />
            <Metrica
              etiqueta="Avance"
              valor={formatearPorcentaje(procesos.completed_percent)}
            />
          </>
        )}

        <MetricaDeHitos lectura={hitos} />
      </div>

      {procesos === undefined && <Aclaracion>{MOTIVO_SIN_PROCESOS}</Aclaracion>}

      <EstadoDeLosEspacios estados={resumen.espacios.by_status} />

      <ProximosHitos lectura={leerProximosHitos(resumen.proximos_hitos, resumen.hitos)} />

      <LoQueEstaTrabado lectura={leerBloqueos(resumen.bloqueados)} />
    </section>
  )
}

/**
 * El unico numero de la portada que pide una accion del cliente, con el camino para resolverlo.
 *
 * Tres estados y ningun cero inventado:
 *
 *   - **pendiente**: destacado, con el enlace a donde se responde. Las aprobaciones se resuelven
 *     dentro de cada {espacio} —es donde vive el bloque «Esperan tu visto bueno»— asi que el enlace
 *     va al listado: es el camino real y no una ruta que no existe.
 *   - **al dia**: la misma tarjeta en tono tranquilo. Se dibuja igual aunque no haya nada, porque
 *     "nada espera tu respuesta" ES la respuesta a la pregunta con la que el cliente entra.
 *   - **no se sabe**: la API mando `null`. Se dice que no se sabe y por que, nunca un 0.
 *
 * @param cantidad `esperando_tu_respuesta` tal como llego del resumen
 */
function EsperaTuRespuesta ({ cantidad }: { cantidad: number | null }) {
  const lectura = leerEspera(cantidad)

  if (lectura.clase === 'no_se_sabe') {
    return (
      <Tarjeta tono="apagado" icono={<CircleHelp size={16} aria-hidden="true" className="shrink-0" />}>
        <p className="text-texto text-sm font-medium">No podemos decirte qué espera tu respuesta</p>
        <p className="text-texto-tenue mt-1 text-sm">{MOTIVO_SIN_ESPERA}</p>
      </Tarjeta>
    )
  }

  if (lectura.clase === 'al_dia') {
    return (
      <Tarjeta tono="tranquilo" icono={<CircleCheck size={16} aria-hidden="true" className="shrink-0" />}>
        <p className="text-texto text-sm font-medium">Nada espera tu respuesta</p>
        <p className="text-texto-tenue mt-1 text-sm">
          Cuando el equipo necesite tu visto bueno para seguir, lo vas a ver acá.
        </p>
      </Tarjeta>
    )
  }

  const cuantas = lectura.cuantas
  const nombre = cuantas === 1 ? GLOSARIO.proceso.singular.toLowerCase() : GLOSARIO.proceso.plural.toLowerCase()

  return (
    <Tarjeta tono="atencion" icono={<AlertTriangle size={16} aria-hidden="true" className="shrink-0" />}>
      <p className="text-texto text-sm font-medium">
        <span data-numerico className="tabular-nums">{cuantas}</span> {nombre}
        {cuantas === 1 ? ' espera' : ' esperan'} tu respuesta
      </p>
      <p className="text-texto-tenue mt-1 text-sm">
        {cuantas === 1 ? 'Arranca' : 'Arrancan'} cuando des el visto bueno. Se responde dentro
        {' '}{cuantas === 1 ? 'del' : 'de cada'} {GLOSARIO.espacio.singular.toLowerCase()} que
        {' '}{cuantas === 1 ? 'la pidió' : 'las pidió'}.
      </p>
      <Link
        href="/portal/proyectos"
        className="text-acento mt-2 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
      >
        Ir a mis {GLOSARIO.espacio.plural.toLowerCase()}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </Tarjeta>
  )
}

/**
 * Los {hitos} comprometidos y cuantos ya pasaron de fecha.
 *
 * Es una tarjeta propia y no una `Metrica` mas porque el numero cambia de noticia segun el
 * acompañamiento: «4 {hitos}» y «4 {hitos}, 2 vencidos» no se leen igual, y el segundo tiene que
 * verse distinto sin que el cliente lea la letra chica.
 *
 * El detalle de cada {hito} lo dibuja `ProximosHitos`, y ahi tampoco se repiten estos dos numeros:
 * esta tarjeta dice CUANTOS hay y cuantos pasaron de fecha, y la lista dice cuales y cuando. La
 * lista la arma el servidor sobre TODOS los {espacios} del cliente —igual que estos contadores— y
 * no el navegador sobre los que entren en la portada, que seria el mismo error que este resumen
 * vino a arreglar, esta vez con fechas.
 *
 * @param lectura lo que decidio `leerHitos()`
 */
function MetricaDeHitos ({ lectura }: { lectura: LecturaDeHitos }) {
  if (lectura.clase === 'sin_hitos') {
    return (
      <div className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-1 border p-4">
        <span data-numerico className="text-texto-sutil text-seccion leading-none font-semibold">—</span>
        <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
          {GLOSARIO.hito.plural}
        </span>
        <span className="text-texto-tenue text-xs">Todavía no hay ninguno comprometido</span>
      </div>
    )
  }

  const vencidos = lectura.clase === 'vencidos'

  return (
    <div
      className={cn(
        'rounded-tarjeta shadow-1 flex flex-col gap-1 border p-4',
        vencidos
          ? 'border-linea-fuerte bg-superficie-peligro'
          : 'border-linea bg-superficie-elevada'
      )}
    >
      <span
        data-numerico
        className={cn(
          'text-seccion leading-none font-semibold tabular-nums',
          vencidos ? 'text-texto-peligro' : 'text-texto'
        )}
      >
        {lectura.total}
      </span>
      <span className="text-texto-sutil flex items-center gap-1.5 text-xs font-medium tracking-[0.08em] uppercase">
        <Flag size={12} aria-hidden="true" className="shrink-0" />
        {GLOSARIO.hito.plural}
      </span>
      <span className={cn('text-xs', vencidos ? 'text-texto-peligro' : 'text-texto-tenue')}>
        {vencidos
          ? `${lectura.cuantos} ${lectura.cuantos === 1 ? 'vencido' : 'vencidos'}`
          : 'Ninguno vencido'}
      </span>
    </div>
  )
}

/**
 * En que estado estan los {espacios} del cliente.
 *
 * Se dibujan TODOS los estados del catalogo, tambien los que estan en cero, porque asi los manda la
 * API: la fila de insignias tiene la misma forma para todos los clientes, y una que aparece y
 * desaparece segun el mes hace que el cliente crea que perdio un {espacio}.
 *
 * @param estados `espacios.by_status` tal como llego
 */
function EstadoDeLosEspacios ({ estados }: { estados: ResumenPortal['espacios']['by_status'] }) {
  if (estados.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2">
      {ordenarEstados(estados).map((estado) => (
        <li key={estado.status}>
          <Insignia color={estado.color} tamano="chico">
            {estado.name}
            <span data-numerico className="tabular-nums">{estado.total}</span>
          </Insignia>
        </li>
      ))}
    </ul>
  )
}

/** El fondo y el borde de las tres lecturas de «espera tu respuesta». */
const TONOS_DE_TARJETA = {
  atencion: 'border-linea-fuerte bg-superficie-aviso border-l-4',
  tranquilo: 'border-linea bg-superficie-elevada border',
  apagado: 'border-linea-suave bg-superficie-hundida border border-dashed'
} as const

/**
 * La tarjeta ancha de la parte de arriba, en el tono que le toque.
 *
 * @param tono que clase de noticia trae
 * @param icono el simbolo de la izquierda, ya dimensionado
 * @param children el texto de la tarjeta
 */
function Tarjeta (
  { tono, icono, children }:
  { tono: keyof typeof TONOS_DE_TARJETA, icono: React.ReactNode, children: React.ReactNode }
) {
  return (
    <div className={cn('rounded-tarjeta flex items-start gap-3 p-4', TONOS_DE_TARJETA[tono])}>
      <span className="text-texto-sutil mt-0.5">{icono}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** La letra chica que explica por que un numero no esta. Va debajo del dato, nunca arriba. */
function Aclaracion ({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-linea text-texto-sutil border-l-2 pl-3 text-xs leading-relaxed">
      {children}
    </p>
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
function ProximosHitos ({ lectura }: { lectura: LecturaDeProximosHitos }) {
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
function LoQueEstaTrabado ({ lectura }: { lectura: LecturaDeBloqueos }) {
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

/**
 * Un {proceso} detenido, con todo lo que hace falta para entender que pasa sin abrirlo.
 *
 * La antiguedad se omite cuando no se puede calcular, en vez de escribir "hace 0 dias": el `null`
 * de `dias_bloqueada` es una fecha ilegible y no un bloqueo de hoy. Quien lo decide es
 * `textoDeAntiguedad()`.
 *
 * @param bloqueo la fila ya leida, con su marca de quien depende
 */
function FilaTrabada ({ bloqueo }: { bloqueo: BloqueoLeido }) {
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

      <p className="text-texto-tenue text-xs">{bloqueo.project.name}</p>
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
 * El envoltorio de las dos listas de la portada: un titulo con su simbolo y las filas debajo.
 *
 * Existe una sola vez porque las dos listas ocupan el mismo lugar de la pantalla y tienen que
 * verse iguales: con dos copias, la de {hitos} y la de bloqueos se separan en el primer retoque.
 *
 * @param titulo el encabezado de la lista
 * @param icono el simbolo del encabezado, ya dimensionado
 * @param children las filas, que son `<li>`
 */
function BloqueDeLista (
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
