'use client'

import { Suspense, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { Lookups } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * Pestaña de listado generica del detalle de Proyecto.
 *
 * Doce pestañas no escriben doce tablas: escriben una definicion y montan esto. La definicion llega
 * ya acotada al proyecto (`projects/{id}/tickets`), porque acotar por ruta y no por filtro deja el
 * proyecto fuera de la URL, donde seria editable y borrable por quien mira.
 *
 * Los datos se piden **desde el navegador**, no bajan resueltos del servidor: la pagina monta solo la
 * pestaña activa, asi que una pestaña que nadie abre no cuesta ninguna peticion. Ese es el motivo de
 * que estos paneles sean componentes cliente y no fragmentos de servidor.
 */

interface PropsPanelRecurso<T> {
  /** La definicion con la `ruta` ya apuntando al subrecurso del proyecto. */
  definicion: DefinicionRecurso<T>
  claveFila: (fila: T) => string | number
  /** Capacidades del area, de `permissions` de `/me`. Sin ellas no se ofrece ninguna accion. */
  capacidades?: Capacidad[]
  /** Botonera propia de la pestaña ("Nuevo hito", "Nueva nota"…). Se pinta sobre la tabla. */
  barra?: ReactNode
  /**
   * Cambia cuando la pestaña escribio algo. Remonta la tabla para que vuelva a pedir la pagina: la
   * tabla se refresca sola al cambiar la URL, y crear un registro no cambia la URL.
   */
  revision?: number
}

export function PanelRecurso<T> (props: PropsPanelRecurso<T>): ReactElement {
  // `TablaRecurso` y este panel leen `useSearchParams`. Sin este limite de Suspense falla el build de
  // cualquier pagina que los monte.
  return (
    <Suspense fallback={<Cargando filas={6} />}>
      <ListaDelProyecto {...props} />
    </Suspense>
  )
}

/** Estado de la carga inicial. El error es un texto listo para mostrar, no un envelope. */
type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'listo', inicial: ResultadoLista<T>, opciones: Record<string, OpcionFiltro[]> }
  | { fase: 'error', mensaje: string }

function ListaDelProyecto<T> ({
  definicion,
  claveFila,
  capacidades = [],
  barra,
  revision = 0
}: PropsPanelRecurso<T>): ReactElement {
  const params = useSearchParams()

  // La consulta con la que se pide la primera pagina es la que la URL tiene AL MONTAR: es la que
  // `TablaRecurso` considera suya, y pedir otra la dejaria mostrando datos que nadie pidio.
  const consulta = useMemo(
    () => construirConsulta(leerConsulta(new URLSearchParams(params.toString()), definicion), definicion),
    [params, definicion]
  )
  const consultaDeMontaje = useRef(consulta)

  const [carga, setCarga] = useState<Carga<T>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${definicion.ruta}|0|0`)

  // Volver a "cargando" en el render y no en el efecto: al cambiar de recurso o despues de escribir,
  // los datos viejos seguirian en pantalla un instante. React admite este `setState` durante el
  // render y es lo que la regla de hooks pide en vez de encadenar renders desde el efecto.
  const actual = `${definicion.ruta}|${intento}|${revision}`
  if (peticion !== actual) {
    setPeticion(actual)
    setCarga({ fase: 'cargando' })
  }

  /** Vuelve a la fase de carga y dispara el efecto otra vez. */
  function reintentar (): void {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  useEffect(() => {
    const control = new AbortController()

    void primeraPagina(definicion, consultaDeMontaje.current, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [definicion, intento, revision])

  if (carga.fase === 'cargando') {
    return (
      <div className="flex flex-col gap-3">
        {barra}
        <Cargando filas={6} />
      </div>
    )
  }

  if (carga.fase === 'error') {
    return (
      <div className="flex flex-col gap-3">
        {barra}
        <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {barra}
      <TablaRecurso
        key={revision}
        definicion={definicion}
        inicial={carga.inicial}
        claveFila={claveFila}
        capacidades={capacidades}
        opcionesDeFiltro={carga.opciones}
      />
    </div>
  )
}

/**
 * Pide la primera pagina y los catalogos de los filtros.
 *
 * Van juntos: sin los catalogos, un estado se pinta como numero crudo y los selectores de filtro
 * salen vacios, asi que mostrar la tabla antes de tenerlos es mostrarla a medias.
 *
 * Nunca lanza: el error del contrato es un valor mas, y la pantalla tiene que poder mostrarlo.
 *
 * @param definicion la definicion ya acotada al proyecto
 * @param consulta query string sin `?`
 * @param senal aborta las dos peticiones si el componente se desmonta
 * @returns el estado de carga resuelto, `listo` o `error`
 */
async function primeraPagina<T> (
  definicion: DefinicionRecurso<T>,
  consulta: string,
  senal: AbortSignal
): Promise<Carga<T>> {
  try {
    const [lista, lookups] = await Promise.all([
      pedirSobre<T[]>(`${definicion.ruta}${consulta === '' ? '' : `?${consulta}`}`, senal),
      pedirSobre<Lookups>('lookups', senal)
    ])

    return {
      fase: 'listo',
      inicial: { filas: lista.data, paginacion: lista.meta?.pagination },
      opciones: opcionesDeFiltros(definicion, lookups.data)
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return {
      fase: 'error',
      mensaje: fallo instanceof Error
        ? fallo.message
        : `No se pudo cargar ${definicion.titulo.plural.toLowerCase()}.`
    }
  }
}
