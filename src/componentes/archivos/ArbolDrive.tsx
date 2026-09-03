'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, ChevronRight, File, Folder, Trash2, Upload, Users, X } from 'lucide-react'
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
import { cn } from '@/lib/clases'
import type {
  ArchivoDriveSubido, DriveCliente, MiembroEquipo, NodoDrive, PermisoDrive, RolPermisoDrive
} from '@/datos/recursos'

/** Ancho de la sangria por nivel del arbol, en rem. */
const SANGRIA_POR_NIVEL = 1.25

type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: T }

/**
 * Lo que trae `GET /clients/{id}/drive` o `GET /projects/{id}/drive`.
 *
 * `letras` y `patente` son opcionales aca porque este componente sirve a los dos endpoints: cada uno
 * manda solo el campo que le corresponde. Los tipos exactos (`DriveCliente`, `DriveEspacio`) quedan en
 * `recursos.ts` para quien consuma cada endpoint por separado.
 */
interface DatosDrive {
  letras?: string | null
  patente?: string | null
  folder: { id: string, children: NodoDrive[] } | null
}

interface Props {
  raiz: 'clients' | 'projects'
  id: number
}

/**
 * Arbol de carpetas de Drive de un Cliente o un Espacio, para la pestaña Archivos.
 *
 * Pide desde el navegador porque es una pestaña que puede no abrirse nunca. `folder: null` es un
 * Cliente o Espacio anterior a esta funcion, sin backfill retroactivo: es un vacio normal, no un error.
 */
export function ArbolDrive ({ raiz, id }: Props) {
  const [carga, setCarga] = useState<Carga<DatosDrive>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

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
            descripcion="Es anterior a esta función: las carpetas no se crean retroactivamente."
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
  /** 404 del backend: la carpeta no es de una Tarea. Caso normal en Cliente/Espacio, no un error. */
  | { fase: 'no-gestionable', mensaje: string }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: PermisoDrive[] }

const ETIQUETAS_ROL: Record<RolPermisoDrive, string> = { writer: 'Editor', commenter: 'Comentador' }

/**
 * Permisos manuales sobre una carpeta de Drive: solo existen en carpetas de Tarea (Proceso).
 *
 * El 404 de "esta carpeta no es de una Tarea" se distingue de un error real pidiendo la respuesta
 * cruda (`pedirRespuesta`) en vez de `pedirSobre`, que descarta el status junto con el resto de la
 * respuesta.
 */
function DialogoPermisosDrive ({ folderId, nombre, onCerrar }: {
  folderId: string
  nombre: string
  onCerrar: () => void
}) {
  const [carga, setCarga] = useState<CargaPermisos>({ fase: 'cargando' })
  const [personal, setPersonal] = useState<MiembroEquipo[]>([])
  const [staffId, setStaffId] = useState('')
  const [rol, setRol] = useState<RolPermisoDrive>('writer')
  const [agregando, setAgregando] = useState(false)
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null)

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
  }, [folderId])

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

    const persona = personal.find((p) => p.id === Number(staffId))

    if (carga.fase === 'listo' && persona !== undefined) {
      setCarga({
        fase: 'listo',
        datos: [
          ...carga.datos.filter((p) => p.staff_id !== persona.id),
          { staff_id: persona.id, name: persona.full_name, email: persona.email, role: rol }
        ]
      })
    }

    setStaffId('')
  }

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

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo="Permisos" descripcion={nombre}>
        <div className="flex flex-col gap-4">
          {carga.fase === 'cargando' && <Cargando alto="min-h-24" />}
          {carga.fase === 'error' && <ErrorEstado detalle={carga.mensaje} />}
          {carga.fase === 'no-gestionable' && <p className="text-texto-tenue text-sm">{carga.mensaje}</p>}

          {carga.fase === 'listo' && (
            <>
              {carga.datos.length === 0
                ? <p className="text-texto-tenue text-sm">Nadie tiene un permiso manual acá todavía.</p>
                : (
                  <ul className="border-linea divide-linea-suave rounded-medio divide-y border">
                    {carga.datos.map((permiso) => (
                      <li key={permiso.staff_id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="text-texto truncate font-medium">{permiso.name}</p>
                          <p className="text-texto-sutil truncate text-xs">{permiso.email}</p>
                        </div>
                        <span className="text-texto-tenue shrink-0 text-xs">{ETIQUETAS_ROL[permiso.role]}</span>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          soloIcono
                          aria-label={`Quitar a ${permiso.name}`}
                          onClick={() => { void quitar(permiso.staff_id) }}
                        >
                          <X className="size-3.5" />
                        </Boton>
                      </li>
                    ))}
                  </ul>
                  )}

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
                        <Opcion value="writer">Editor</Opcion>
                        <Opcion value="commenter">Comentador</Opcion>
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
            </>
          )}

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
