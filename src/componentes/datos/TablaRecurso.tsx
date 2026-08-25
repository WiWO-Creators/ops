'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { alternarOrden, construirConsulta, direccionDe, leerConsulta } from '@/datos/consulta'
import type { Columna, DefinicionRecurso, EstadoConsulta, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { Capacidad, Sobre, SobreError } from '@/datos/tipos'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { cn } from '@/lib/clases'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from './Tabla'
import { ControlesTabla, PaginacionTabla } from './ControlesTabla'
import {
  clavesVisiblesPorDefecto,
  columnasVisibles,
  mensajeDeError,
  podarPorPermisos,
  resolverInsignia,
  rutaDeAccion,
  type CuerpoError
} from './tabla'

/**
 * Motor de tabla declarativo.
 *
 * Renderiza la lista de cualquier recurso a partir de su `DefinicionRecurso`: doce modulos no
 * escriben doce tablas casi iguales, escriben doce definiciones.
 *
 * El estado de la vista vive en la URL y no en `useState`, a proposito: asi una vista filtrada se
 * comparte con un enlace, "atras" hace lo que la persona espera y recargar no la pierde. La URL usa
 * exactamente la query que entiende la API (`construirConsulta`), asi que no hay dos formatos que
 * mantener sincronizados.
 */

interface PropsTablaRecurso<T> {
  definicion: DefinicionRecurso<T>
  /** Primera pagina, ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<T>
  /** Identificador de la fila. Se usa como `key` de React y como `:id` de las acciones. */
  claveFila: (fila: T) => string | number
  /** Capacidades del area, de `permissions` de `/me`. Sin ellas no se ofrece ninguna accion. */
  capacidades?: Capacidad[]
  /**
   * Opciones de los filtros que las sacan de `/lookups`, indexadas por `Filtro.desdeLookup`.
   * Las resuelve el servidor: los catalogos de Perfex son configurables y pedirlos desde el
   * navegador haria aparecer los filtros despues de que la tabla ya se pinto.
   */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  className?: string
}

export function TablaRecurso<T> ({
  definicion,
  inicial,
  claveFila,
  capacidades = [],
  opcionesDeFiltro,
  className
}: PropsTablaRecurso<T>) {
  const router = useRouter()
  const params = useSearchParams()

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), definicion),
    [params, definicion]
  )
  const consulta = useMemo(() => construirConsulta(estado, definicion), [estado, definicion])

  // La consulta con la que llegaron los datos del servidor. Mientras la URL no se mueva de ahi no
  // hay nada que volver a pedir: pedirlo igual es una peticion de mas en cada montaje.
  const consultaInicial = useRef(consulta)

  const [resultado, setResultado] = useState<ResultadoLista<T>>(inicial)
  const [error, setError] = useState<CuerpoError | null>(null)
  const [cargando, setCargando] = useState(false)
  const [visibles, setVisibles] = useState(() => clavesVisiblesPorDefecto(definicion.columnas))

  useEffect(() => {
    if (consulta === consultaInicial.current) return

    const control = new AbortController()

    setCargando(true)

    void pedirLista<T>(definicion.ruta, consulta, control.signal).then((respuesta) => {
      if (control.signal.aborted) return

      setCargando(false)

      if (respuesta.ok) {
        setResultado(respuesta.resultado)
        setError(null)
      } else {
        setError(respuesta.error)
      }
    })

    return () => control.abort()
  }, [consulta, definicion.ruta])

  /** Aplica un cambio parcial del estado escribiendolo en la URL, que es su unica fuente. */
  function cambiar (parcial: Partial<EstadoConsulta>) {
    const siguiente = { ...estado, ...parcial }
    const query = construirConsulta(siguiente, definicion)

    // `replace` y no `push`: cada tecleo de filtro seria una entrada del historial y salir de la
    // vista con "atras" pasaria a ser imposible.
    router.replace(query === '' ? '?' : `?${query}`, { scroll: false })
  }

  const columnas = columnasVisibles(definicion.columnas, visibles)
  const acciones = podarPorPermisos(definicion.acciones, capacidades)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ControlesTabla
        definicion={definicion}
        estado={estado}
        visibles={visibles}
        opcionesDeFiltro={opcionesDeFiltro}
        onCambiar={cambiar}
        onVisibles={setVisibles}
      />

      {error !== null
        ? (
          <ErrorEstado
            detalle={mensajeDeError(error, definicion.filtros)}
            onReintentar={() => { router.refresh() }}
          />
          )
        : resultado.filas.length === 0
          ? <Vacio titulo={`No hay ${definicion.titulo.plural.toLowerCase()}`} descripcion="Probá quitando filtros o buscando otra cosa." />
          : (
            <div aria-busy={cargando} className={cn(cargando && 'opacity-60 transition-opacity')}>
              <Tabla>
                <EncabezadoTabla>
                  <tr>
                    {columnas.map((columna) => {
                      const direccion = columna.ordenPor === undefined
                        ? null
                        : direccionDe(estado.orden, columna.ordenPor)

                      return (
                        <CeldaEncabezado
                          key={columna.clave}
                          numerica={columna.numerica}
                          aria-sort={columna.ordenPor === undefined
                            ? undefined
                            : direccion === 'asc' ? 'ascending' : direccion === 'desc' ? 'descending' : 'none'}
                        >
                          {columna.ordenPor === undefined
                            ? columna.encabezado
                            : (
                              <button
                                type="button"
                                className="hover:text-texto inline-flex items-center gap-1"
                                onClick={() => { cambiar({ orden: alternarOrden(estado.orden, columna.ordenPor ?? ''), pagina: 1 }) }}
                              >
                                {columna.encabezado}
                                <Flecha direccion={direccion} />
                              </button>
                              )}
                        </CeldaEncabezado>
                      )
                    })}
                    {acciones.length > 0 && (
                      <CeldaEncabezado className="w-10">
                        <span className="sr-only">Acciones</span>
                      </CeldaEncabezado>
                    )}
                  </tr>
                </EncabezadoTabla>

                <CuerpoTabla>
                  {resultado.filas.map((fila) => (
                    <FilaTabla key={claveFila(fila)}>
                      {columnas.map((columna) => (
                        <CeldaTabla key={columna.clave} numerica={columna.numerica}>
                          <Celda columna={columna} fila={fila} catalogos={opcionesDeFiltro} />
                        </CeldaTabla>
                      ))}
                      {acciones.length > 0 && (
                        <CeldaTabla>
                          <MenuAcciones
                            acciones={acciones}
                            id={claveFila(fila)}
                            onError={setError}
                            onListo={() => { router.refresh() }}
                          />
                        </CeldaTabla>
                      )}
                    </FilaTabla>
                  ))}
                </CuerpoTabla>
              </Tabla>
            </div>
            )}

      <PaginacionTabla paginacion={resultado.paginacion} onCambiar={cambiar} />
    </div>
  )
}

