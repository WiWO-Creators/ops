'use client'

import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { ArbolDrive } from '@/componentes/archivos/ArbolDrive'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { pedirSobre } from '@/datos/cliente'
import {
  ARCHIVOS,
  columnasDeArchivo,
  conVisibilidad,
  nombreDeArchivo,
  origenDeArchivo,
  rutaDeAdjuntos,
  rutaDeUnAdjunto,
  type RaizDeAdjuntos
} from '@/definiciones/archivos'
import type { ArchivoProyecto } from '@/datos/recursos'
import type { FuenteDeProyecto } from '@/dominio/fuente-proyecto'

/**
 * Pestaña Archivos del Espacio: el arbol de Drive arriba, los adjuntos del panel abajo.
 *
 * Son dos almacenes distintos y por eso se muestran los dos. Drive (`tblwiwo_drive_*`) es el camino
 * nuevo; los adjuntos (`tblproject_files`) son los que ya existian, y esconderlos no los borra: solo
 * los vuelve inalcanzables desde la ficha.
 *
 * **El cliente ve solo la mitad de abajo, y no es un recorte del dibujo.** Los adjuntos ya tienen
 * `visible_to_customer` por archivo, asi que su ruta del portal sirve exactamente los que el equipo
 * marco; Drive no tiene ese interruptor —ni una ruta del portal— y montarle el arbol al cliente le
 * abriria la carpeta entera del Espacio, con lo que nadie decidio compartirle adentro. Publicar
 * Drive al cliente es una decision de producto con su propio contrato, no una paridad de pantalla.
 *
 * @param proyectoId el proyecto que se esta mirando
 * @param fuente de donde bajan los datos; sin ella se asume el contrato del equipo
 */
export function PanelArchivos (
  { proyectoId, fuente }: { proyectoId: number, fuente?: FuenteDeProyecto }
): ReactElement {
  if (fuente?.sujeto === 'portal') {
    return (
      <PanelAdjuntos
        raiz="projects"
        id={proyectoId}
        ruta={fuente.archivos}
        puedeBorrar={false}
        esDelPortal
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ArbolDrive raiz="projects" id={proyectoId} />
      <PanelAdjuntos raiz="projects" id={proyectoId} />
    </div>
  )
}

interface PropsPanelAdjuntos {
  /** De que entidad cuelgan: Espacio (`projects`) o Proceso (`tasks`). */
  raiz: RaizDeAdjuntos
  /** Id de esa entidad, no el del archivo. */
  id: number
  /**
   * De donde se listan, si no es la ruta del equipo.
   *
   * El portal sirve los MISMOS adjuntos por otra ruta: `RecursoArchivos::deEspacio()` es una sola
   * funcion y emite una sola forma —`external`, `url` y `thumbnail_url` incluidos—; lo unico que
   * cambia es un `visible_to_customer = 1` en el `WHERE`. Por eso la tabla se comparte entera en vez
   * de copiarse.
   */
  ruta?: string
  /**
   * Si se ofrece eliminar cada adjunto y publicarlo u ocultarlo al cliente.
   *
   * `false` para el contacto: el portal es de solo lectura por construccion —su guarda rechaza todo
   * lo que no sea GET antes de mirar la ruta—, asi que el boton y el interruptor solo podrian fallar.
   */
  puedeBorrar?: boolean
  /**
   * Si quien mira es un contacto del cliente.
   *
   * Decide que columnas existen: la forma del portal no publica `visible_to_customer` ni `external`,
   * y dibujarlas contra una clave ausente pintaria «No» en todas las filas. Ver `columnasDeArchivo()`.
   */
  esDelPortal?: boolean
}

/** Estado de la carga. El error es un texto listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', archivos: ArchivoProyecto[] }
  | { fase: 'error', mensaje: string }

/**
 * Los adjuntos de un Espacio o de un Proceso: listar, descargar y borrar.
 *
 * No se sube por aca a proposito. `tblfiles` es el almacen heredado y se mantiene solo para que lo
 * que ya estaba siga alcanzable; todo archivo nuevo va al arbol de Drive, que es el camino unico.
 *
 * No monta el motor de tabla a proposito. El endpoint no pagina, la definicion no declara filtros ni
 * busqueda, y el motor lee y escribe la query string de la pagina: dentro del modal de una Tarea eso
 * pelearia con el tablero que quedo abajo. Una tabla propia mantiene el estado donde vive el panel.
 *
 * El borrado saca la fila del listado sin volver a pedir nada, y el interruptor de visibilidad la
 * cambia en el acto (optimista) y la devuelve a su valor si la API no lo confirma.
 */
export function PanelAdjuntos (
  { raiz, id, ruta: rutaPropia, puedeBorrar = true, esDelPortal = false }: PropsPanelAdjuntos
): ReactElement {
  const ruta = rutaPropia ?? rutaDeAdjuntos(raiz, id)
  const columnas = columnasDeArchivo(esDelPortal)
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<ArchivoProyecto[]>(ruta, control.signal)
      .then((sobre) => { setCarga({ fase: 'listo', archivos: sobre.data }) })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los adjuntos.'
        })
      })

    return () => { control.abort() }
  }, [ruta, intento])

  /** Cambia en el listado la visibilidad de un adjunto: al pulsar, y otra vez al revertir. */
  const marcarVisible = useCallback((archivoId: number, visible: boolean) => {
    setCarga((actual) => (actual.fase === 'listo'
      ? { fase: 'listo', archivos: conVisibilidad(actual.archivos, archivoId, visible) }
      : actual))
  }, [])

  /** Saca del listado el adjunto que el backend ya borro. */
  const quitar = useCallback((archivoId: number) => {
    setCarga((actual) => (actual.fase === 'listo'
      ? { fase: 'listo', archivos: actual.archivos.filter((archivo) => archivo.id !== archivoId) }
      : actual))
  }, [])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-texto-tenue text-sm font-semibold">Adjuntos</h4>
        {/* A quien no puede borrar no se le explica por que: "los archivos nuevos van a Drive" es
            una nota para el equipo sobre donde trabaja, y al cliente no le dice nada de lo suyo. */}
        {puedeBorrar && (
          <p className="text-texto-sutil text-xs">Los archivos nuevos van a Drive.</p>
        )}
      </div>

      {carga.fase === 'cargando' && <Cargando mensaje="Cargando adjuntos…" />}

      {carga.fase === 'error' && (
        <ErrorEstado detalle={carga.mensaje} onReintentar={() => { setIntento((n) => n + 1) }} />
      )}

      {carga.fase === 'listo' && (
        carga.archivos.length === 0
          ? <p className="text-texto-tenue text-sm">Todavía no tiene adjuntos.</p>
          : (
            <TablaAdjuntos
              ruta={ruta}
              archivos={carga.archivos}
              columnas={columnas}
              puedeBorrar={puedeBorrar}
              onEliminado={quitar}
              onVisibilidad={marcarVisible}
            />
            )
      )}
    </section>
  )
}

