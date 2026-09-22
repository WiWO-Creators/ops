import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleCheck, CircleHelp, Flag } from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { formatearPorcentaje } from '@/dominio/gestion'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type { ResumenPortal } from '@/datos/portal'
import { Aclaracion, LoQueEstaTrabado, Tarjeta } from './piezas'
import {
  MOTIVO_SIN_ESPERA,
  MOTIVO_SIN_PROCESOS,
  hayQueDibujarElResumen,
  leerBloqueos,
  leerEspera,
  leerHitos,
  ordenarEstados,
  type LecturaDeHitos
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
 * La LISTA de {hitos} que vienen ya no cuelga de esta pieza: la portada la reemplazo por el resumen
 * semanal con IA, que dice lo mismo en prosa y ademas lo explica. El contador se queda porque es un
 * numero de un vistazo y el resumen es un parrafo: no compiten. El detalle fila por fila sigue
 * existiendo, dentro de «Estado de {espacios}» (`EstadoDeMisProyectos`), que es donde el cliente va
 * a ver fechas.
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
 * Solo los estados que tienen {espacios}. La API manda el catalogo entero, tambien los que estan en
 * cero, y dibujarlos todos llenaba la portada de insignias que no nombran nada —«En proceso 0»,
 * «Cancelado 0»— y que el cliente tiene que leer una por una para descubrir que no dicen nada. La
 * forma estable de la fila no vale ese ruido: lo que el cliente lee acá es donde esta su trabajo,
 * y un estado vacio no es un {espacio} perdido, es un estado que no usa.
 *
 * Si ninguno tiene {espacios} no hay fila: el total ya sale arriba, en su metrica.
 *
 * @param estados `espacios.by_status` tal como llego
 */
function EstadoDeLosEspacios ({ estados }: { estados: ResumenPortal['espacios']['by_status'] }) {
  const conEspacios = ordenarEstados(estados).filter((estado) => estado.total > 0)

  if (conEspacios.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2">
      {conEspacios.map((estado) => (
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
