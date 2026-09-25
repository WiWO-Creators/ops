'use client'

import { ExternalLink, FolderOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactElement } from 'react'
import { Boton, boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { ControlDeCampo } from '@/componentes/proyecto/FormularioRecurso'
import { mensajeDeRespuesta } from '@/datos/cliente'
import {
  LARGO_MAXIMO_ENLACE,
  revisarEnlaceDePresentacion,
  servicioDelEnlace
} from '@/dominio/presentacion-licitacion'

/**
 * La carpeta donde se arma la propuesta de una Licitacion, arriba de su ficha y a la vista.
 *
 * La propuesta vive en Drive y se edita ahi hasta el ultimo dia, asi que lo que se guarda es el link
 * y no una copia. Va arriba porque es lo primero que se busca al entrar: con link, el boton que la
 * abre; sin link, el campo para pegarlo sin pasar por el formulario de edicion.
 *
 * Es una franja neutra y no un aviso: `PendientesLicitacion`, justo encima, usa el borde de color
 * para lo que falta, y la carpeta no es algo que falte sino algo que se usa.
 *
 * Guarda con `PATCH /licitaciones/{id}` y despues hace `router.refresh()`: la ficha se resuelve en el
 * servidor, y mostrar el link nuevo antes de que la API lo confirme seria mostrar algo no guardado.
 */
interface PropsPresentacion {
  licitacionId: number
  /** El link guardado, o `null` si todavia no hay. */
  url: string | null
  /** Si quien mira puede escribir sobre Espacios: sin eso solo se ve el link. */
  puedeEditar: boolean
}

export function PresentacionLicitacion ({ licitacionId, url, puedeEditar }: PropsPresentacion): ReactElement {
  const [editando, setEditando] = useState(false)
  const conEditor = puedeEditar && (url === null || editando)

  return (
    <section
      aria-labelledby="carpeta-propuesta"
      className={cn(
        'rounded-tarjeta border-linea-suave bg-superficie mb-6 flex flex-col gap-3 border p-4',
        // Con el boton, titulo y accion van en una fila; con el campo, el campo va debajo y a lo ancho.
        !conEditor && 'sm:flex-row sm:items-center sm:justify-between'
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <FolderOpen size={20} aria-hidden="true" className="text-texto-tenue shrink-0" />
        <div className="min-w-0">
          <h2 id="carpeta-propuesta" className="text-texto text-sm font-semibold">Carpeta de la propuesta</h2>
          {url === null && !conEditor && (
            <p className="text-texto-tenue text-sm">Todavía no se cargó el link.</p>
          )}
        </div>
      </div>

      {url !== null && !conEditor && (
        <EnlaceGuardado url={url} puedeEditar={puedeEditar} alCambiar={() => { setEditando(true) }} />
      )}

      {conEditor && (
        <EditorDeEnlace
          licitacionId={licitacionId}
          inicial={url ?? ''}
          alTerminar={() => { setEditando(false) }}
          puedeCancelar={url !== null}
        />
      )}
    </section>
  )
}

/**
 * El boton que abre la carpeta en otra pestaña, con el servicio en el rotulo cuando se conoce.
 *
 * @param url el link guardado
 * @param puedeEditar si se ofrece cambiarlo
 * @param alCambiar pasa la franja a modo edicion
 * @returns el boton y, con permiso, el acceso a cambiar el link
 */
function EnlaceGuardado (
  { url, puedeEditar, alCambiar }: { url: string, puedeEditar: boolean, alCambiar: () => void }
): ReactElement {
  const servicio = servicioDelEnlace(url)

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {puedeEditar && (
        <Boton type="button" variante="sutil" tamano="chico" onClick={alCambiar}>
          Cambiar link
        </Boton>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={boton({ variante: 'primario', tamano: 'chico' })}
      >
        {servicio === null ? 'Abrir carpeta' : `Abrir en ${servicio}`}
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </div>
  )
}

interface PropsEditor {
  licitacionId: number
  /** El link actual, o vacio. */
  inicial: string
  /** Vuelve al boton despues de guardar o cancelar. */
  alTerminar: () => void
  /** Si hay un link guardado al que volver. */
  puedeCancelar: boolean
}

/**
 * Campo para pegar, cambiar o quitar el link. Guardar el campo vacio lo quita.
 *
 * Es un `<form>` para que `Enter` guarde: lo normal es pegar el link y apretar `Enter`. El error de
 * formato va bajo el campo; el de red o de la API, abajo, porque no es culpa de lo escrito.
 */
function EditorDeEnlace ({ licitacionId, inicial, alTerminar, puedeCancelar }: PropsEditor): ReactElement {
  const router = useRouter()
  const [texto, setTexto] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [errorDeCampo, setErrorDeCampo] = useState<string | undefined>(undefined)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Valida en el navegador y guarda; un link invalido no llega a salir. */
  async function guardar (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    const revision = revisarEnlaceDePresentacion(texto)

    if (!revision.valido) {
      setErrorDeCampo(revision.error)
      return
    }

    setGuardando(true)
    setErrorDeCampo(undefined)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/licitaciones/${licitacionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ presentacion_url: revision.url })
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      alTerminar()
      router.refresh()
    } catch {
      setFallo('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form className="flex max-w-2xl flex-col gap-3" onSubmit={(evento) => { void guardar(evento) }}>
      <ControlDeCampo
        campo={{
          clave: 'presentacion_url',
          etiqueta: 'Link de la carpeta',
          tipo: 'texto',
          maximo: LARGO_MAXIMO_ENLACE,
          ayuda: 'Pega el link de la carpeta de Drive. Vacío lo quita.'
        }}
        valor={texto}
        error={errorDeCampo}
        alCambiar={(valor) => {
          setTexto(typeof valor === 'string' ? valor : '')
          setErrorDeCampo(undefined)
        }}
      />
      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
      <div className="flex gap-2">
        <Boton type="submit" variante="primario" tamano="chico" cargando={guardando}>
          Guardar
        </Boton>
        {puedeCancelar && (
          <Boton type="button" variante="sutil" tamano="chico" disabled={guardando} onClick={alTerminar}>
            Cancelar
          </Boton>
        )}
      </div>
    </form>
  )
}