/**
 * La grilla de adjuntos: las columnas de `ARCHIVOS` mas la de acciones.
 *
 * "Visible para el cliente" es un interruptor para el equipo y texto para quien no puede escribir. Al
 * contacto ni siquiera le llega la columna (`columnasDeArchivo()`), asi que el interruptor no se
 * dibuja en el portal por dos caminos.
 */
function TablaAdjuntos (
  { ruta, archivos, columnas, puedeBorrar, onEliminado, onVisibilidad }: {
    ruta: string
    archivos: ArchivoProyecto[]
    columnas: typeof ARCHIVOS.columnas
    puedeBorrar: boolean
    onEliminado: (archivoId: number) => void
    onVisibilidad: (archivoId: number, visible: boolean) => void
  }
): ReactElement {
  return (
    <Tabla>
      <EncabezadoTabla>
        <tr>
          {columnas.map((columna) => (
            <CeldaEncabezado key={columna.clave}>{columna.encabezado}</CeldaEncabezado>
          ))}
          <CeldaEncabezado><span className="sr-only">Acciones</span></CeldaEncabezado>
        </tr>
      </EncabezadoTabla>
      <CuerpoTabla>
        {archivos.map((archivo) => (
          <FilaTabla key={archivo.id}>
            {columnas.map((columna) => (
              <CeldaTabla key={columna.clave}>
                <Celda
                  clave={columna.clave}
                  archivo={archivo}
                  texto={columna.presentar(archivo)}
                  ruta={ruta}
                  puedeEscribir={puedeBorrar}
                  onVisibilidad={onVisibilidad}
                />
              </CeldaTabla>
            ))}
            <CeldaTabla>
              <Acciones ruta={ruta} archivo={archivo} puedeBorrar={puedeBorrar} onEliminado={onEliminado} />
            </CeldaTabla>
          </FilaTabla>
        ))}
      </CuerpoTabla>
    </Tabla>
  )
}

