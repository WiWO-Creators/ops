'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderPlus, Trash2, Upload, Users, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { mensajeDeRespuesta, pedirRespuesta, pedirSobre } from '@/datos/cliente'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type {
  ArchivoDriveSubido, DriveCliente, DriveTarea, MiembroEquipo, NodoDrive, PermisoDrive, RaizDrive,
  RolPermisoDrive, SujetoPermisoDrive
} from '@/datos/recursos'

/** Ancho de la sangria por nivel del arbol, en rem. */
const SANGRIA_POR_NIVEL = 1.25

type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: T }

/**
 * Lo que trae `GET /{raiz}/{id}/drive` para cualquiera de las tres raices.
 *
 * `folder` sale de `DriveTarea`, que es la forma minima comun a los tres endpoints. `letras` y
 * `patente` son opcionales porque cada endpoint manda solo el campo que le corresponde: los tipos
 * exactos (`DriveCliente`, `DriveEspacio`, `DriveTarea`) quedan en `recursos.ts` para quien consuma
 * cada endpoint por separado.
 */
interface DatosDrive extends DriveTarea {
  letras?: string | null
  patente?: string | null
}

interface Props {
  raiz: RaizDrive
  id: number
}

/** Por que una entidad puede no tener carpeta todavia. Cambia por raiz: no todas nacen igual. */
const SIN_CARPETA: Record<RaizDrive, string> = {
  clients: `Este ${GLOSARIO.cliente.singular} es anterior a esta función, así que no se le creó sola.`,
  projects: `Este ${GLOSARIO.espacio.singular} es anterior a esta función, así que no se le creó sola.`,
  tasks: `Esta ${GLOSARIO.proceso.singular} es anterior a esta función, así que no se le creó sola.`
}

/**
 * Que hace el boton de crear, en las tres raices por igual.
 *
 * Va junto al motivo porque el vacio ya no es solo una explicacion: quien lo lee tiene algo que
 * apretar, y necesita saber que no va a quedar una carpeta a medias ni distinta de las automaticas.
 */
const AL_CREAR = 'Se puede crear ahora: queda igual que una nueva, con las carpetas que falten arriba y los mismos accesos.'

/**
 * Ultimo recurso cuando el `POST` contesta 2xx pero con `folder: null`.
 *
 * No es un error de negocio —esos vienen con su propio mensaje y se muestran tal cual—, es el
 * contrato incumplido. Se dice igual porque volver a dibujar el mismo vacio, sin una linea, se lee
 * como que el boton no hizo nada.
 */
const CREADA_SIN_CARPETA = 'El servidor respondió sin carpeta: no quedó creada. Probá de nuevo y, si sigue igual, avisá a quien administre el sistema.'

/**
 * Arbol de carpetas de Drive de un Cliente, un Espacio o una Tarea, para la pestaña Archivos.
 *
 * Pide desde el navegador porque es una pestaña que puede no abrirse nunca. `folder: null` es una
 * entidad anterior a esta funcion, que nunca tuvo backfill: es un vacio normal, no un error, y se
 * resuelve creando la carpeta a mano desde el propio vacio.
 */
