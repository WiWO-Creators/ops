'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent
} from 'react'
import {
  ChevronDown, ChevronRight, File, Folder, FolderInput, FolderPlus, Lock, Pencil, Trash2, Upload, Users, X
} from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { mensajeDeRespuesta, pedirRespuesta, pedirSobre } from '@/datos/cliente'
import { cargarAsignables } from '@/datos/asignables'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { esEditable, puedeEscribirEn, quitarNodo, reemplazarNodo } from '@/dominio/drive-arbol'
import { DialogoMoverDrive, EditorNombreDrive, NuevaCarpetaDrive } from '@/componentes/archivos/EdicionDrive'
import type {
  ArchivoDriveSubido, CambioNodoDrive, CarpetaDrive, ContenidoCarpetaDrive, DriveCliente, DriveTarea, NodoDrive,
  PermisoDrive, PersonaAsignable, RaizDrive, RolPermisoDrive, SujetoPermisoDrive
} from '@/datos/recursos'

/** Ancho de la sangria por nivel del arbol, en rem. */
const SANGRIA_POR_NIVEL = 1.25

/** Letras del código de Cliente. El backend valida exactamente `[A-Z]{4}`. */
const LARGO_CODIGO_CLIENTE = 4

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
const CREADA_SIN_CARPETA = 'El servidor respondió sin carpeta: no quedó creada. Prueba de nuevo y, si sigue igual, avisa a quien administre el sistema.'

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
            <CarpetaRaizDrive key={folder.id} folder={folder} />

            <AccesosDrive folderId={folder.id} raiz={raiz} />
          </>
          )}
    </div>
  )
}

/**
 * Lo que el árbol comparte con todas sus filas: de qué carpeta cuelga todo y cómo refrescar una
 * carpeta ya abierta cuando algo llega a ella desde otra rama (un traslado).
 */
interface ArbolCompartido {
  /** La carpeta de la entidad: es la raíz que ofrece el diálogo de mover. */
  raizId: string
  /** Anota cómo recargar una carpeta abierta. Devuelve la función que la desanota. */
  registrarCarpeta: (id: string, recargar: () => void) => () => void
  /** Vuelve a pedir una carpeta si está abierta en el árbol; si no lo está, no hace nada. */
  recargarCarpeta: (id: string) => void
}

const ContextoArbol = createContext<ArbolCompartido | null>(null)

/** Lee el contexto del árbol. Fuera de `CarpetaRaizDrive` es un error de programación. */
function useArbol (): ArbolCompartido {
  const arbol = useContext(ContextoArbol)
  if (arbol === null) throw new Error('NodoArbol se usa fuera de CarpetaRaizDrive.')
  return arbol
}

/** Lleva `can_write` y `locked` ausentes a su valor por defecto, para un backend anterior a esos campos. */
function contenidoDe (carpeta: ContenidoCarpetaDrive): Required<ContenidoCarpetaDrive> {
  return { children: carpeta.children, can_write: puedeEscribirEn(carpeta) }
}

/**
 * La carpeta de la entidad y sus hijos, con el registro que deja refrescar cualquier carpeta abierta.
 *
 * Arranca con lo que trajo `GET /{raiz}/{id}/drive` y se refresca contra `GET /drive/{folder_id}`,
 * que devuelve el mismo nivel: así un traslado a la raíz aparece sin recargar la pestaña.
 *
 * @param folder la carpeta raíz tal como la devolvió la API
 */
function CarpetaRaizDrive ({ folder }: { folder: CarpetaDrive }) {
  const [contenido, setContenido] = useState(() => contenidoDe(folder))
  const [errorRecarga, setErrorRecarga] = useState<string | null>(null)
  const recargadores = useRef(new Map<string, () => void>())

  const recargarRaiz = useCallback(() => {
    void pedirSobre<ContenidoCarpetaDrive>(`drive/${encodeURIComponent(folder.id)}`, new AbortController().signal)
      .then((sobre) => {
        setContenido(contenidoDe(sobre.data))
        setErrorRecarga(null)
      })
      .catch((fallo: unknown) => {
        setErrorRecarga(fallo instanceof Error ? fallo.message : 'No se pudo actualizar la carpeta.')
      })
  }, [folder.id])

  const arbol = useMemo<ArbolCompartido>(() => ({
    raizId: folder.id,
    registrarCarpeta: (id, recargar) => {
      recargadores.current.set(id, recargar)
      return () => {
        if (recargadores.current.get(id) === recargar) recargadores.current.delete(id)
      }
    },
    recargarCarpeta: (id) => {
      if (id === folder.id) {
        recargarRaiz()
        return
      }
      recargadores.current.get(id)?.()
    }
  }), [folder.id, recargarRaiz])

  return (
    <ContextoArbol.Provider value={arbol}>
      <ContenidoCarpeta
        folderId={folder.id}
        contenido={contenido}
        nivel={0}
        onCambiarHijos={(cambiar) => { setContenido((actual) => ({ ...actual, children: cambiar(actual.children) })) }}
      />
      {errorRecarga !== null && <p role="alert" className="text-texto-peligro text-xs">{errorRecarga}</p>}
    </ContextoArbol.Provider>
  )
}

