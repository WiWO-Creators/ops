'use client'

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderLock } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { LARGO_MAXIMO_NOMBRE_DRIVE, motivoNombreInvalido } from '@/dominio/drive-arbol'
import { motivoParaNoSoltar, type ArrastreDrive } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'
import type { ContenidoCarpetaDrive, MigaDrive, NodoDrive } from '@/datos/recursos'

/** Ancho de la sangría por nivel del árbol del diálogo de mover, en rem. */
const SANGRIA_DESTINO = 1

/**
 * Selecciona el nombre sin la extensión, como cualquier explorador: renombrar `propuesta.pdf` casi
 * nunca quiere cambiar el `.pdf`, y escribir encima de todo lo borraba.
 */
function seleccionarSinExtension (campo: HTMLInputElement): void {
  const punto = campo.value.lastIndexOf('.')
  campo.setSelectionRange(0, punto > 0 ? punto : campo.value.length)
}

/**
 * Campo de una línea para escribir el nombre de un archivo o carpeta, en la propia fila del árbol.
 *
 * Valida en el cliente las mismas reglas que la API antes de mandar nada, y muestra debajo tanto ese
 * motivo como el error que devuelva el servidor: queda junto al nodo que se está tocando. Enter
 * guarda y Escape descarta. Las teclas no suben a la vista: F2, Supr o las flechas escritas acá son
 * del campo, no del explorador.
 *
 * @param inicial el nombre con el que arranca el campo
 * @param etiqueta el nombre accesible del campo
 * @param textoGuardar el rótulo del botón de confirmar
 * @param onGuardar manda el nombre ya recortado; devuelve el mensaje de error o `null` si salió bien
 * @param onCancelar cierra el editor sin cambios
 */
export function EditorNombreDrive ({ inicial, etiqueta, textoGuardar, onGuardar, onCancelar, validar, compacto = false }: {
  inicial: string
  etiqueta: string
  textoGuardar: string
  onGuardar: (nombre: string) => Promise<string | null>
  onCancelar: () => void
  /** Regla extra de quien lo usa (un nombre repetido en la carpeta, por ejemplo). */
  validar?: (nombre: string) => string | null
  /** Sin botones, para una tarjeta angosta: Enter guarda y Escape descarta. */
  compacto?: boolean
}) {
  const [nombre, setNombre] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const motivo = motivoNombreInvalido(nombre) ?? validar?.(nombre.trim()) ?? null
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
    evento.stopPropagation()
    if (evento.key !== 'Escape') return

    evento.preventDefault()
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
          onFocus={(evento) => { seleccionarSinExtension(evento.target) }}
          onChange={(evento) => {
            setNombre(evento.target.value)
            setError(null)
          }}
        />
        {!compacto && (
          <>
            <Boton type="submit" variante="primario" tamano="chico" cargando={guardando}>{textoGuardar}</Boton>
            <Boton variante="sutil" tamano="chico" disabled={guardando} onClick={onCancelar}>Cancelar</Boton>
          </>
        )}
      </div>
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </form>
  )
}

interface PropsDialogoMover {
  /** Lo que se mueve: uno o varios hijos de `padreId`. */
  nodos: readonly NodoDrive[]
  /** La carpeta donde están hoy: no sirve de destino. */
  padreId: string
  /** La carpeta de la entidad (Cliente, Proyecto o Tarea), desde donde se ofrece el árbol. */
  raizId: string
  /** Cómo se llama la raíz en las migas, para que el diálogo diga lo mismo. */
  raizNombre: string
  /** La carpeta elegida. El traslado lo hace quien abrió el diálogo, igual que al soltar. */
  onElegir: (destino: MigaDrive) => void
  onCerrar: () => void
}

/**
 * Diálogo para elegir a qué carpeta se mueve lo seleccionado: la alternativa a arrastrar, para el
 * teclado y el celular.
 *
 * Ofrece solo carpetas y solo de la entidad, cargando cada nivel al abrirlo. Quedan deshabilitados
 * los mismos destinos que el arrastre no resalta —lo que se mueve, lo que cuelga de ello y la carpeta
 * donde ya está—, con el motivo a la vista. El traslado y su resultado los maneja el explorador, así
 * que mover desde acá y soltar dan el mismo aviso.
 */