export function ArbolDrive ({ raiz, id }: Props) {
  const [carga, setCarga] = useState<Carga<DatosDrive>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<DatosDrive>(`${raiz}/${id}/drive`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', datos: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el árbol de Drive.'
        })
      })

    return () => { control.abort() }
  }, [raiz, id, intento])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-40" mensaje="Cargando Drive…" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  const { datos } = carga
  const { folder } = datos

  /** Agrega el archivo recien subido a la raiz del arbol, sin volver a pedir todo. */
  const agregarEnRaiz = (nuevo: NodoDrive): void => {
    if (folder === null) return
    setCarga({ fase: 'listo', datos: { ...datos, folder: { ...folder, children: [...folder.children, nuevo] } } })
  }

  /**
   * Crea la carpeta que la entidad no tiene y deja la pestaña mostrandola, sin recargar.
   *
   * El `POST` es idempotente y devuelve el mismo cuerpo que el `GET`, asi que alcanza con reemplazar
   * los datos: la pestaña pasa del vacio al arbol sin recargar. Un 2xx sin cuerpo no dice nada de la
   * carpeta y se resuelve pidiendo el `GET` de nuevo; el tipo lleva `| undefined` porque eso es lo
   * que `escribirEnBff` devuelve ahi.
   *
   * El error se muestra tal como lo manda el backend: "Drive no configurado" o "esta Tarea no cuelga
   * de un Espacio" no son fallas de la pantalla, y el boton queda habilitado para reintentar —el
   * `POST` es idempotente, asi que reintentar nunca deja dos carpetas.
   */
  const crearCarpeta = async (): Promise<void> => {
    setCreando(true)
    setErrorCrear(null)

    const resultado = await escribirEnBff<DatosDrive | undefined>(`${raiz}/${id}/drive`, 'POST')

    setCreando(false)

    if (!resultado.ok) {
      setErrorCrear(resultado.mensaje)
      return
    }

    if (resultado.datos === undefined) {
      reintentar()
      return
    }

    if (resultado.datos.folder === null) {
      setErrorCrear(CREADA_SIN_CARPETA)
      return
    }

    setCarga({ fase: 'listo', datos: resultado.datos })
  }

  /** Saca un archivo de la raiz del arbol, tras borrarlo en el backend. */
  const eliminarDeRaiz = (idEliminado: string): void => {
    if (folder === null) return
    setCarga({
      fase: 'listo',
      datos: { ...datos, folder: { ...folder, children: folder.children.filter((h) => h.id !== idEliminado) } }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {raiz === 'clients' && (
        <CodigoCliente
          clienteId={id}
          letrasActuales={datos.letras ?? null}
          onActualizado={(letras) => { setCarga({ fase: 'listo', datos: { ...datos, letras } }) }}
        />
      )}

      {raiz === 'projects' && datos.patente !== null && datos.patente !== undefined && (
        <p className="text-texto-tenue text-sm">
          Patente: <span className="text-texto font-medium">{datos.patente}</span>
        </p>
      )}

      {folder === null
        ? (
          <Vacio
            titulo="Todavía no tiene carpeta en Drive"
            descripcion={`${SIN_CARPETA[raiz]} ${AL_CREAR}`}
            accion={
              <div className="flex flex-col items-center gap-2">
                <Boton
                  variante="primario"
                  tamano="chico"
                  cargando={creando}
                  onClick={() => { void crearCarpeta() }}
                >
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                  Crear carpeta en Drive
                </Boton>

                {errorCrear !== null && (
                  <p role="alert" className="text-texto-peligro max-w-prose text-sm">{errorCrear}</p>
                )}
              </div>
            }
          />
          )
        : (
          <>
            <SubirArchivoDrive folderId={folder.id} onSubido={agregarEnRaiz} />

            {folder.children.length === 0
              ? <p className="text-texto-tenue text-sm">Está vacía.</p>
              : (
                <ul className="flex flex-col gap-0.5">
                  {folder.children.map((nodo) => (
                    <NodoArbol key={nodo.id} nodo={nodo} nivel={0} folderId={folder.id} onEliminado={eliminarDeRaiz} />
                  ))}
                </ul>
                )}

            <AccesosDrive folderId={folder.id} raiz={raiz} />
          </>
          )}
    </div>
  )
}

/** Convierte la respuesta de subida en un nodo del arbol, para insertarlo sin volver a pedir la carpeta. */
function nodoDeSubida (subido: ArchivoDriveSubido): NodoDrive {
  return {
    id: String(subido.id),
    name: subido.name,
    is_folder: subido.is_folder,
    web_view_link: subido.web_view_link,
    uploaded_by: subido.uploaded_by,
    size_bytes: subido.size_bytes,
    mime_type: subido.mime_type
  }
}

/** Input de archivo oculto + boton visible, para subir un archivo a una carpeta puntual del árbol. */
function SubirArchivoDrive ({ folderId, onSubido }: { folderId: string, onSubido: (nodo: NodoDrive) => void }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function alElegirArchivo (evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (archivo === undefined) return

    setSubiendo(true)
    setError(null)

    const resultado = await subirArchivoEnBff<ArchivoDriveSubido>(
      `drive/${encodeURIComponent(folderId)}/files`, archivo, 'file'
    )

    setSubiendo(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onSubido(nodoDeSubida(resultado.datos))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={entrada} type="file" className="sr-only" onChange={(e) => { void alElegirArchivo(e) }} />
      <Boton variante="secundario" tamano="chico" cargando={subiendo} onClick={() => { entrada.current?.click() }}>
        <Upload className="size-3.5" aria-hidden="true" />
        Subir archivo
      </Boton>
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </div>
  )
}

interface PropsNodoArbol {
  nodo: NodoDrive
  nivel: number
  /** Id de la carpeta que contiene a `nodo`: la que se manda en las rutas de borrado/subida de `nodo`. */
  folderId: string
  /** Avisa a quien lista a `nodo` que lo saque, tras borrarlo en el backend. Solo lo usan los archivos. */
  onEliminado?: (id: string) => void
}

/** Una fila del arbol: carpeta expandible o archivo con enlace directo. */
function NodoArbol ({ nodo, nivel, folderId, onEliminado }: PropsNodoArbol) {
  const [abierto, setAbierto] = useState(false)
  const [hijos, setHijos] = useState<Carga<NodoDrive[]> | null>(null)
  const [permisosAbierto, setPermisosAbierto] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null)
  const sangria = { paddingLeft: `${nivel * SANGRIA_POR_NIVEL + 0.5}rem` }

  const cargarHijos = useCallback(() => {
    setHijos({ fase: 'cargando' })

    void pedirSobre<{ children: NodoDrive[] }>(`drive/${encodeURIComponent(nodo.id)}`, new AbortController().signal)
      .then((sobre) => { setHijos({ fase: 'listo', datos: sobre.data.children }) })
      .catch((fallo: unknown) => {
        setHijos({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar esta carpeta.'
        })
      })
  }, [nodo.id])

  // Se pide una sola vez: colapsar y volver a abrir la misma carpeta reusa lo que ya llego, y el
  // arbol de Drive no cambia mientras dura la sesion como para justificar refrescarlo cada vez.
  const alternar = useCallback(() => {
    setAbierto((estaba) => !estaba)
    if (hijos === null) cargarHijos()
  }, [hijos, cargarHijos])

  /** Agrega un archivo recien subido a los propios hijos ya cargados. */
  const agregarHijo = useCallback((nuevo: NodoDrive) => {
    setHijos((actual) => (actual !== null && actual.fase === 'listo'
      ? { fase: 'listo', datos: [...actual.datos, nuevo] }
      : actual))
  }, [])

  /** Saca un hijo propio ya cargado, tras borrarlo en el backend. */
  const eliminarHijo = useCallback((id: string) => {
    setHijos((actual) => (actual !== null && actual.fase === 'listo'
      ? { fase: 'listo', datos: actual.datos.filter((h) => h.id !== id) }
      : actual))
  }, [])

  if (!nodo.is_folder) {
    async function eliminar (): Promise<void> {
      if (!window.confirm(`¿Eliminar "${nodo.name}"? No se puede deshacer.`)) return

      setEliminando(true)
      setErrorEliminar(null)

      const resultado = await escribirEnBff(
        `drive/${encodeURIComponent(folderId)}/files/${encodeURIComponent(nodo.id)}`, 'DELETE'
      )

      setEliminando(false)

      if (!resultado.ok) {
        setErrorEliminar(resultado.mensaje)
        return
      }

      onEliminado?.(nodo.id)
    }

    return (
      <li>
        <div style={sangria} className="flex items-center gap-1.5 rounded-chico py-1 pr-1.5">
          <a
            href={nodo.web_view_link}
            target="_blank"
            rel="noreferrer"
            className="text-texto hover:text-acento flex min-w-0 flex-1 items-center gap-1.5 text-sm"
          >
            <File className="text-texto-sutil size-4 shrink-0" />
            <span className="truncate">{nodo.name}</span>
          </a>
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            cargando={eliminando}
            aria-label={`Eliminar ${nodo.name}`}
            onClick={() => { void eliminar() }}
          >
            <Trash2 className="size-3.5" />
          </Boton>
        </div>
        {errorEliminar !== null && (
          <p role="alert" style={sangria} className="text-texto-peligro text-xs">{errorEliminar}</p>
        )}
      </li>
    )
  }

  return (
    <li>
      <div style={sangria} className="flex items-center gap-1.5 rounded-chico py-1 pr-1.5">
        <button
          type="button"
          onClick={alternar}
          className={cn('text-texto hover:text-acento flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm')}
        >
          {abierto ? <ChevronDown className="text-texto-sutil size-3.5 shrink-0" /> : <ChevronRight className="text-texto-sutil size-3.5 shrink-0" />}
          <Folder className="text-texto-sutil size-4 shrink-0" />
          <span className="truncate">{nodo.name}</span>
        </button>
        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          aria-label={`Permisos de ${nodo.name}`}
          onClick={() => { setPermisosAbierto(true) }}
        >
          <Users className="size-3.5" />
        </Boton>
      </div>

      {permisosAbierto && (
        <DialogoPermisosDrive folderId={nodo.id} nombre={nodo.name} onCerrar={() => { setPermisosAbierto(false) }} />
      )}

      {abierto && hijos !== null && (
        hijos.fase === 'cargando'
          ? <Cargando alto="min-h-16" />
          : hijos.fase === 'error'
            ? <ErrorEstado detalle={hijos.mensaje} onReintentar={cargarHijos} />
            : (
              <>
                <div style={{ paddingLeft: `${(nivel + 1) * SANGRIA_POR_NIVEL + 0.5}rem` }}>
                  <SubirArchivoDrive folderId={nodo.id} onSubido={agregarHijo} />
                </div>

                {hijos.datos.length === 0
                  ? <p className="text-texto-tenue text-xs" style={{ paddingLeft: `${(nivel + 1) * SANGRIA_POR_NIVEL + 0.5}rem` }}>Está vacía.</p>
                  : (
                    <ul className="flex flex-col gap-0.5">
                      {hijos.datos.map((hijo) => (
                        <NodoArbol key={hijo.id} nodo={hijo} nivel={nivel + 1} folderId={nodo.id} onEliminado={eliminarHijo} />
                      ))}
                    </ul>
                    )}
              </>
              )
      )}
    </li>
  )
}

/** Input del codigo de 3 letras del Cliente, que fija el nombre de su carpeta en Drive. */
function CodigoCliente ({ clienteId, letrasActuales, onActualizado }: {
  clienteId: number
  letrasActuales: string | null
  onActualizado: (letras: string) => void
}) {
  const [letras, setLetras] = useState(letrasActuales ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const sucio = letras !== (letrasActuales ?? '')

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(undefined)

    const resultado = await escribirEnBff<DriveCliente>(`clients/${clienteId}/drive`, 'PATCH', { letras })

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onActualizado(resultado.datos.letras ?? letras)
  }

  return (
    <div className="flex items-end gap-2">
      <Campo etiqueta="Código de 3 letras" error={error} className="max-w-32">
        {(props) => (
          <Entrada
            {...props}
            value={letras}
            maxLength={3}
            placeholder="ABC"
            onChange={(evento) => {
              setLetras(evento.target.value.toUpperCase())
              setError(undefined)
            }}
          />
        )}
      </Campo>

      <Boton
        variante="secundario"
        tamano="chico"
        cargando={guardando}
        disabled={!sucio || letras.length !== 3}
        onClick={() => { void guardar() }}
      >
        Guardar
      </Boton>
    </div>
  )
}

type CargaPermisos =
  | { fase: 'cargando' }
  /** 404 del backend: esta carpeta no lleva lista de permisos. Es un vacio, no un fallo. */
  | { fase: 'no-gestionable', mensaje: string }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: PermisoDrive[] }

