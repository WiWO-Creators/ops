'use client'

import { useState, type ReactElement } from 'react'
import { PaginacionTabla } from '@/componentes/datos/ControlesTabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { ActividadEspacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { agruparPorDia, autorDeEntrada, horaDeEntrada } from './actividad'
import { useRecurso } from './carga'
import { textoPlano } from './formatos'

/**
 * Pestaña Actividad del Proyecto, como linea de tiempo.
 *
 * **No es una tabla.** El feed es una sucesion de momentos, no un conjunto de filas comparables: no
 * tiene filtros, no tiene busqueda y su unico orden es el cronologico (ver `ACTIVIDAD` en
 * `definiciones/discusiones.ts`). Puesto en el motor de tabla, el encabezado ofrecia ordenar por lo
 * unico por lo que ya venia ordenado y la fecha se repetia entera en cada fila. Agrupado por dia, la
 * fecha se escribe una vez y cada entrada se queda con su hora.
 *
 * Es **solo presentacion**: los mismos datos, la misma ruta y la misma paginacion que antes. No hay
 * ninguna peticion nueva.
 *
 * `description` y `additional_data` llegan ya traducidas y con los pseudo-tags `<seconds>` y `<lang>`
 * resueltos por la API. Rehacer esa sustitucion aca seria duplicar logica del backend.
 *
 * El interruptor de "Visible para el cliente" solo se ofrece con `create projects`, igual que en el
 * panel: es lo que decide que ve el cliente en su portal.
 */

interface PropsPanelActividad {
  proyectoId: number
  /** Capacidades sobre `projects`. */
  capacidades: Capacidad[]
}

/** Cuantas entradas trae cada pagina. Es el mismo tope por defecto que usa el motor de tabla. */
const POR_PAGINA = 25