/** Contenido de una celda: las dos columnas con dibujo propio, y el texto de la definicion para el resto. */
function Celda (
  { clave, archivo, texto, ruta, puedeEscribir, onVisibilidad }: {
    clave: string
    archivo: ArchivoProyecto
    texto: ReactNode
    ruta: string
    puedeEscribir: boolean
    onVisibilidad: (archivoId: number, visible: boolean) => void
  }
): ReactElement {
  if (clave === 'external') return <Origen archivo={archivo} />

  if (clave === 'visible_to_customer' && puedeEscribir) {
    return <VisibleParaElCliente ruta={ruta} archivo={archivo} onVisibilidad={onVisibilidad} />
  }

  return <>{texto}</>
}

/**
 * Interruptor "Visible para el cliente" de un adjunto.
 *
 * Optimista: el listado cambia al pulsar y vuelve al valor anterior si el `PATCH` falla, con el
 * motivo al lado. Mientras la API no contesta queda deshabilitado, para que un segundo clic no mande
 * un cambio encima de otro que todavia no se sabe si entro.
 */
function VisibleParaElCliente (
  { ruta, archivo, onVisibilidad }: {
    ruta: string
    archivo: ArchivoProyecto
    onVisibilidad: (archivoId: number, visible: boolean) => void
  }
): ReactElement {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nombre = nombreDeArchivo(archivo)

  /** Pide el cambio y, si la API no lo confirma, deja el valor como estaba. */
  async function cambiar (): Promise<void> {
    const previo = archivo.visible_to_customer
    const siguiente = !previo

    onVisibilidad(archivo.id, siguiente)
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff(rutaDeUnAdjunto(ruta, archivo.id), 'PATCH', { visible_to_customer: siguiente })

    setGuardando(false)

    if (!resultado.ok) {
      onVisibilidad(archivo.id, previo)
      setError(resultado.mensaje)
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2" aria-busy={guardando}>
      <Interruptor
        encendido={archivo.visible_to_customer}
        etiqueta={`Visible para el cliente: ${nombre}`}
        deshabilitado={guardando}
        onPulsar={() => { void cambiar() }}
      />
      {error !== null && <span role="alert" className="text-texto-peligro text-xs">{error}</span>}
    </span>
  )
}

/**
 * Origen del archivo: enlace externo cuando lo hay, o la leyenda de interno.
 *
 * Los externos son los adjuntos viejos de Google Drive que quedaron en `tblfiles`: no tienen binario
 * propio, asi que lo unico que se puede ofrecer es abrir el enlace.
 */
function Origen ({ archivo }: { archivo: ArchivoProyecto }): ReactElement {
  const origen = origenDeArchivo(archivo)

  if (origen.tipo !== 'externo') return <span className="text-texto-sutil text-xs">Interno</span>

  return (
    <a
      href={origen.enlace}
      target="_blank"
      rel="noreferrer"
      className="text-acento text-xs font-semibold underline underline-offset-4"
    >
      Abrir en {origen.servicio}
    </a>
  )
}

/**
 * Descarga y borrado de una fila.
 *
 * La descarga va por el BFF y no por `/api/v1`: el token vive en una cookie que solo lee el proxy, y
 * un `<a>` contra la API devolveria `401`. Los externos no tienen boton porque no hay binario que
 * bajar; su enlace ya esta en la columna de origen.
 */
function Acciones (
  { ruta, archivo, puedeBorrar, onEliminado }: {
    ruta: string
    archivo: ArchivoProyecto
    puedeBorrar: boolean
    onEliminado: (archivoId: number) => void
  }
): ReactElement {
  const origen = origenDeArchivo(archivo)
  const nombre = nombreDeArchivo(archivo)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Borra en el backend y, solo si respondio bien, saca la fila del listado. */
  async function eliminar (): Promise<void> {
    if (!window.confirm(`¿Eliminar "${nombre}"? No se puede deshacer.`)) return

    setEliminando(true)
    setError(null)

    const resultado = await escribirEnBff(rutaDeUnAdjunto(ruta, archivo.id), 'DELETE')

    setEliminando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onEliminado(archivo.id)
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {origen.tipo === 'descargable' && (
        <a
          href={origen.ruta}
          download={nombre}
          aria-label={`Descargar ${nombre}`}
          className="text-texto-tenue hover:bg-hover hover:text-acento rounded-control inline-flex size-8 items-center justify-center"
        >
          <Download className="size-3.5" aria-hidden="true" />
        </a>
      )}

      {puedeBorrar && (
        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          cargando={eliminando}
          aria-label={`Eliminar ${nombre}`}
          onClick={() => { void eliminar() }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Boton>
      )}

      {error !== null && <p role="alert" className="text-texto-peligro w-full text-right text-xs">{error}</p>}
    </div>
  )
}
