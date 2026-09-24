'use client'

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderPlus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { LARGO_MAXIMO_NOMBRE_DRIVE, motivoDestinoInvalido, motivoNombreInvalido } from '@/dominio/drive-arbol'
import { cn } from '@/lib/clases'
import type { CambioNodoDrive, ContenidoCarpetaDrive, NodoDrive } from '@/datos/recursos'

/** Ancho de la sangría por nivel del árbol del diálogo de mover, en rem. */
const SANGRIA_DESTINO = 1

/**
 * Campo de una línea para escribir el nombre de un archivo o carpeta, en la propia fila del árbol.
 *
 * Valida en el cliente las mismas reglas que la API antes de mandar nada, y muestra debajo tanto ese
 * motivo como el error que devuelva el servidor: queda junto al nodo que se está tocando. Enter
 * guarda y Escape descarta.
 *
 * @param inicial el nombre con el que arranca el campo
 * @param etiqueta el nombre accesible del campo
 * @param textoGuardar el rótulo del botón de confirmar
 * @param onGuardar manda el nombre ya recortado; devuelve el mensaje de error o `null` si salió bien
 * @param onCancelar cierra el editor sin cambios
 */
export function EditorNombreDrive ({ inicial, etiqueta, textoGuardar, onGuardar, onCancelar }: {
  inicial: string
  etiqueta: string
  textoGuardar: string
  onGuardar: (nombre: string) => Promise<string | null>
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const motivo = motivoNombreInvalido(nombre)
    if (motivo !== null) {
      setError(motivo)
      return
    }

    setGuardando(true)
    setError(null)
    const fallo = await onGuardar(nombre.trim())
    setGuardando(false)

    if (fallo !== null) setError(fallo)
  }

  function alPresionarTecla (evento: KeyboardEvent<HTMLFormElement>): void {
    if (evento.key !== 'Escape') return

    evento.stopPropagation()
    onCancelar()
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(evento) => { void guardar(evento) }}
      onKeyDown={alPresionarTecla}
    >
      <div className="flex items-center gap-1.5">
        <Entrada
          autoFocus
          aria-label={etiqueta}
          aria-invalid={error !== null}
          value={nombre}
          maxLength={LARGO_MAXIMO_NOMBRE_DRIVE + 1}
          className="h-8 min-w-0 flex-1"
          onFocus={(evento) => { evento.target.select() }}
          onChange={(evento) => {
            setNombre(evento.target.value)
            setError(null)
          }}
        />
        <Boton type="submit" variante="primario" tamano="chico" cargando={guardando}>{textoGuardar}</Boton>
        <Boton variante="sutil" tamano="chico" disabled={guardando} onClick={onCancelar}>Cancelar</Boton>
      </div>
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </form>
  )
}

/**
 * Botón "Nueva carpeta" de una carpeta del árbol, que se abre en un campo para escribir el nombre.
 *
 * Crea con `POST /drive/{folder_id}/folders` y entrega el nodo nuevo a quien lista los hijos.
 *
 * @param folderId la carpeta dentro de la que se crea
 * @param onCreada recibe el nodo que devolvió el `201`
 */
export function NuevaCarpetaDrive ({ folderId, onCreada }: {
  folderId: string
  onCreada: (nodo: NodoDrive) => void
}) {
  const [abierto, setAbierto] = useState(false)

  async function crear (nombre: string): Promise<string | null> {
    const resultado = await escribirEnBff<NodoDrive>(
      `drive/${encodeURIComponent(folderId)}/folders`, 'POST', { name: nombre }
    )

    if (!resultado.ok) return resultado.mensaje

    onCreada(resultado.datos)
    setAbierto(false)
    return null
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" tamano="chico" onClick={() => { setAbierto(true) }}>
        <FolderPlus className="size-3.5" aria-hidden="true" />
        Nueva carpeta
      </Boton>
    )
  }

  return (
    <div className="min-w-60 flex-1">
      <EditorNombreDrive
        inicial=""
        etiqueta="Nombre de la carpeta nueva"
        textoGuardar="Crear"
        onGuardar={crear}
        onCancelar={() => { setAbierto(false) }}
      />
    </div>
  )
}

interface PropsDialogoMover {
  /** El archivo o carpeta que se mueve. */
  nodo: NodoDrive
  /** La carpeta donde está hoy `nodo`: es la del `PATCH` y la que no sirve de destino. */
  padreId: string
  /** La carpeta de la entidad (Cliente, Proyecto o Tarea), desde donde se ofrece el árbol. */
  raizId: string
  /** Avisa que el `PATCH` salió bien, con el nodo actualizado y la carpeta a la que llegó. */
  onMovido: (actualizado: NodoDrive, destinoId: string) => void
  onCerrar: () => void
}

/**
 * Diálogo para elegir a qué carpeta se mueve un archivo o carpeta.
 *
 * Ofrece solo carpetas y solo de la entidad, cargando cada nivel al abrirlo. Quedan deshabilitados
 * el propio item, lo que cuelga de él y la carpeta donde ya está: son los mismos destinos que la API
 * rechaza con `422`, avisados antes. Un `403` (destino sin permiso) se muestra en el diálogo, que
 * queda abierto para elegir otro.
 */
