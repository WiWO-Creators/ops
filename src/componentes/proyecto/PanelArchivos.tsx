'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { ArbolDrive } from '@/componentes/archivos/ArbolDrive'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { pedirSobre } from '@/datos/cliente'
import {
  ARCHIVOS,
  nombreDeArchivo,
  origenDeArchivo,
  rutaDeAdjuntos,
  type RaizDeAdjuntos
} from '@/definiciones/archivos'
import type { ArchivoProyecto } from '@/datos/recursos'

/**
 * Pestaña Archivos del Espacio: el arbol de Drive arriba, los adjuntos del panel abajo.
 *
 * Son dos almacenes distintos y por eso se muestran los dos. Drive (`tblwiwo_drive_*`) es el camino
 * nuevo; los adjuntos (`tblfiles`) son los que ya existian, y esconderlos no los borra: solo los
 * vuelve inalcanzables desde la ficha.
 *
 * @param proyectoId el proyecto que se esta mirando
 */
export function PanelArchivos ({ proyectoId }: { proyectoId: number }): ReactElement {
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
}

/** Estado de la carga. El error es un texto listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'listo', archivos: ArchivoProyecto[] }
  | { fase: 'error', mensaje: string }

/**
 * Los adjuntos de un Espacio o de un Proceso: listar, descargar, subir y borrar.
 *
 * No monta el motor de tabla a proposito. El endpoint no pagina, la definicion no declara filtros ni
 * busqueda, y el motor lee y escribe la query string de la pagina: dentro del modal de una Tarea eso
 * pelearia con el tablero que quedo abajo. Una tabla propia mantiene el estado donde vive el panel.
 *
 * La lista se repinta con la respuesta del POST, que devuelve el listado completo, y el borrado saca
 * la fila sin volver a pedir nada.
 */
export function PanelAdjuntos ({ raiz, id }: PropsPanelAdjuntos): ReactElement {
  const ruta = rutaDeAdjuntos(raiz, id)
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

  /** Saca del listado el adjunto que el backend ya borro. */
  const quitar = useCallback((archivoId: number) => {
    setCarga((actual) => (actual.fase === 'listo'
      ? { fase: 'listo', archivos: actual.archivos.filter((archivo) => archivo.id !== archivoId) }
      : actual))
  }, [])

  /** Reemplaza el listado con el que devolvio la subida. */
  const repintar = useCallback((archivos: ArchivoProyecto[]) => {
    setCarga({ fase: 'listo', archivos })
  }, [])

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-texto-tenue text-sm font-semibold">Adjuntos</h4>
        <SubirAdjunto ruta={ruta} onSubido={repintar} />
      </div>

      {carga.fase === 'cargando' && <Cargando mensaje="Cargando adjuntos…" />}

      {carga.fase === 'error' && (
        <ErrorEstado detalle={carga.mensaje} onReintentar={() => { setIntento((n) => n + 1) }} />
      )}

      {carga.fase === 'listo' && (
        carga.archivos.length === 0
          ? <p className="text-texto-tenue text-sm">Todavía no tiene adjuntos.</p>
          : <TablaAdjuntos ruta={ruta} archivos={carga.archivos} onEliminado={quitar} />
      )}
    </section>
  )
}

/** La grilla de adjuntos: las columnas de `ARCHIVOS` mas la de acciones. */
function TablaAdjuntos (
  { ruta, archivos, onEliminado }: {
    ruta: string
    archivos: ArchivoProyecto[]
    onEliminado: (archivoId: number) => void
  }
): ReactElement {
  return (
    <Tabla>
      <EncabezadoTabla>
        <tr>
          {ARCHIVOS.columnas.map((columna) => (
            <CeldaEncabezado key={columna.clave}>{columna.encabezado}</CeldaEncabezado>
          ))}
          <CeldaEncabezado><span className="sr-only">Acciones</span></CeldaEncabezado>
        </tr>
      </EncabezadoTabla>
      <CuerpoTabla>
        {archivos.map((archivo) => (
          <FilaTabla key={archivo.id}>
            {ARCHIVOS.columnas.map((columna) => (
              <CeldaTabla key={columna.clave}>
                {columna.clave === 'external' ? <Origen archivo={archivo} /> : columna.presentar(archivo)}
              </CeldaTabla>
            ))}
            <CeldaTabla>
              <Acciones ruta={ruta} archivo={archivo} onEliminado={onEliminado} />
            </CeldaTabla>
          </FilaTabla>
        ))}
      </CuerpoTabla>
    </Tabla>
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
  { ruta, archivo, onEliminado }: {
    ruta: string
    archivo: ArchivoProyecto
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

    const resultado = await escribirEnBff(`${ruta}/${encodeURIComponent(String(archivo.id))}`, 'DELETE')

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

      {error !== null && <p role="alert" className="text-texto-peligro w-full text-right text-xs">{error}</p>}
    </div>
  )
}

/**
 * Input de archivo oculto mas boton visible, para subir un adjunto.
 *
 * De a uno: el endpoint acepta hasta diez por peticion, pero el ayudante compartido de subida manda
 * un solo campo `file`, y multiplicarlo aca duplicaria logica que ya existe para ganar poco.
 */
function SubirAdjunto (
  { ruta, onSubido }: { ruta: string, onSubido: (archivos: ArchivoProyecto[]) => void }
): ReactElement {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Sube el archivo elegido y repinta la lista con el listado que devuelve el POST. */
  async function alElegirArchivo (evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0]

    // Se limpia antes de cualquier `await`: sin esto, volver a elegir el mismo archivo no dispara
    // otro `change` y el segundo intento no hace nada.
    evento.target.value = ''
    if (archivo === undefined) return

    setSubiendo(true)
    setError(null)

    const resultado = await subirArchivoEnBff<ArchivoProyecto[]>(ruta, archivo, 'file')

    setSubiendo(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    // El 201 trae el listado entero. Si no llego, el archivo se subio igual: decirlo es mas util que
    // dejar la tabla en blanco.
    if (!Array.isArray(resultado.datos)) {
      setError('Se subió, pero el listado no volvió. Vuelve a abrir la ficha para verlo.')
      return
    }

    onSubido(resultado.datos)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={entrada} type="file" className="sr-only" onChange={(e) => { void alElegirArchivo(e) }} />
      <Boton variante="secundario" tamano="chico" cargando={subiendo} onClick={() => { entrada.current?.click() }}>
        <Upload className="size-3.5" aria-hidden="true" />
        Subir adjunto
      </Boton>
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </div>
  )
}