const ETIQUETAS_ROL: Record<RolPermisoDrive, string> = {
  writer: 'Editor',
  commenter: 'Comentador',
  reader: 'Lector'
}

/**
 * Roles que se pueden dar a mano desde acá.
 *
 * `reader` no esta: es el que el backend le pone solo a los contactos del cliente, y el alta manual
 * de esta pantalla es por `staff_id`, o sea siempre alguien del equipo.
 */
const ROLES_MANUALES: RolPermisoDrive[] = ['writer', 'commenter']

/** De donde sale el permiso que el backend sincroniza solo, por raiz. */
const ORIGEN_PERMISOS: Record<RaizDrive, string> = {
  clients: `quien puede ver el ${GLOSARIO.cliente.singular} entra como Editor y sus contactos activos como Lectores`,
  projects: `los miembros del ${GLOSARIO.espacio.singular} entran como Editores`,
  tasks: 'el encargado entra como Editor y el revisor como Comentador'
}

/** Titulo de cada grupo de la lista de accesos. Separa al equipo de la gente del cliente. */
const TITULOS_SUJETO: Record<SujetoPermisoDrive, string> = {
  staff: 'Equipo',
  contact: `Contactos del ${GLOSARIO.cliente.singular}`
}

/**
 * Quien tiene acceso a la carpeta, a la vista en la propia pestaña Archivos.
 *
 * Va desplegado y no detras de un dialogo porque la pregunta que responde —"¿quien ve esto?"— es
 * justamente la que hoy obliga a abrir Drive para contestar. La bajada dice de donde sale cada
 * permiso: la lista refleja lo que Drive tiene, no una intencion guardada de este lado.
 *
 * @param folderId la carpeta de Drive cuyos accesos se listan
 * @param raiz la entidad de la que cuelga, para explicar que sincroniza el backend
 */