export function PanelActividad ({ proyectoId, capacidades }: PropsPanelActividad): ReactElement {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(POR_PAGINA)
  const puedeCambiarVisibilidad = capacidades.includes('create')

  const { estado, recargar } = useRecurso<ActividadEspacio[]>(
    `projects/${proyectoId}/activity?page=${pagina}&per_page=${porPagina}`,
    'No se pudo cargar la actividad del proyecto.'
  )

  if (estado.fase === 'cargando') return <Cargando alto="min-h-60" mensaje="Cargando la actividad…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const dias = agruparPorDia(estado.datos)

  return (
    <div className="flex flex-col gap-4">
      {dias.length === 0
        ? (
          <Vacio
            titulo="Todavía no hay actividad"
            descripcion="Cuando alguien cree, edite o complete algo en este proyecto, queda registrado acá."
          />
          )
        : (
          // Ancho acotado: la actividad se LEE, no se compara columna contra columna. A 1440px sin
          // tope, la descripcion y su interruptor quedan a media pantalla de distancia y la linea de
          // texto pasa de las 75 letras que se leen de un renglon.
          <ol className="flex max-w-3xl flex-col gap-6">
            {dias.map((dia) => (
              <li key={`${dia.titulo}-${dia.entradas[0]?.id ?? 0}`} className="flex flex-col gap-2">
                <h3 className="text-texto-sutil text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
                  {dia.titulo}
                </h3>

                <ol>
                  {dia.entradas.map((entrada) => (
                    <Entrada
                      key={entrada.id}
                      entrada={entrada}
                      proyectoId={proyectoId}
                      habilitado={puedeCambiarVisibilidad}
                      recargar={recargar}
                    />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          )}

      <PaginacionTabla
        paginacion={estado.meta?.pagination}
        onCambiar={(parcial) => {
          if (parcial.porPagina !== undefined) setPorPagina(parcial.porPagina)
          if (parcial.pagina !== undefined) setPagina(parcial.pagina)
        }}
      />
    </div>
  )
}

interface PropsEntrada {
  entrada: ActividadEspacio
  proyectoId: number
  habilitado: boolean
  recargar: () => void
}

/**
 * Una entrada de la linea de tiempo.
 *
 * La hora vive en su propia columna y el contenido cuelga de una regla de 1px: es lo que convierte
 * una lista en una linea de tiempo sin pintar puntos, que obligarian a que el halo de cada punto
 * conozca el color de la superficie de atras.
 *
 * @param entrada la entrada tal como la devuelve `GET /projects/{id}/activity`
 * @param proyectoId el proyecto, para la ruta del interruptor
 * @param habilitado si quien mira puede cambiar la visibilidad
 * @param recargar vuelve a pedir el feed despues de un cambio
 */
function Entrada ({ entrada, proyectoId, habilitado, recargar }: PropsEntrada): ReactElement {
  const detalle = textoPlano(entrada.additional_data)
  const hora = horaDeEntrada(entrada.date_added)
  const autor = autorDeEntrada(entrada)

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span data-numerico className="text-texto-sutil pt-2.5 text-right text-xs tabular-nums">
        {hora}
      </span>

      {/* En una sola columna hasta `sm`: a 420px la descripcion y el interruptor no entran en el mismo
          renglon, y forzarlos parte el texto en tres palabras por linea. */}
      <div className="border-linea-suave flex min-w-0 flex-col gap-1 border-l py-2 pl-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        {/* Que pasó y su detalle van juntos, sin nada en el medio: el interruptor es del otro lado. */}
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Avatar
              nombre={autor}
              imagen={entrada.staff?.profile_image_url}
              tamano="chico"
            />
            <span className="text-texto text-sm font-medium">{autor}</span>
            <span className="text-texto-tenue min-w-0 text-sm">{entrada.description}</span>
          </div>

          {detalle !== '' && (
            <p className="text-texto-sutil text-xs whitespace-pre-line">{detalle}</p>
          )}
        </div>

        {/* Al costado y no debajo: puesto en su propio renglon, el interruptor se repite veinticinco
            veces y termina pesando mas que lo que paso. Contra el margen derecho arma una columna que
            se lee de un vistazo. */}
        <InterruptorVisibilidad
          entrada={entrada}
          proyectoId={proyectoId}
          habilitado={habilitado}
          recargar={recargar}
        />
      </div>
    </li>
  )
}

interface PropsInterruptor {
  entrada: ActividadEspacio
  proyectoId: number
  habilitado: boolean
  recargar: () => void
}

/**
 * Interruptor de visibilidad de una entrada de actividad.
 *
 * Es optimista: pinta el cambio y lo revierte si el `PATCH` falla. Sin permiso queda deshabilitado
 * pero visible, para que se lea el valor actual.
 */
function InterruptorVisibilidad ({
  entrada,
  proyectoId,
  habilitado,
  recargar
}: PropsInterruptor): ReactElement {
  const [visible, setVisible] = useState(entrada.visible_to_customer)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Cambia la visibilidad. Nunca lanza: el fallo vuelve el interruptor a su valor anterior. */
  async function cambiar (siguiente: boolean): Promise<void> {
    const previo = visible

    setVisible(siguiente)
    setGuardando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyectoId}/activity/${entrada.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ visible_to_customer: siguiente })
      })

      if (!respuesta.ok) {
        setVisible(previo)
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      recargar()
    } catch {
      setVisible(previo)
      setFallo('No se pudo cambiar: revisá la conexión.')
    } finally {
      setGuardando(false)
    }
  }

  /*
   * Sin orbe a proposito. El cambio es optimista: la casilla ya se pinto en su valor nuevo, asi que
   * no hay nada que esperar en pantalla. Lo unico que falta comunicar es que todavia no esta
   * confirmado, y eso lo dice `aria-busy` con la casilla deshabilitada. Un indicador de carga al lado
   * de un valor que ya cambio es el orbe puesto sin logica, que es justo lo que se saco del producto.
   */
  return (
    <span className="flex shrink-0 items-center gap-2" aria-busy={guardando}>
      {fallo !== null && <span role="alert" className="text-texto-peligro text-xs">{fallo}</span>}

      {/* La etiqueta dice la frase entera y no "Sí"/"No": en la tabla el sentido lo daba el
          encabezado de la columna, y en una linea de tiempo no hay encabezado que lo de. */}
      <label className="text-texto-sutil flex items-center gap-1.5 py-1 text-[0.6875rem] whitespace-nowrap">
        <input
          type="checkbox"
          checked={visible}
          disabled={!habilitado || guardando}
          onChange={(evento) => { void cambiar(evento.target.checked) }}
          className="accent-acento size-4"
        />
        Visible para el cliente
      </label>
    </span>
  )
}