export function DialogoMoverDrive ({ nodos, padreId, raizId, raizNombre, onElegir, onCerrar }: PropsDialogoMover) {
  const [destino, setDestino] = useState<MigaDrive | null>(null)
  const arrastre: ArrastreDrive = { ids: nodos.map((nodo) => nodo.id), padreId }
  const primero = nodos[0]
  const titulo = nodos.length === 1 && primero !== undefined ? `Mover «${primero.name}»` : `Mover ${nodos.length} elementos`

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo={titulo} descripcion="Elige la carpeta de destino.">
        <div className="flex flex-col gap-4">
          <ul
            role="tree"
            aria-label="Carpetas de destino"
            data-lenis-prevent
            className="border-linea rounded-medio max-h-80 overflow-y-auto border p-1"
          >
            <CarpetaDestino
              id={raizId}
              nombre={raizNombre}
              ruta={[raizId]}
              nivel={0}
              abiertaAlInicio
              arrastre={arrastre}
              seleccionada={destino?.id ?? null}
              onElegir={setDestino}
            />
          </ul>

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" disabled={destino === null} onClick={() => { if (destino !== null) onElegir(destino) }}>
              Mover aquí
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
  /** Carpeta de una Tarea: se puede soltar adentro, y se dibuja con candado como en el explorador. */
  bloqueada?: boolean
  /** Lo que se mueve: decide qué carpetas no sirven de destino. */
  arrastre: ArrastreDrive
  seleccionada: string | null
  onElegir: (destino: MigaDrive) => void
}

/**
 * Una carpeta del árbol de destinos: se elige con un clic y se despliega con la flecha.
 *
 * Una carpeta que es parte de lo que se mueve tampoco se despliega: todo lo que cuelga de ella sería
 * también un destino inválido.
 */
function CarpetaDestino ({
  id, nombre, ruta, nivel, abiertaAlInicio = false, bloqueada = false, arrastre, seleccionada, onElegir
}: PropsCarpetaDestino) {
  const [abierta, setAbierta] = useState(abiertaAlInicio)
  // La raíz llega abierta y ya cargando: su primer nivel se pide apenas se monta el diálogo.
  const [hijas, setHijas] = useState<CargaCarpetas | null>(abiertaAlInicio ? { fase: 'cargando' } : null)

  const motivo = motivoParaNoSoltar({ id, ruta }, arrastre)
  const esElItem = arrastre.ids.includes(id)
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
          onClick={() => { onElegir({ id, name: nombre }) }}
          className={cn(
            'rounded-chico flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left text-sm',
            'disabled:text-texto-sutil disabled:cursor-not-allowed',
            elegida ? 'bg-acento text-acento-contenido' : 'text-texto hover:bg-hover'
          )}
        >
          {bloqueada
            ? <FolderLock className="size-4 shrink-0" aria-hidden="true" />
            : <Folder className="size-4 shrink-0" aria-hidden="true" />}
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
                    bloqueada={hija.locked === true}
                    ruta={[...ruta, hija.id]}
                    nivel={nivel + 1}
                    arrastre={arrastre}
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

/**
 * Confirmación de enviar a la papelera, para uno o varios elementos.
 *
 * Dice papelera porque es lo que pasa: Drive la guarda 30 días y se puede recuperar desde allá. Una
 * carpeta avisa que se va con todo lo que tiene adentro, que es lo que nadie espera al borrar "una"
 * cosa.
 *
 * @param nodos lo que se va a borrar
 * @param onConfirmar borra; el diálogo se cierra al confirmar y el resultado lo informa el explorador
 */
export function DialogoEliminarDrive ({ nodos, onConfirmar, onCerrar }: {
  nodos: readonly NodoDrive[]
  onConfirmar: () => void
  onCerrar: () => void
}) {
  const primero = nodos[0]
  const conCarpetas = nodos.some((nodo) => nodo.is_folder)
  const titulo = nodos.length === 1 && primero !== undefined
    ? `¿Enviar «${primero.name}» a la papelera?`
    : `¿Enviar ${nodos.length} elementos a la papelera?`
  const detalle = conCarpetas
    ? 'Las carpetas se van con todo lo que tienen adentro. Se puede recuperar desde la papelera de Drive durante 30 días.'
    : 'Se puede recuperar desde la papelera de Drive durante 30 días.'

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo={titulo} descripcion={detalle}>
        <div className="flex justify-end gap-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil">Cancelar</Boton>
          </CerrarDialogo>
          <Boton variante="peligro" autoFocus onClick={onConfirmar}>Enviar a la papelera</Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