function AccesosDrive ({ folderId, raiz }: { folderId: string, raiz: RaizDrive }) {
  return (
    <section className="border-linea rounded-tarjeta flex flex-col gap-3 border p-3">
      <header className="flex flex-col gap-0.5">
        <h4 className="text-texto-tenue text-sm font-semibold">Quién tiene acceso</h4>
        <p className="text-texto-sutil text-xs">
          Es el permiso real en Drive: {ORIGEN_PERMISOS[raiz]}, y abajo se agrega o se quita a quien haga falta.
        </p>
      </header>

      <GestorPermisosDrive folderId={folderId} />
    </section>
  )
}

/**
 * La lista de accesos de una carpeta de Drive, con su alta y su baja manual.
 *
 * Es el mismo bloque que muestran el dialogo de una subcarpeta y la seccion desplegada de la
 * pestaña: una sola implementacion, dos marcos.
 *
 * El 404 de "esta carpeta no lleva permisos" se distingue de un error real pidiendo la respuesta
 * cruda (`pedirRespuesta`) en vez de `pedirSobre`, que descarta el status junto con el resto de la
 * respuesta.
 *
 * @param folderId la carpeta de Drive sobre la que se leen y escriben los permisos
 */
function GestorPermisosDrive ({ folderId }: { folderId: string }) {
  const [carga, setCarga] = useState<CargaPermisos>({ fase: 'cargando' })
  const [personal, setPersonal] = useState<MiembroEquipo[]>([])
  const [staffId, setStaffId] = useState('')
  const [rol, setRol] = useState<RolPermisoDrive>('writer')
  const [agregando, setAgregando] = useState(false)
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirRespuesta(`drive/${encodeURIComponent(folderId)}/permissions`, control.signal)
      .then(async (respuesta) => {
        if (control.signal.aborted) return

        if (!respuesta.ok) {
          const mensaje = await mensajeDeRespuesta(respuesta)
          setCarga(respuesta.status === 404 ? { fase: 'no-gestionable', mensaje } : { fase: 'error', mensaje })
          return
        }

        const sobre = await respuesta.json() as { data: PermisoDrive[] }
        setCarga({ fase: 'listo', datos: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los permisos.'
        })
      })

    return () => { control.abort() }
  }, [folderId, intento])

  // El catalogo de personal solo hace falta si la carpeta resulta gestionable, y recien ahi se pide.
  useEffect(() => {
    if (carga.fase !== 'listo' || personal.length > 0) return

    const control = new AbortController()

    void pedirSobre<MiembroEquipo[]>('staff?per_page=100&filter[active]=1', control.signal)
      .then((sobre) => { setPersonal(sobre.data) })
      .catch(() => {}) // La lista de permisos ya cargo bien: el formulario de alta queda sin opciones.

    return () => { control.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga.fase])

  /** Da de alta o cambia el rol de una persona (`POST` es upsert). */
  async function agregar (): Promise<void> {
    if (staffId === '') return

    setAgregando(true)
    setErrorFormulario(null)

    const resultado = await escribirEnBff<{ staff_id: number, role: RolPermisoDrive }>(
      `drive/${encodeURIComponent(folderId)}/permissions`, 'POST', { staff_id: Number(staffId), role: rol }
    )

    setAgregando(false)

    if (!resultado.ok) {
      setErrorFormulario(resultado.mensaje)
      return
    }

    // Se relee en vez de insertar la fila a mano: el alta puede haber quedado sin acceso —correo sin
    // cuenta de Google— y solo el backend sabe en que `estado` quedo.
    setIntento((n) => n + 1)
    setStaffId('')
  }

  /** Quita el acceso de una persona. El backend puede volver a ponerlo si la entidad lo implica. */
  async function quitar (staffIdAQuitar: number): Promise<void> {
    if (carga.fase !== 'listo') return

    setErrorFormulario(null)
    const resultado = await escribirEnBff(`drive/${encodeURIComponent(folderId)}/permissions/${staffIdAQuitar}`, 'DELETE')

    if (!resultado.ok) {
      setErrorFormulario(resultado.mensaje)
      return
    }

    setCarga({ fase: 'listo', datos: carga.datos.filter((p) => p.staff_id !== staffIdAQuitar) })
  }

  if (carga.fase === 'cargando') return <Cargando alto="min-h-24" mensaje="Cargando accesos…" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />
  if (carga.fase === 'no-gestionable') return <p className="text-texto-tenue text-sm">{carga.mensaje}</p>

  return (
    <div className="flex flex-col gap-4">
      {carga.datos.length === 0
        ? <p className="text-texto-tenue text-sm">Todavía no figura nadie con acceso a esta carpeta.</p>
        : <ListaAccesos permisos={carga.datos} onQuitar={(staffId) => { void quitar(staffId) }} />}

      <div className="border-linea flex flex-wrap items-end gap-2 border-t pt-4">
        <Campo etiqueta="Persona" className="min-w-40 flex-1">
          {(props) => (
            <Selector value={staffId} onValueChange={setStaffId}>
              <DisparadorSelector marcador="Elegí una persona" id={props.id} />
              <ContenidoSelector>
                {personal.map((persona) => (
                  <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <Campo etiqueta="Rol" className="w-36">
          {(props) => (
            <Selector value={rol} onValueChange={(valor) => { setRol(valor as RolPermisoDrive) }}>
              <DisparadorSelector id={props.id} />
              <ContenidoSelector>
                {ROLES_MANUALES.map((valor) => (
                  <Opcion key={valor} value={valor}>{ETIQUETAS_ROL[valor]}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <Boton
          variante="secundario"
          tamano="chico"
          cargando={agregando}
          disabled={staffId === ''}
          onClick={() => { void agregar() }}
        >
          Agregar
        </Boton>
      </div>

      {errorFormulario !== null && <p role="alert" className="text-texto-peligro text-sm">{errorFormulario}</p>}
    </div>
  )
}

/**
 * La lista de accesos, separando al equipo de los contactos del cliente.
 *
 * Los dos grupos no se mezclan porque no son lo mismo: el equipo edita y los contactos solo miran
 * desde el portal. Mientras el backend no distinga el sujeto —`subject_type` ausente— todas las filas
 * son del equipo y la lista sale plana, sin titulos que separen un solo grupo.
 *
 * Aparte va un tercer grupo con la gente que quedo sin acceso porque su correo no tiene cuenta de
 * Google: no puede ir con el resto, porque el titulo de la seccion promete "quien tiene acceso" y
 * esa gente no lo tiene. Su rol se sigue mostrando, que es lo que va a recibir cuando cree la cuenta.
 *
 * @param permisos las filas tal como las devolvio la API
 * @param onQuitar saca a alguien del equipo de la carpeta
 */
function ListaAccesos ({ permisos, onQuitar }: {
  permisos: PermisoDrive[]
  onQuitar: (staffId: number) => void
}) {
  const otorgados = permisos.filter((permiso) => (permiso.estado ?? 'otorgado') === 'otorgado')
  const sinCuenta = permisos.filter((permiso) => permiso.estado === 'sin_cuenta_google')

  const grupos: Array<[SujetoPermisoDrive, PermisoDrive[]]> = [
    ['staff', otorgados.filter((permiso) => (permiso.subject_type ?? 'staff') === 'staff')],
    ['contact', otorgados.filter((permiso) => permiso.subject_type === 'contact')]
  ]
  // Basta que haya un contacto para que los titulos hagan falta: sin ellos, una lista de solo
  // contactos se leeria como si fuera el equipo.
  const conTitulos = otorgados.some((permiso) => permiso.subject_type === 'contact')

  return (
    <div className="flex flex-col gap-3">
      {grupos.filter(([, filas]) => filas.length > 0).map(([sujeto, filas]) => (
        <div key={sujeto} className="flex flex-col gap-1.5">
          {conTitulos && (
            <p className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
              {TITULOS_SUJETO[sujeto]}
            </p>
          )}

          <ul className="border-linea divide-linea-suave rounded-medio divide-y border">
            {filas.map((permiso) => (
              <FilaAcceso key={`${sujeto}-${permiso.staff_id}`} permiso={permiso} onQuitar={onQuitar} />
            ))}
          </ul>
        </div>
      ))}

      {sinCuenta.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-texto-aviso text-xs font-medium tracking-[0.08em] uppercase">
            Sin acceso todavía
          </p>
          <p className="text-texto-sutil text-xs">
            Drive no comparte con un correo que no tiene cuenta de Google. Se vuelve a intentar solo
            cada vez que se sincroniza la carpeta: el día que la persona cree su cuenta con ese
            correo, entra con el rol que figura acá.
          </p>

          <ul className="border-linea divide-linea-suave bg-superficie-aviso rounded-medio divide-y border">
            {sinCuenta.map((permiso) => (
              <FilaAcceso key={`sin-cuenta-${permiso.staff_id}`} permiso={permiso} onQuitar={onQuitar} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Una persona en la lista de accesos, con su rol y su baja.
 *
 * Es la misma fila para quien tiene el acceso y para quien todavia no: lo que distingue a los
 * segundos es el grupo donde caen, no la fila. El boton de quitar es solo del equipo; el alta y la
 * baja de contactos las maneja el backend con el estado del contacto, asi que un boton aca seria un
 * boton que el backend vuelve a deshacer.
 *
 * @param permiso la fila tal como la devolvio la API
 * @param onQuitar saca a alguien del equipo de la carpeta
 */
function FilaAcceso ({ permiso, onQuitar }: {
  permiso: PermisoDrive
  onQuitar: (staffId: number) => void
}) {
  const esEquipo = (permiso.subject_type ?? 'staff') === 'staff'

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="text-texto truncate font-medium">{permiso.name}</p>
        <p className="text-texto-sutil truncate text-xs">{permiso.email}</p>
      </div>
      <span className="text-texto-tenue shrink-0 text-xs">{ETIQUETAS_ROL[permiso.role]}</span>
      {esEquipo
        ? (
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label={`Quitar a ${permiso.name}`}
            onClick={() => { onQuitar(permiso.staff_id) }}
          >
            <X className="size-3.5" />
          </Boton>
          )
        : <span className="text-texto-sutil shrink-0 text-xs">Desde el portal</span>}
    </li>
  )
}

/**
 * Los mismos accesos, pero de una subcarpeta del arbol, que no tiene lugar propio en la pantalla.
 *
 * @param folderId la subcarpeta de Drive
 * @param nombre el nombre visible de la subcarpeta, para el encabezado del dialogo
 * @param onCerrar avisa a la fila del arbol que cierre el dialogo
 */
function DialogoPermisosDrive ({ folderId, nombre, onCerrar }: {
  folderId: string
  nombre: string
  onCerrar: () => void
}) {
  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo="Quién tiene acceso" descripcion={nombre}>
        <div className="flex flex-col gap-4">
          <GestorPermisosDrive folderId={folderId} />

          <div className="flex justify-end">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cerrar</Boton>
            </CerrarDialogo>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
