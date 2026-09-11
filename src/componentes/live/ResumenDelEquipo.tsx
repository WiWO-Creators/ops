import { Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Seccion } from '@/componentes/presentadores/Ficha'
import {
  horasYMinutos,
  proporcion,
  type ItemDelResumen,
  type PersonaDelResumen,
  type ResumenDeEquipo
} from '@/datos/resumen-equipo'
import { formatearFecha } from '@/lib/fechas'

/**
 * El resumen de un día: los totales, el párrafo del modelo, dónde se fue el tiempo y quién lo puso.
 *
 * === SERVIDOR, NO CLIENTE ===
 *
 * No tiene estado ni eventos: un día cerrado no cambia, y cambiar de día es navegar a otra URL
 * (`ResumenDelEquipoDias`). Mandar este árbol al navegador sería pagar hidratación por una pantalla
 * que sólo se lee. Es la diferencia con `PanelEquipo`, que sí es cliente porque se repregunta sola
 * cada treinta segundos.
 *
 * === POR QUÉ LOS NÚMEROS VAN ANTES QUE EL PÁRRAFO ===
 *
 * Porque los números están siempre y el párrafo no: con la IA apagada, `texto` llega en `null` y una
 * pantalla que lo pusiera primero abriría con un hueco. Y porque el párrafo describe lo que las
 * cifras ya dicen; al revés, se lee el adorno antes que el dato.
 *
 * === POR QUÉ EL DESGLOSE POR PERSONA NO SE PLIEGA ===
 *
 * Porque es lo que la jefatura abrió a buscar. Un acordeón ahorraría alto a costa de esconder el
 * único contenido de la pantalla detrás de un clic por persona.
 */
export function ResumenDelEquipo ({ resumen }: { resumen: ResumenDeEquipo }) {
  const { detalle } = resumen

  return (
    <div className="flex flex-col gap-8">
      <Totales resumen={resumen} />

      {resumen.texto !== null && (
        <blockquote className="border-acento bg-superficie-elevada rounded-control border-l-2 px-4 py-3">
          <p className="text-texto text-base leading-relaxed whitespace-pre-line">{resumen.texto}</p>
          <footer className="text-texto-sutil mt-2 text-xs">Escrito por la IA sobre las cifras de arriba.</footer>
        </blockquote>
      )}

      {detalle.personas_activas === 0
        ? (
          <Vacio
            titulo="Nadie midió tiempo este día"
            descripcion="Puede ser un feriado, un fin de semana o un día en que el equipo trabajó sin abrir el medidor. El resumen se guardó igual."
          />
          )
        : (
          <>
            <Seccion titulo="Dónde se fue el tiempo">
              <Barras items={detalle.espacios} total={detalle.total_segundos} />
            </Seccion>

            <Seccion titulo="Quién lo puso">
              <ul className="flex flex-col gap-5">
                {detalle.personas.map((persona) => (
                  <li key={persona.staff_id}>
                    <Persona persona={persona} total={detalle.total_segundos} />
                  </li>
                ))}
              </ul>
            </Seccion>
          </>
          )}
    </div>
  )
}

/**
 * La cabecera de cifras del día.
 *
 * `jornadas_abiertas` va al lado de `personas_activas` y no escondido: "seis personas midieron" se
 * lee muy distinto si ese día abrieron jornada seis o veinte, y esa diferencia es justamente lo que
 * una jefatura necesita para no leer el resumen como un ranking.
 */
