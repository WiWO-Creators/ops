'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cn } from '@/lib/clases'
import type { DriveCliente, NodoDrive } from '@/datos/recursos'

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

      {datos.folder === null
        ? (
          <Vacio
            titulo="Todavía no tiene carpeta en Drive"
            descripcion="Es anterior a esta función: las carpetas no se crean retroactivamente."
          />
          )
        : datos.folder.children.length === 0
          ? <p className="text-texto-tenue text-sm">Está vacía.</p>
          : (
            <ul className="flex flex-col gap-0.5">
              {datos.folder.children.map((nodo) => (
                <NodoArbol key={nodo.id} nodo={nodo} nivel={0} />
              ))}
            </ul>
            )}
    </div>
  )
}

/** Una fila del arbol: carpeta expandible o archivo con enlace directo. */
function NodoArbol ({ nodo, nivel }: { nodo: NodoDrive, nivel: number }) {
  const [abierto, setAbierto] = useState(false)
  const [hijos, setHijos] = useState<Carga<NodoDrive[]> | null>(null)
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

  if (!nodo.is_folder) {
    return (
      <li>
        <a
          href={nodo.web_view_link}
          target="_blank"
          rel="noreferrer"
          style={sangria}
          className="text-texto hover:text-acento flex items-center gap-1.5 rounded-chico py-1 pr-1.5 text-sm"
        >
          <File className="text-texto-sutil size-4 shrink-0" />
          <span className="truncate">{nodo.name}</span>
        </a>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={alternar}
        style={sangria}
        className={cn(
          'text-texto hover:bg-hover flex w-full items-center gap-1.5 rounded-chico py-1 pr-1.5 text-left text-sm'
        )}
      >
        {abierto ? <ChevronDown className="text-texto-sutil size-3.5 shrink-0" /> : <ChevronRight className="text-texto-sutil size-3.5 shrink-0" />}
        <Folder className="text-texto-sutil size-4 shrink-0" />
        <span className="truncate">{nodo.name}</span>
      </button>

      {abierto && hijos !== null && (
        hijos.fase === 'cargando'
          ? <Cargando alto="min-h-16" />
          : hijos.fase === 'error'
            ? <ErrorEstado detalle={hijos.mensaje} onReintentar={cargarHijos} />
            : hijos.datos.length === 0
              ? <p className="text-texto-tenue text-xs" style={{ paddingLeft: `${(nivel + 1) * SANGRIA_POR_NIVEL + 0.5}rem` }}>Está vacía.</p>
              : (
                <ul className="flex flex-col gap-0.5">
                  {hijos.datos.map((hijo) => <NodoArbol key={hijo.id} nodo={hijo} nivel={nivel + 1} />)}
                </ul>
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