/** Cambio sobre la lista de hijos de una carpeta, aplicado sobre la versión más reciente. */
type CambioHijos = (hijos: NodoDrive[]) => NodoDrive[]

/**
 * Lo que se ve dentro de una carpeta abierta: la barra para subir y crear, y la lista de hijos.
 *
 * Es el mismo bloque para la raíz y para cualquier subcarpeta. Crear y renombrar solo aparecen si
 * la carpeta admite escritura (`can_write`).
 *
 * @param folderId la carpeta cuyo contenido se muestra
 * @param contenido sus hijos y si se puede escribir en ella
 * @param nivel profundidad de la carpeta en el árbol, para la sangría
 * @param onCambiarHijos aplica un cambio sobre los hijos que guarda quien es dueño del estado
 */
function ContenidoCarpeta ({ folderId, contenido, nivel, onCambiarHijos }: {
  folderId: string
  contenido: Required<ContenidoCarpetaDrive>
  nivel: number
  onCambiarHijos: (cambiar: CambioHijos) => void
}) {
  const sangria = nivel === 0 ? undefined : { paddingLeft: `${nivel * SANGRIA_POR_NIVEL + 0.5}rem` }
  const agregar = (nuevo: NodoDrive): void => { onCambiarHijos((hijos) => [...hijos, nuevo]) }

  return (
    <>
      <div style={sangria} className="flex flex-wrap items-start gap-2">
        <SubirArchivoDrive folderId={folderId} onSubido={agregar} />
        {contenido.can_write && <NuevaCarpetaDrive folderId={folderId} onCreada={agregar} />}
      </div>

      {contenido.children.length === 0
        ? <p style={sangria} className={cn('text-texto-tenue', nivel === 0 ? 'text-sm' : 'text-xs')}>Está vacía.</p>
        : (
          <ul className="flex flex-col gap-0.5">
            {contenido.children.map((hijo) => (
              <NodoArbol
                key={hijo.id}
                nodo={hijo}
                nivel={nivel}
                folderId={folderId}
                editable={contenido.can_write && esEditable(hijo)}
                onQuitado={(id) => { onCambiarHijos((hijos) => quitarNodo(hijos, id)) }}
                onActualizado={(actualizado) => { onCambiarHijos((hijos) => reemplazarNodo(hijos, actualizado)) }}
              />
            ))}
          </ul>
          )}
    </>
  )
}