function Totales ({ resumen }: { resumen: ResumenDeEquipo }) {
  const { detalle } = resumen

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-texto font-titular text-2xl font-extrabold tracking-tight">
          {horasYMinutos(resumen.total_segundos)}
        </span>
        <span className="text-texto-tenue text-sm">
          {detalle.personas_activas} de {detalle.jornadas_abiertas} {detalle.jornadas_abiertas === 1 ? 'jornada' : 'jornadas'} con tiempo medido
        </span>
        <span className="text-texto-tenue text-sm">
          {detalle.espacios.length} {detalle.espacios.length === 1 ? 'Espacio' : 'Espacios'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Insignia tono="contorno" tamano="chico">{formatearFecha(resumen.dia)}</Insignia>
        <span className="text-texto-sutil text-xs">Generado {formatearFecha(resumen.generado_en, true)}</span>
        {resumen.texto === null && (
          <Insignia tono="aviso" tamano="chico">Sin redacción: la IA estaba apagada</Insignia>
        )}
        {resumen.enviado_en !== null && (
          <Insignia tono="neutro" tamano="chico">Enviado a {resumen.enviados} jefaturas</Insignia>
        )}
      </div>
    </div>
  )
}

/**
 * Una persona con sus Espacios y sus Procesos.
 *
 * Los Espacios van arriba y los Procesos debajo porque la suma de los Procesos NO da el total de la
 * persona: el medidor de la cabecera mide sobre el Espacio sin bajar a un Proceso, y ese tiempo
 * existe y está en el Espacio. Ponerlos al mismo nivel invitaría a sumar dos listas que no suman
 * igual.
 */
function Persona ({ persona, total }: { persona: PersonaDelResumen, total: number }) {
  return (
    <article className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-texto text-sm font-semibold break-words [overflow-wrap:anywhere]">{persona.nombre}</h3>
        <span className="text-texto font-mono text-sm font-semibold">{horasYMinutos(persona.segundos)}</span>
      </div>

      <div className="border-linea-suave flex flex-col gap-3 border-l-2 pl-3">
        <Listado rotulo="Espacios" items={persona.espacios} total={persona.segundos} />
        <Listado rotulo="Procesos" items={persona.procesos} total={persona.segundos} />
      </div>

      <Barra parte={persona.segundos} total={total} />
    </article>
  )
}

/** Un rótulo en versalita y la lista de items con su tiempo. Vacío se dice, no se omite. */
function Listado ({ rotulo, items, total }: { rotulo: string, items: ItemDelResumen[], total: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{rotulo}</span>

      {items.length === 0
        ? <span className="text-texto-tenue text-sm">Nada medido a este nivel.</span>
        : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={`${item.id ?? 'sin'}-${item.nombre}`} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-texto min-w-0 flex-1 text-sm break-words [overflow-wrap:anywhere]">
                  {item.nombre}
                  {item.espacio !== undefined && <span className="text-texto-sutil"> · {item.espacio}</span>}
                </span>
                <span className="text-texto-tenue shrink-0 font-mono text-xs">
                  {horasYMinutos(item.segundos)} · {proporcion(item.segundos, total)}%
                </span>
              </li>
            ))}
          </ul>
          )}
    </div>
  )
}

/** El agregado por Espacio, de mayor a menor: una fila con su barra. */
function Barras ({ items, total }: { items: ItemDelResumen[], total: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.id ?? 'sin-espacio'} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-texto min-w-0 flex-1 text-sm font-medium break-words [overflow-wrap:anywhere]">
              {item.nombre}
            </span>
            <span className="text-texto-tenue shrink-0 font-mono text-xs">
              {horasYMinutos(item.segundos)} · {proporcion(item.segundos, total)}%
            </span>
          </div>
          <Barra parte={item.segundos} total={total} />
        </li>
      ))}
    </ul>
  )
}

/**
 * La barra de proporción.
 *
 * `aria-hidden`: el porcentaje ya viaja escrito en la fila de al lado, y una barra anunciada por el
 * lector de pantalla repetiría el mismo dato con menos precisión.
 */
function Barra ({ parte, total }: { parte: number, total: number }) {
  return (
    <div aria-hidden="true" className="bg-superficie-hundida h-1.5 w-full overflow-hidden rounded-full">
      <div className="bg-acento h-full rounded-full" style={{ width: `${proporcion(parte, total)}%` }} />
    </div>
  )
}