/** Flecha de orden del encabezado. Sin direccion queda tenue: indica que la columna se puede ordenar. */
function Flecha ({ direccion }: { direccion: 'asc' | 'desc' | null }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 transition-transform', direccion === null && 'opacity-30', direccion === 'asc' && 'rotate-180')}
    >
      <path d="M12 5v14m0 0 6-6m-6 6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface PropsMenuAcciones {
  acciones: ReturnType<typeof podarPorPermisos>
  id: string | number
  onError: (error: CuerpoError) => void
  onListo: () => void
}

/** Menu de acciones de una fila. Al terminar refresca la vista: el backend es quien sabe como quedo. */
function MenuAcciones ({ acciones, id, onError, onListo }: PropsMenuAcciones) {
  const [enCurso, setEnCurso] = useState(false)

  async function ejecutar (ruta: string, metodo: 'POST' | 'DELETE') {
    setEnCurso(true)

    const respuesta = await fetch(`/api/bff/${rutaDeAccion(ruta, id)}`, { method: metodo })

    setEnCurso(false)

    if (respuesta.ok) {
      onListo()
      return
    }

    onError(await leerError(respuesta))
  }

  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton variante="sutil" tamano="chico" soloIcono cargando={enCurso} aria-label="Acciones">
          <span aria-hidden="true">⋯</span>
        </Boton>
      </DisparadorMenu>
      <ContenidoMenu align="end">
        {acciones.map((accion) => (
          <ItemMenu
            key={accion.clave}
            peligroso={accion.metodo === 'DELETE'}
            onSelect={() => { void ejecutar(accion.ruta, accion.metodo) }}
          >
            {accion.etiqueta}
          </ItemMenu>
        ))}
      </ContenidoMenu>
    </MenuContextual>
  )
}

