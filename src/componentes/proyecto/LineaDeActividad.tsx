import { Avatar } from '@/componentes/presentadores/Avatar'
import { Vacio } from '@/componentes/estado/Estados'
import { agruparPorDia, autorDeEntrada, horaDeEntrada, type EntradaDeActividad } from './actividad'
import { textoPlano } from './formatos'

/**
 * El feed de actividad como linea de tiempo.
 *
 * **No es una tabla.** El feed es una sucesion de momentos, no un conjunto de filas comparables: no
 * tiene filtros, no tiene busqueda y su unico orden es el cronologico. Agrupado por dia, la fecha se
 * dice una vez por bloque y cada fila solo lleva su hora.
 *
 * Lo dibujan el Espacio, el historial de una persona y el portal del cliente. Antes cada uno tenia
 * su version, y la del cliente habia quedado en una lista plana sin autor ni hora: la misma
 * actividad se leia distinto segun quien mirara.
 *
 * Sin `'use client'`: es marcado y nada mas. Asi la monta igual un panel del equipo —que es
 * cliente— y una pagina del portal, que se resuelve en el servidor.
 */

/**
 * @param entradas el feed tal como llego de la API, ya ordenado por el backend
 * @param accion control propio de cada fila, contra el margen derecho. El equipo pone ahi el
 *   interruptor de visibilidad; el portal no pone nada, porque no escribe
 * @param vacio que decir cuando no hay nada
 * @returns la linea de tiempo, o el estado vacio
 */
export function LineaDeActividad<T extends EntradaDeActividad & { id: number }> ({
  entradas,
  accion,
  vacio = {
    titulo: 'Todavía no hay actividad',
    descripcion: 'Cuando alguien cree, edite o complete algo en este proyecto, queda registrado acá.'
  }
}: {
  entradas: T[]
  accion?: (entrada: T) => React.ReactNode
  vacio?: { titulo: string, descripcion: string }
}) {
  const dias = agruparPorDia(entradas)

  if (dias.length === 0) return <Vacio titulo={vacio.titulo} descripcion={vacio.descripcion} />

  return (
    // Ancho acotado: la actividad se LEE, no se compara columna contra columna. A 1440px sin tope,
    // la descripcion y su control quedan a media pantalla de distancia y la linea de texto pasa de
    // las 75 letras que se leen de un renglon.
    <ol className="flex max-w-3xl flex-col gap-6">
      {dias.map((dia) => (
        <li key={`${dia.titulo}-${dia.entradas[0]?.id ?? 0}`} className="flex flex-col gap-2">
          <h3 className="text-texto-sutil text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
            {dia.titulo}
          </h3>

          <ol>
            {dia.entradas.map((entrada) => (
              <Entrada key={entrada.id} entrada={entrada} accion={accion?.(entrada)} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}

/**
 * Una entrada de la linea de tiempo.
 *
 * La hora vive en su propia columna y el contenido cuelga de una regla de 1px: es lo que convierte
 * una lista en una linea de tiempo sin pintar puntos, que obligarian a que el halo de cada punto
 * conozca el color de la superficie de atras.
 */
function Entrada ({ entrada, accion }: { entrada: EntradaDeActividad, accion?: React.ReactNode }) {
  const detalle = textoPlano(entrada.additional_data)
  const autor = autorDeEntrada(entrada)

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span data-numerico className="text-texto-sutil pt-2.5 text-right text-xs tabular-nums">
        {horaDeEntrada(entrada.date_added)}
      </span>

      {/* En una sola columna hasta `sm`: a 420px la descripcion y el control no entran en el mismo
          renglon, y forzarlos parte el texto en tres palabras por linea. */}
      <div className="border-linea-suave flex min-w-0 flex-col gap-1 border-l py-2 pl-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        {/* Que pasó y su detalle van juntos, sin nada en el medio: el control es del otro lado. */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Avatar nombre={autor} imagen={entrada.staff?.profile_image_url} tamano="chico" />
            <span className="text-texto text-sm font-medium">{autor}</span>
            <span className="text-texto-tenue min-w-0 text-sm">{entrada.description}</span>
          </div>

          {detalle !== '' && (
            <p className="text-texto-sutil text-xs whitespace-pre-line">{detalle}</p>
          )}
        </div>

        {/* Al costado y no debajo: puesto en su propio renglon, el control se repite veinticinco
            veces y termina pesando mas que lo que paso. Contra el margen derecho arma una columna
            que se lee de un vistazo. */}
        {accion}
      </div>
    </li>
  )
}