export function DialogoMoverDrive ({ nodo, padreId, raizId, onMovido, onCerrar }: PropsDialogoMover) {
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mover (): Promise<void> {
    if (destinoId === null) return

    setMoviendo(true)
    setError(null)

    const cambio: CambioNodoDrive = { parent_id: destinoId }
    const resultado = await escribirEnBff<NodoDrive>(
      `drive/${encodeURIComponent(padreId)}/files/${encodeURIComponent(nodo.id)}`, 'PATCH', cambio
    )

    setMoviendo(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onMovido(resultado.datos, destinoId)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo={`Mover "${nodo.name}"`} descripcion="Elige la carpeta de destino.">
        <div className="flex flex-col gap-4">
          <ul role="tree" aria-label="Carpetas de destino" className="border-linea rounded-medio max-h-80 overflow-y-auto border p-1">
            <CarpetaDestino
              id={raizId}
              nombre="Carpeta principal"
              ruta={[raizId]}
              nivel={0}
              abiertaAlInicio
              itemId={nodo.id}
              padreId={padreId}
              seleccionada={destinoId}
              onElegir={(id) => {
                setDestinoId(id)
                setError(null)
              }}
            />
          </ul>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" disabled={moviendo}>Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" cargando={moviendo} disabled={destinoId === null} onClick={() => { void mover() }}>
              Mover acá
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

type CargaCarpetas =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: NodoDrive[] }

interface PropsCarpetaDestino {
  id: string
  nombre: string
  /** Ids desde la raíz hasta esta carpeta, ella incluida. */
  ruta: string[]
  nivel: number
  abiertaAlInicio?: boolean
  itemId: string
  padreId: string
  seleccionada: string | null
  onElegir: (id: string) => void
}

/**
 * Una carpeta del árbol de destinos: se elige con un clic y se despliega con la flecha.
 *
 * Una carpeta deshabilitada tampoco se despliega cuando es el propio item: todo lo que cuelga de
 * ella sería también un destino inválido.
 */
function CarpetaDestino ({
  id, nombre, ruta, nivel, abiertaAlInicio = false, itemId, padreId, seleccionada, onElegir
}: PropsCarpetaDestino) {
  const [abierta, setAbierta] = useState(abiertaAlInicio)
  // La raíz llega abierta y ya cargando: su primer nivel se pide apenas se monta el diálogo.
  const [hijas, setHijas] = useState<CargaCarpetas | null>(abiertaAlInicio ? { fase: 'cargando' } : null)

  const motivo = motivoDestinoInvalido(ruta, itemId, padreId)
  const esElItem = id === itemId
  const elegida = seleccionada === id

  const pedir = useCallback((senal: AbortSignal) => {
    void pedirSobre<ContenidoCarpetaDrive>(`drive/${encodeURIComponent(id)}`, senal)
      .then((sobre) => {
        if (senal.aborted) return
        setHijas({ fase: 'listo', datos: sobre.data.children.filter((hijo) => hijo.is_folder) })
      })
      .catch((fallo: unknown) => {
        if (senal.aborted) return
        setHijas({ fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar esta carpeta.' })
      })
  }, [id])

  const cargar = useCallback(() => {
    setHijas({ fase: 'cargando' })
    pedir(new AbortController().signal)
  }, [pedir])

  useEffect(() => {
    if (!abiertaAlInicio) return

    const control = new AbortController()
    pedir(control.signal)
    return () => { control.abort() }
  }, [abiertaAlInicio, pedir])

  function alternar (): void {
    setAbierta((estaba) => !estaba)
    if (hijas === null) cargar()
  }

  return (
    <li role="treeitem" aria-expanded={esElItem ? undefined : abierta} aria-selected={elegida}>
      <div className="flex items-center gap-1" style={{ paddingLeft: `${nivel * SANGRIA_DESTINO}rem` }}>
        {esElItem
          ? <span className="size-7 shrink-0" />
          : (
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              className="size-7"
              aria-label={abierta ? `Cerrar ${nombre}` : `Abrir ${nombre}`}
              onClick={alternar}
            >
              {abierta ? <ChevronDown className="size-3.5" aria-hidden="true" /> : <ChevronRight className="size-3.5" aria-hidden="true" />}
            </Boton>
            )}
        <button
          type="button"
          disabled={motivo !== null}
          aria-pressed={elegida}
          title={motivo ?? undefined}
          onClick={() => { onElegir(id) }}
          className={cn(
            'rounded-chico flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-sm',
            'disabled:text-texto-sutil disabled:cursor-not-allowed',
            elegida ? 'bg-acento text-acento-contenido' : 'text-texto hover:bg-hover'
          )}
        >
          <Folder className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{nombre}</span>
          {motivo !== null && <span className="shrink-0 text-xs">· {motivo}</span>}
        </button>
      </div>

      {abierta && !esElItem && hijas !== null && (
        hijas.fase === 'cargando'
          ? <Cargando alto="min-h-10" />
          : hijas.fase === 'error'
            ? <ErrorEstado detalle={hijas.mensaje} onReintentar={cargar} />
            : hijas.datos.length > 0 && (
              <ul role="group">
                {hijas.datos.map((hija) => (
                  <CarpetaDestino
                    key={hija.id}
                    id={hija.id}
                    nombre={hija.name}
                    ruta={[...ruta, hija.id]}
                    nivel={nivel + 1}
                    itemId={itemId}
                    padreId={padreId}
                    seleccionada={seleccionada}
                    onElegir={onElegir}
                  />
                ))}
              </ul>
            )
      )}
    </li>
  )
}