type Respuesta<T> = { ok: true, resultado: ResultadoLista<T> } | { ok: false, error: CuerpoError }

/**
 * Pide una pagina al BFF.
 *
 * Nunca lanza por codigo de estado: el error del contrato es un valor mas, y la tabla tiene que
 * poder mostrarlo. Una respuesta sin JSON valido (un 502 del proxy) tambien sale como error.
 *
 * @param ruta primer segmento del recurso en la API
 * @param consulta query string ya armada, sin `?`
 * @param senal aborta la peticion cuando la consulta cambia antes de que llegue
 */
async function pedirLista<T> (ruta: string, consulta: string, senal: AbortSignal): Promise<Respuesta<T>> {
  try {
    const respuesta = await fetch(`/api/bff/${ruta}${consulta === '' ? '' : `?${consulta}`}`, { signal: senal })

    if (!respuesta.ok) return { ok: false, error: await leerError(respuesta) }

    const sobre = await respuesta.json() as Sobre<T[]>

    return { ok: true, resultado: { filas: sobre.data, paginacion: sobre.meta?.pagination } }
  } catch (fallo) {
    if (fallo instanceof DOMException && fallo.name === 'AbortError') {
      return { ok: false, error: { code: 'bad_request', message: 'Petición cancelada' } }
    }

    return {
      ok: false,
      error: { code: 'server_error', message: 'No se pudo contactar al servidor. Revisá tu conexión.' }
    }
  }
}

/** Lee el envelope de error del BFF, con un mensaje propio si la respuesta no trae JSON valido. */
async function leerError (respuesta: Response): Promise<CuerpoError> {
  try {
    const cuerpo = await respuesta.json() as SobreError

    if (cuerpo.error?.code !== undefined) return cuerpo.error
  } catch {
    // Un 502 del proxy devuelve HTML: se cae al mensaje generico de abajo.
  }

  return { code: 'server_error', message: `El servidor respondió ${respuesta.status}` }
}

/**
 * Contenido de una celda.
 *
 * Cuando la columna declara `comoInsignia`, el valor se resuelve contra el catalogo y se pinta con su
 * nombre y su color. Un valor que el catalogo no conoce cae al valor crudo: eso pasa cuando alguien
 * agrega un estado en Perfex y la pantalla todavia no lo recargo, y un id visible es mas util que una
 * celda vacia.
 */
function Celda<T> ({
  columna,
  fila,
  catalogos
}: {
  columna: Columna<T>
  fila: T
  catalogos: Record<string, OpcionFiltro[]> | undefined
}) {
  const contenido = columna.presentar(fila)

  if (columna.comoInsignia === undefined) return <>{contenido}</>

  const insignia = resolverInsignia(contenido, catalogos?.[columna.comoInsignia])

  if (insignia === null) return <>{contenido}</>

  return <Insignia color={insignia.color} tamano="chico">{insignia.etiqueta}</Insignia>
}