/** Convierte la respuesta de subida en un nodo del arbol, para insertarlo sin volver a pedir la carpeta. */
function nodoDeSubida (subido: ArchivoDriveSubido): NodoDrive {
  return {
    id: subido.drive_file_id,
    name: subido.name,
    is_folder: subido.is_folder,
    web_view_link: subido.web_view_link,
    uploaded_by: subido.uploaded_by,
    size_bytes: subido.size_bytes,
    mime_type: subido.mime_type,
    locked: false
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

/**
 * Texto de la confirmación de borrado. Dice papelera porque es lo que pasa: Drive la guarda 30 días
 * y se puede recuperar desde allá.
 *
 * @param nodo el archivo o carpeta a borrar
 */
function confirmacionDeBorrado (nodo: NodoDrive): string {
  return nodo.is_folder
    ? `¿Enviar la carpeta "${nodo.name}" a la papelera de Drive, con todo lo que tiene adentro? Se puede recuperar desde Drive durante 30 días.`
    : `¿Enviar "${nodo.name}" a la papelera de Drive? Se puede recuperar desde Drive durante 30 días.`
}

interface PropsNodoArbol {
  nodo: NodoDrive
  /** Profundidad de la carpeta que contiene a `nodo`. */
  nivel: number
  /** Id de la carpeta que contiene a `nodo`: la que se manda en las rutas que tocan a `nodo`. */
  folderId: string
  /** Si `nodo` admite renombrar, mover y borrar: su carpeta deja escribir y no es de sistema. */
  editable: boolean
  /** Avisa a quien lista a `nodo` que lo saque: se borró o se fue a otra carpeta. */
  onQuitado: (id: string) => void
  /** Entrega a quien lista a `nodo` su versión nueva, tras renombrarlo. */
  onActualizado: (nodo: NodoDrive) => void
}

/**
 * Una fila del arbol: carpeta expandible o archivo con enlace directo, con sus acciones.
 *
 * Renombrar se escribe en la propia fila; mover abre el diálogo de destinos; eliminar confirma y
 * manda a la papelera de Drive. El error de cualquiera de las tres queda debajo de la fila.
 */
function NodoArbol ({ nodo, nivel, folderId, editable, onQuitado, onActualizado }: PropsNodoArbol) {
  const arbol = useArbol()
  const [abierto, setAbierto] = useState(false)
  const [hijos, setHijos] = useState<Carga<Required<ContenidoCarpetaDrive>> | null>(null)
  const [permisosAbierto, setPermisosAbierto] = useState(false)
  const [renombrando, setRenombrando] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sangria = { paddingLeft: `${nivel * SANGRIA_POR_NIVEL + 0.5}rem` }
  const rutaNodo = `drive/${encodeURIComponent(folderId)}/files/${encodeURIComponent(nodo.id)}`

  const cargarHijos = useCallback(() => {
    setHijos({ fase: 'cargando' })

    void pedirSobre<ContenidoCarpetaDrive>(`drive/${encodeURIComponent(nodo.id)}`, new AbortController().signal)
      .then((sobre) => { setHijos({ fase: 'listo', datos: contenidoDe(sobre.data) }) })
      .catch((fallo: unknown) => {
        setHijos({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar esta carpeta.'
        })
      })
  }, [nodo.id])

  // Una carpeta ya pedida se anota para poder refrescarla cuando le llega algo desde otra rama.
  // Una que nunca se abrió no hace falta: lo movido aparece la primera vez que se abra.
  const { registrarCarpeta } = arbol
  const cargada = hijos !== null
  useEffect(() => {
    if (!nodo.is_folder || !cargada) return
    return registrarCarpeta(nodo.id, cargarHijos)
  }, [nodo.is_folder, nodo.id, cargada, registrarCarpeta, cargarHijos])

  // Se pide una sola vez: colapsar y volver a abrir la misma carpeta reusa lo que ya llego, y el
  // arbol de Drive no cambia mientras dura la sesion como para justificar refrescarlo cada vez.
  const alternar = useCallback(() => {
    setAbierto((estaba) => !estaba)
    if (hijos === null) cargarHijos()
  }, [hijos, cargarHijos])

  const cambiarHijos = useCallback((cambiar: CambioHijos) => {
    setHijos((actual) => (actual !== null && actual.fase === 'listo'
      ? { fase: 'listo', datos: { ...actual.datos, children: cambiar(actual.datos.children) } }
      : actual))
  }, [])

  async function renombrar (nombre: string): Promise<string | null> {
    const cambio: CambioNodoDrive = { name: nombre }
    const resultado = await escribirEnBff<NodoDrive>(rutaNodo, 'PATCH', cambio)

    if (!resultado.ok) return resultado.mensaje

    setRenombrando(false)
    onActualizado(resultado.datos)
    return null
  }

  async function eliminar (): Promise<void> {
    if (!window.confirm(confirmacionDeBorrado(nodo))) return

    setEliminando(true)
    setError(null)

    const resultado = await escribirEnBff(rutaNodo, 'DELETE')

    setEliminando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onQuitado(nodo.id)
  }

  /** Tras el traslado: el destino se refresca si está abierto y el nodo sale de esta carpeta. */
  function alMover (_actualizado: NodoDrive, destinoId: string): void {
    setMoviendo(false)
    arbol.recargarCarpeta(destinoId)
    onQuitado(nodo.id)
  }

  const etiqueta = (
    <>
      {nodo.is_folder
        ? (
          <>
            {abierto ? <ChevronDown className="text-texto-sutil size-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="text-texto-sutil size-3.5 shrink-0" aria-hidden="true" />}
            <Folder className="text-texto-sutil size-4 shrink-0" aria-hidden="true" />
          </>
          )
        : <File className="text-texto-sutil size-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{nodo.name}</span>
      {nodo.locked === true && (
        <Lock className="text-texto-sutil size-3 shrink-0" aria-label="Carpeta del sistema: no se renombra, mueve ni elimina" />
      )}
    </>
  )

  return (
    <li>
      <div style={sangria} className="flex items-center gap-1.5 rounded-chico py-1 pr-1.5">
        {renombrando
          ? (
            <div className="min-w-0 flex-1">
              <EditorNombreDrive
                inicial={nodo.name}
                etiqueta={`Nuevo nombre de ${nodo.name}`}
                textoGuardar="Guardar"
                onGuardar={renombrar}
                onCancelar={() => { setRenombrando(false) }}
              />
            </div>
            )
          : nodo.is_folder
            ? (
              <button
                type="button"
                onClick={alternar}
                aria-expanded={abierto}
                className="text-texto hover:text-acento flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
              >
                {etiqueta}
              </button>
              )
            : (
              <a
                href={nodo.web_view_link}
                target="_blank"
                rel="noreferrer"
                className="text-texto hover:text-acento flex min-w-0 flex-1 items-center gap-1.5 text-sm"
              >
                {etiqueta}
              </a>
              )}

        {editable && !renombrando && (
          <>
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              aria-label={`Renombrar ${nodo.name}`}
              title="Renombrar"
              onClick={() => {
                setError(null)
                setRenombrando(true)
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Boton>
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              aria-label={`Mover ${nodo.name}`}
              title="Mover"
              onClick={() => {
                setError(null)
                setMoviendo(true)
              }}
            >
              <FolderInput className="size-3.5" aria-hidden="true" />
            </Boton>
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              cargando={eliminando}
              aria-label={`Eliminar ${nodo.name}`}
              title="Enviar a la papelera"
              onClick={() => { void eliminar() }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Boton>
          </>
        )}

        {nodo.is_folder && !renombrando && (
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label={`Permisos de ${nodo.name}`}
            title="Permisos"
            onClick={() => { setPermisosAbierto(true) }}
          >
            <Users className="size-3.5" aria-hidden="true" />
          </Boton>
        )}
      </div>

      {error !== null && <p role="alert" style={sangria} className="text-texto-peligro text-xs">{error}</p>}

      {permisosAbierto && (
        <DialogoPermisosDrive folderId={nodo.id} nombre={nodo.name} onCerrar={() => { setPermisosAbierto(false) }} />
      )}

      {moviendo && (
        <DialogoMoverDrive
          nodo={nodo}
          padreId={folderId}
          raizId={arbol.raizId}
          onMovido={alMover}
          onCerrar={() => { setMoviendo(false) }}
        />
      )}

      {nodo.is_folder && abierto && hijos !== null && (
        hijos.fase === 'cargando'
          ? <Cargando alto="min-h-16" />
          : hijos.fase === 'error'
            ? <ErrorEstado detalle={hijos.mensaje} onReintentar={cargarHijos} />
            : <ContenidoCarpeta folderId={nodo.id} contenido={hijos.datos} nivel={nivel + 1} onCambiarHijos={cambiarHijos} />
      )}
    </li>
  )
}

/**
 * Input del codigo de 4 letras del Cliente, del que cuelga la patente de todos sus Espacios.
 *
 * Cambiarlo arrastra en cascada las patentes de sus Espacios y Procesos y el nombre de sus carpetas
 * en Drive: el backend lo hace en una transaccion, aca solo se manda el codigo.
 *
 * El input filtra a A-Z en mayuscula en vez de dejar escribir cualquier cosa y comerse un 422: el
 * backend acepta exactamente `[A-Z]{4}`, y un campo que acepta lo que el servidor rechaza es una
 * trampa, no una validacion.
 */
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
      <Campo etiqueta="Código de 4 letras" error={error} className="max-w-32">
        {(props) => (
          <Entrada
            {...props}
            value={letras}
            maxLength={LARGO_CODIGO_CLIENTE}
            placeholder="CNSA"
            onChange={(evento) => {
              setLetras(evento.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
              setError(undefined)
            }}
          />
        )}
      </Campo>

      <Boton
        variante="secundario"
        tamano="chico"
        cargando={guardando}
        disabled={!sucio || letras.length !== LARGO_CODIGO_CLIENTE}
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
  const [personal, setPersonal] = useState<PersonaAsignable[]>([])
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
  // Sale de `cargarAsignables` y no de `GET /staff`: esa ruta exige `staff.view` —lo tienen 19 de 184
  // personas— y dejaba el selector vacio para casi todo el mundo, o sea sin poder compartir con nadie.
  // El correo con el que Drive comparte no viaja aca: lo resuelve el backend desde `staff_id`
  // (`Escritura/Drive.php:360`), asi que la proyeccion minima alcanza.
  useEffect(() => {
    if (carga.fase !== 'listo' || personal.length > 0) return

    // `cargarAsignables` no acepta señal de aborto —la promesa la comparten varios componentes—, asi
    // que el desmontaje se cubre descartando la respuesta, no cancelando la peticion.
    let vivo = true

    void cargarAsignables()
      .then((personas) => { if (vivo) setPersonal(personas) })
      .catch(() => {}) // La lista de permisos ya cargo bien: el formulario de alta queda sin opciones.

    return () => { vivo = false }
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
              <DisparadorSelector marcador="Elige una persona" id={props.id} />
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
