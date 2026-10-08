'use client'

import { CornerDownRight, SendHorizontal, Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react'
import { AvisoEnLinea, Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { EditorRico } from '@/componentes/formularios/EditorRico'
import { GLOSARIO } from '@/dominio/glosario'
import { htmlVacio, textoPlano } from '@/dominio/texto-rico'
import { cn } from '@/lib/clases'
import { LOCALE } from '@/lib/fechas'
import { useRecurso } from './carga'
import {
  armarHilos,
  MAXIMO_COMENTARIO,
  type ComentarioDeHilo
} from './discusiones'
import { comentarioParaMostrar } from './tareas'
import { TarjetaDeComentario } from './TarjetaDeComentario'

/**
 * La conversacion de una Tarea: sus comentarios, las respuestas y el cuadro para escribir.
 *
 * Es la misma pieza en la ficha de la Tarea y en la pestaña de Discusiones del Proyecto: las dos leen
 * `GET /tasks/{id}/comments` y escriben en `POST /tasks/{id}/comments`, asi que lo que se comenta en
 * un lado aparece en el otro sin ninguna sincronizacion propia.
 *
 * **Ninguna escritura es optimista**, por la misma razon que en la lista de control: lo que se pinta
 * es lo que el servidor confirmo. El alta devuelve el comentario ya guardado —con su autor y su
 * fecha— y con eso se suma al hilo; un comentario pintado antes de que exista le haria creer a quien
 * escribe que el equipo ya lo leyo.
 *
 * El borrar se ofrece en todos los comentarios y decide la API: puede borrar quien lo escribio o
 * quien tiene `edit` sobre tareas, dentro de la ventana que fije el panel. Adivinar esa regla de este
 * lado esconderia un control que si funciona; el `403` llega con su mensaje y se pinta tal cual.
 * Como borrar una raiz se lleva sus respuestas, se pide confirmacion en el lugar.
 *
 * Solo lo monta el panel: el portal lee el hilo de adentro de la ficha y no escribe.
 */

/**
 * Entrada de un comentario recien escrito. Es la confirmacion de que se guardo, asi que solo la
 * llevan los de esta visita: animar el hilo entero al abrirlo seria ruido.
 */
const ENTRADA = 'motion-safe:animate-entrar-abajo'

interface PropsHiloDeComentarios {
  procesoId: number
  /** Se llama tras cada alta o borrado confirmado, para que quien lo monta refresque lo suyo. */
  onCambiado?: () => void
  /** Pone el foco en el cuadro al montar: la pestaña de Discusiones abre el hilo para responder. */
  enfocarAlAbrir?: boolean
  /** Titulo de la seccion. `null` lo quita, cuando quien lo monta ya nombra la conversacion. */
  titulo?: string | null
}

export function HiloDeComentarios (
  { procesoId, onCambiado, enfocarAlAbrir = false, titulo = 'Comentarios' }: PropsHiloDeComentarios
): ReactElement {
  const ruta = `tasks/${encodeURIComponent(String(procesoId))}/comments`
  const { estado, recargar } = useRecurso<ComentarioDeHilo[]>(ruta, 'No se pudieron cargar los comentarios.')

  /** El hilo despues de escribir. `null` mientras nadie escribio: manda lo que trajo la carga. */
  const [escritos, setEscritos] = useState<ComentarioDeHilo[] | null>(null)
  /** Los que se escribieron en esta visita: son los unicos que entran con animacion. */
  const [recientes, setRecientes] = useState<ReadonlySet<number>>(new Set())
  const [respondiendoA, setRespondiendoA] = useState<number | null>(null)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<number | null>(null)
  const [borrando, setBorrando] = useState<number | null>(null)
  const [errorBorrado, setErrorBorrado] = useState<{ id: number, mensaje: string } | null>(null)

  const cargados = estado.fase === 'listo' ? estado.datos : []
  const comentarios = escritos ?? cargados
  const hilos = armarHilos(comentarios)
  const laTarea = GLOSARIO.proceso.singular.toLowerCase()

  /**
   * Manda un comentario nuevo, o una respuesta, y lo suma al hilo con lo que devolvio la API.
   *
   * @param html lo que se escribio, como HTML del editor de texto enriquecido
   * @param padre el comentario raiz al que responde, o `null`
   * @returns el mensaje de error, o `null` si se guardo
   */
  async function enviar (html: string, padre: number | null): Promise<string | null> {
    const contenido = html.trim()
    if (htmlVacio(contenido)) return 'Escribe algo antes de enviar.'

    const resultado = await escribirEnBff<ComentarioDeHilo>(
      ruta,
      'POST',
      padre === null
        ? { content: contenido, format: 'html' }
        : { content: contenido, format: 'html', parent: padre }
    )

    if (!resultado.ok) return resultado.mensaje

    // La lectura de un comentario suelto no trae `parent_id` ni `contact`: se completan con lo que
    // se mando, que es lo que la API acaba de guardar.
    // Si la API no devolvio `content_html`, se pinta lo que se mando: `Contenido` lo filtra igual.
    const guardado: ComentarioDeHilo = {
      ...resultado.datos,
      content_html: resultado.datos.content_html ?? contenido,
      parent_id: padre,
      contact: null
    }

    // Actualizacion funcional: con una respuesta y un comentario viajando a la vez, la lista del
    // render en que salio cada uno ya no es la ultima, y el segundo en volver borraria al primero.
    setEscritos((previos) => [...(previos ?? cargados), guardado])
    setRecientes((previos) => new Set(previos).add(guardado.id))
    if (padre !== null) setRespondiendoA(null)
    onCambiado?.()
    return null
  }

  /**
   * Borra un comentario confirmado. Si era una raiz, sus respuestas se van con el, igual que en la API.
   *
   * @param id el comentario a borrar
   */
  async function borrar (id: number): Promise<void> {
    setBorrando(id)
    setErrorBorrado(null)

    const resultado = await escribirEnBff<undefined>(`${ruta}/${id}`, 'DELETE')

    setBorrando(null)

    if (!resultado.ok) {
      setErrorBorrado({ id, mensaje: resultado.mensaje })
      return
    }

    setConfirmandoBorrado(null)
    setEscritos((previos) => (previos ?? cargados).filter((c) => c.id !== id && c.parent_id !== id))
    onCambiado?.()
  }

  /** Vuelve a pedir el hilo y descarta lo escrito: el reintento parte de lo que diga el servidor. */
  function reintentar (): void {
    setEscritos(null)
    recargar()
  }

  /**
   * Los botones de un comentario: borrar, o la confirmacion en su lugar.
   *
   * @param comentario el comentario
   * @param respuestas cuantas respuestas se irian con el. `null` si es una respuesta
   */
  function acciones (comentario: ComentarioDeHilo, respuestas: number | null): ReactElement {
    if (confirmandoBorrado === comentario.id) {
      return (
        <ConfirmacionEnLinea
          disposicion="linea"
          advertencia={respuestas !== null && respuestas > 0
            ? `¿Borrar con sus ${respuestas} ${respuestas === 1 ? 'respuesta' : 'respuestas'}?`
            : '¿Borrar?'}
          etiquetaConfirmar="Borrar"
          cargando={borrando === comentario.id}
          onCancelar={() => { setConfirmandoBorrado(null) }}
          onConfirmar={() => { void borrar(comentario.id) }}
        />
      )
    }

    return (
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label="Borrar comentario"
        title="Borrar comentario"
        className={cn(
          'size-7 transition-opacity duration-150',
          'opacity-0 focus-visible:opacity-100 pointer-coarse:opacity-100',
          respuestas === null ? 'group-hover/respuesta:opacity-100' : 'group-hover/comentario:opacity-100'
        )}
        onClick={() => {
          setErrorBorrado(null)
          setConfirmandoBorrado(comentario.id)
        }}
      >
        <Trash2 aria-hidden className="size-3.5" strokeWidth={1.75} />
      </Boton>
    )
  }

  /**
   * El error del borrado, pegado al comentario que se quiso borrar.
   *
   * @param id el comentario
   */
  function errorDe (id: number): ReactElement | null {
    if (errorBorrado?.id !== id) return null

    return <AvisoEnLinea variante="error" mensaje={errorBorrado.mensaje} />
  }

  return (
    <section className="flex flex-col gap-3" aria-label={titulo ?? 'Conversación'}>
      {titulo !== null && (
        <h4 className="text-texto-tenue text-sm font-semibold">
          {titulo}
          {comentarios.length > 0 && (
            <span data-numerico className="text-texto-sutil ml-2 tabular-nums">{comentarios.length}</span>
          )}
        </h4>
      )}

      {estado.fase === 'cargando' && escritos === null && <Cargando alto="min-h-24" mensaje="Cargando los comentarios…" />}

      {estado.fase === 'error' && escritos === null && <ErrorEstado detalle={estado.mensaje} onReintentar={reintentar} />}

      {(estado.fase === 'listo' || escritos !== null) && hilos.length === 0 && (
        <p className="text-texto-sutil text-sm">
          Todavía no hay comentarios en esta {laTarea}. Lo que escribas aquí también se verá en las Discusiones del proyecto.
        </p>
      )}

      {hilos.length > 0 && (
        <ol className="flex flex-col gap-2">
          {hilos.map(({ raiz, respuestas }) => (
            <TarjetaDeComentario
              key={raiz.id}
              comentario={comentarioParaMostrar(raiz)}
              acciones={acciones(raiz, respuestas.length)}
              className={cn(recientes.has(raiz.id) && ENTRADA)}
            >
              {errorDe(raiz.id)}

              {respuestas.length > 0 && (
                <ol className="border-linea-suave mt-2 flex flex-col gap-1 border-l-2 pl-3">
                  {respuestas.map((respuesta) => (
                    <TarjetaDeComentario
                      key={respuesta.id}
                      anidado
                      comentario={comentarioParaMostrar(respuesta)}
                      acciones={acciones(respuesta, null)}
                      className={cn(recientes.has(respuesta.id) && ENTRADA)}
                    >
                      {errorDe(respuesta.id)}
                    </TarjetaDeComentario>
                  ))}
                </ol>
              )}

              {respondiendoA === raiz.id
                ? (
                  <div className="mt-2">
                    <CuadroDeComentario
                      etiqueta={`Responder a ${raiz.staff?.full_name ?? raiz.contact?.full_name ?? 'este comentario'}`}
                      placeholder="Escribe una respuesta…"
                      accion="Responder"
                      enfocar
                      onEnviar={async (texto) => await enviar(texto, raiz.id)}
                      onCancelar={() => { setRespondiendoA(null) }}
                    />
                  </div>
                  )
                : (
                  <button
                    type="button"
                    className="text-texto-tenue hover:text-texto focus-visible:text-texto mt-1 inline-flex w-fit items-center gap-1 rounded-chico text-xs font-medium transition-colors duration-150"
                    onClick={() => { setRespondiendoA(raiz.id) }}
                  >
                    <CornerDownRight aria-hidden className="size-3.5" strokeWidth={1.75} />
                    Responder
                  </button>
                  )}
            </TarjetaDeComentario>
          ))}
        </ol>
      )}

      {estado.fase !== 'error' && (
        <CuadroDeComentario
          etiqueta={`Comentar en esta ${laTarea}`}
          placeholder="Escribe un comentario para el equipo…"
          accion="Comentar"
          enfocar={enfocarAlAbrir}
          onEnviar={async (texto) => await enviar(texto, null)}
        />
      )}
    </section>
  )
}

interface PropsCuadroDeComentario {
  /** Nombre accesible del cuadro: no tiene etiqueta visible. */
  etiqueta: string
  placeholder: string
  /** Rotulo del boton de envio. */
  accion: string
  enfocar?: boolean
  /** Manda el HTML. Devuelve el error a mostrar, o `null` si se guardo. */
  onEnviar: (html: string) => Promise<string | null>
  /** Si esta, `Escape` y el boton Cancelar cierran el cuadro. */
  onCancelar?: () => void
}

/**
 * El cuadro para escribir un comentario o una respuesta.
 *
 * `Ctrl`/`Cmd` + `Enter` envia, porque `Enter` solo es un salto de linea: un comentario de varios
 * parrafos es lo normal y no puede salir a medio escribir. El texto se conserva si el envio falla.
 *
 * El editor no es controlado: vaciarlo tras enviar es remontarlo con otra `key`. El tope de
 * `MAXIMO_COMENTARIO` se mide sobre el texto visible y no sobre el marcado, que la persona no escribio.
 */
function CuadroDeComentario (
  { etiqueta, placeholder, accion, enfocar = false, onEnviar, onCancelar }: PropsCuadroDeComentario
): ReactElement {
  const [html, setHtml] = useState('')
  const [version, setVersion] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idError = useId()
  const idAyuda = useId()

  const largo = textoPlano(html).length
  const vacio = htmlVacio(html)
  const excedido = largo > MAXIMO_COMENTARIO
  const cercaDelTope = largo > MAXIMO_COMENTARIO * 0.9

  async function enviar (evento?: FormEvent<HTMLFormElement>): Promise<void> {
    evento?.preventDefault()
    if (vacio || excedido || enviando) return

    setEnviando(true)
    setError(null)
    const fallo = await onEnviar(html)
    setEnviando(false)

    if (fallo !== null) {
      setError(fallo)
      return
    }

    setHtml('')
    setVersion((actual) => actual + 1)
  }

  function alTeclear (evento: KeyboardEvent<HTMLFormElement>): void {
    if (evento.key === 'Escape' && onCancelar !== undefined) {
      evento.preventDefault()
      onCancelar()
    }
  }

  return (
    <form onSubmit={(evento) => { void enviar(evento) }} onKeyDown={alTeclear} className="flex flex-col gap-2">
      <EditorRico
        key={version}
        etiqueta={etiqueta}
        placeholder={placeholder}
        filasMinimas={2}
        aria-invalid={error !== null || excedido || undefined}
        aria-describedby={error !== null ? `${idAyuda} ${idError}` : idAyuda}
        autoenfocar={enfocar || version > 0}
        deshabilitado={enviando}
        onCambio={setHtml}
        onEnviar={() => { void enviar() }}
      />

      <div className="flex items-center justify-between gap-3">
        <span id={idAyuda} className="text-texto-sutil pl-1 text-xs">
          {cercaDelTope
            ? <span className={cn('tabular-nums', excedido && 'text-texto-peligro')}>{largo.toLocaleString(LOCALE)} / {MAXIMO_COMENTARIO.toLocaleString(LOCALE)}</span>
            : <span className="pointer-coarse:hidden">Ctrl + Enter para enviar</span>}
        </span>

        <span className="flex items-center gap-1">
          {onCancelar !== undefined && (
            <Boton variante="sutil" tamano="chico" onClick={onCancelar}>Cancelar</Boton>
          )}
          <Boton type="submit" variante="primario" tamano="chico" cargando={enviando} disabled={vacio || excedido}>
            {!enviando && <SendHorizontal aria-hidden className="size-3.5" strokeWidth={1.75} />}
            {accion}
          </Boton>
        </span>
      </div>

      {error !== null && (
        <AvisoEnLinea id={idError} variante="error" mensaje={error} className="rounded-chico px-3 py-2" />
      )}
    </form>
  )
}
