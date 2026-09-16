'use client'

import { ChevronDown, ChevronUp, ImageOff, Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { mensajeDeRespuesta, pedirSobre } from '@/datos/cliente'
import { cn } from '@/lib/clases'
import {
  ACEPTA_IMAGEN, FORMATOS, TEXTO_MAXIMO, TIPOS_DE_ANUNCIO, TITULO_MAXIMO, aplicarTipo, borradorDesde,
  camposMultipart, claveDeAlcance, cuerpoDeAnuncio, enOrden, erroresDelBorrador, idsEnOrden,
  moverAnuncio, pesoLegible, problemaDeLaImagen, renumerar, rutaDeAnuncios, sinErrores,
  type BorradorDeAnuncio
} from '@/dominio/anuncios-panel'
import type { AnuncioDePantallaEnPanel, PantallaDeAreaEnPanel, TipoDeAnuncio } from '@/datos/recursos'

interface Props {
  /** La global primero y despues las areas, como las ofrece el selector. Nunca vacia. */
  pantallas: PantallaDeAreaEnPanel[]
  /** Los anuncios del alcance que el servidor ya trajo: el de `pantallas[0]`. */
  inicial: AnuncioDePantallaEnPanel[]
  /** El error de esa primera carga, si lo hubo. La pantalla se dibuja igual: el selector sigue vivo. */
  avisoDeCarga?: string | null
}

/**
 * Los anuncios que se publican en los televisores de la pared.
 *
 * Un anuncio es lo unico de una pantalla de area que escribe una persona: el resto de las escenas
 * salen solas de la actividad del equipo. Cada anuncio es **un slide propio a pantalla completa** en
 * la rotacion, asi que tres anuncios son tres pantallas de doce segundos cada una — por eso la lista
 * se ordena a mano y por eso importa poder programar desde cuando y hasta cuando se ve cada uno.
 *
 * === EL ALCANCE SE ELIGE ARRIBA Y RECARGA LA LISTA ===
 *
 * Un anuncio pertenece a **una** pantalla: la de un area, o la de toda la compañia. La alternativa
 * era una sola lista con todos los alcances mezclados y una columna "área", y se descarto por una
 * razon concreta: `PUT …/anuncios/orden` exige la lista **completa del alcance y sin ids ajenos**, asi
 * que una lista mezclada obligaria a reconstruir mentalmente que subconjunto viaja en cada
 * reordenado. Con un alcance a la vez, lo que se ve en pantalla **es** lo que se manda, y no hay forma
 * de armar una lista incompleta.
 *
 * El precio es un viaje al cambiar de area. Es el correcto: casi nadie administra dos areas seguidas,
 * y traer de entrada los anuncios de las once areas para mostrar los de una seria pagarlo en cada
 * visita.
 */
export function AnunciosDePantalla ({ pantallas, inicial, avisoDeCarga = null }: Props): ReactElement {
  const primera = pantallas[0]
  const [clave, setClave] = useState(primera === undefined ? 'global' : claveDeAlcance(primera))
  const [anuncios, setAnuncios] = useState(() => enOrden(inicial))
  const [cargando, setCargando] = useState(false)
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(avisoDeCarga)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<AnuncioDePantallaEnPanel | 'nuevo' | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmando, setConfirmando] = useState<number | null>(null)

  const alcance = useMemo(
    () => pantallas.find((pantalla) => claveDeAlcance(pantalla) === clave) ?? primera,
    [pantallas, clave, primera]
  )
  const ruta = alcance === undefined ? null : rutaDeAnuncios(alcance)

  /**
   * El alcance cuyos anuncios ya estan en pantalla.
   *
   * Sin esto, el efecto de abajo volveria a pedir al montar lo que el servidor acaba de traer: una
   * peticion de mas en cada visita, y un parpadeo de "Cargando" sobre una lista que ya estaba bien.
   */
  const traido = useRef(clave)

  useEffect(() => {
    if (ruta === null || traido.current === clave) return

    const control = new AbortController()

    traido.current = clave
    setCargando(true)
    setErrorDeCarga(null)
    setError(null)
    setEditando(null)
    setConfirmando(null)

    pedirSobre<AnuncioDePantallaEnPanel[]>(ruta, control.signal)
      .then((sobre) => {
        setAnuncios(enOrden(sobre.data))
        setCargando(false)
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setErrorDeCarga(fallo instanceof Error ? fallo.message : 'No se pudieron traer los anuncios.')
        setCargando(false)
      })

    return () => { control.abort() }
  }, [clave, ruta])

  /**
   * Sube o baja un anuncio, adelantandose a la respuesta.
   *
   * Optimista a proposito: reordenar es un boton que se pulsa tres o cuatro veces seguidas, y esperar
   * un viaje por clic convierte "mover esto al final" en una espera de varios segundos con la lista
   * saltando. Si la API rechaza, la lista vuelve exactamente a donde estaba y el motivo se muestra
   * arriba — que es mas honesto que no dejar mover.
   */
  const reordenar = useCallback(async (id: number, direccion: -1 | 1): Promise<void> => {
    if (ruta === null) return

    const movidos = moverAnuncio(anuncios, id, direccion)

    // `moverAnuncio` devuelve la MISMA lista en los extremos: no hay nada que guardar.
    if (movidos === anuncios) return

    const previos = anuncios

    setAnuncios(renumerar(movidos))
    setError(null)
    setOcupado(true)

    const resultado = await escribirEnBff(`${ruta}/orden`, 'PUT', { ids: idsEnOrden(movidos) })

    setOcupado(false)

    if (!resultado.ok) {
      setAnuncios(previos)
      setError(resultado.mensaje)
    }
  }, [anuncios, ruta])

  const borrar = useCallback(async (id: number): Promise<void> => {
    if (ruta === null) return

    setError(null)
    setOcupado(true)

    const resultado = await escribirEnBff(`${ruta}/${id}`, 'DELETE')

    setOcupado(false)
    setConfirmando(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    // El 204 no trae cuerpo. Se renumera en local porque la API tambien renumera al borrar: sin esto,
    // el campo "orden" de los que quedan mostraria el hueco que dejo el borrado.
    setAnuncios((previos) => renumerar(previos.filter((anuncio) => anuncio.id !== id)))
  }, [ruta])

  const guardar = useCallback(async (
    borrador: BorradorDeAnuncio,
    imagen: File | null,
    quitarImagen: boolean
  ): Promise<boolean> => {
    if (ruta === null) return false

    const anterior = editando === 'nuevo' || editando === null ? null : editando
    const destino = anterior === null ? ruta : `${ruta}/${anterior.id}`
    const cuerpo = cuerpoDeAnuncio(borrador, quitarImagen)

    setError(null)
    setOcupado(true)

    const resultado = await enviarAnuncio(destino, cuerpo, imagen, anterior === null)

    setOcupado(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return false
    }

    const guardado = resultado.datos

    setAnuncios((previos) => enOrden(
      anterior === null
        ? [...previos, guardado]
        : previos.map((anuncio) => anuncio.id === guardado.id ? guardado : anuncio)
    ))
    setEditando(null)

    return true
  }, [editando, ruta])

  if (alcance === undefined) {
    return (
      <Vacio
        titulo="No hay ninguna pantalla"
        descripcion="Las áreas se crean en Accesos, y cada una puede tener la suya."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* Un `<label>` envolviendo el disparador de Radix lo abriria y lo cerraria de un solo clic:
            el nombre del control lo pone el `aria-label` del propio disparador. */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-texto text-sm font-medium">Pantalla</span>
          <Selector value={clave} onValueChange={setClave}>
            <DisparadorSelector aria-label="Pantalla cuyos anuncios se administran" className="w-72" />
            <ContenidoSelector>
              {pantallas.map((pantalla) => (
                <Opcion key={claveDeAlcance(pantalla)} value={claveDeAlcance(pantalla)}>
                  {pantalla.global ? `${pantalla.area_name} (todas las pantallas)` : pantalla.area_name}
                </Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        </div>

        <Boton
          variante="primario"
          onClick={() => { setEditando('nuevo'); setError(null) }}
          disabled={editando === 'nuevo' || cargando}
        >
          <Plus className="size-4" aria-hidden />
          Nuevo anuncio
        </Boton>
      </div>

      {error !== null && (
        <p role="alert" className="border-linea bg-superficie-peligro text-texto-peligro rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {editando !== null && (
        <FormularioDeAnuncio
          key={editando === 'nuevo' ? 'nuevo' : editando.id}
          anuncio={editando === 'nuevo' ? null : editando}
          ordenSugerido={anuncios.length}
          guardando={ocupado}
          onGuardar={guardar}
          onCancelar={() => { setEditando(null) }}
        />
      )}

      {cargando
        ? <Cargando alto="min-h-40" mensaje="Trayendo los anuncios…" />
        : errorDeCarga !== null
          ? <ErrorEstado detalle={errorDeCarga} />
          : anuncios.length === 0
            ? (
              <Vacio
                titulo="Todavía no hay anuncios"
                descripcion={`Nada que mostrar en ${alcance.area_name}. La escena de anuncios no se muestra mientras no haya ninguno vigente.`}
                accion={
                  <Boton variante="secundario" onClick={() => { setEditando('nuevo') }}>
                    Publicar el primero
                  </Boton>
                }
              />
              )
            : (
              <ul className="flex flex-col gap-2">
                {anuncios.map((anuncio, posicion) => (
                  <FilaDeAnuncio
                    key={anuncio.id}
                    anuncio={anuncio}
                    primera={posicion === 0}
                    ultima={posicion === anuncios.length - 1}
                    ocupado={ocupado}
                    confirmando={confirmando === anuncio.id}
                    onSubir={() => { void reordenar(anuncio.id, -1) }}
                    onBajar={() => { void reordenar(anuncio.id, 1) }}
                    onEditar={() => { setEditando(anuncio); setError(null) }}
                    onBorrar={() => {
                      if (confirmando === anuncio.id) void borrar(anuncio.id)
                      else setConfirmando(anuncio.id)
                    }}
                    onCancelarBorrado={() => { setConfirmando(null) }}
                  />
                ))}
              </ul>
              )}
    </div>
  )
}

/**
 * Manda un anuncio, por multipart si lleva imagen y por JSON si no.
 *
 * === POR QUE UNA EDICION CON IMAGEN VIAJA COMO `POST` ===
 *
 * No es una preferencia: **PHP solo parsea multipart en `POST`**. Un `PUT` con `FormData` llega al
 * servidor con `$_POST` y `$_FILES` vacios, y el resultado es un 422 sobre campos que si se
 * mandaron. Por eso la edicion cambia de verbo segun lleve archivo o no, y por eso esta decision vive
 * en una sola funcion en vez de repartida por los sitios donde se guarda.
 *
 * Esta acá y no en `mutaciones.ts` porque `subirArchivoEnBff` sube **un campo de archivo y nada mas**,
 * y un anuncio necesita el archivo y seis campos de texto en el mismo cuerpo.
 *
 * @param destino Ruta del BFF sin barra inicial: la coleccion para crear, la fila para editar.
 * @param esNuevo Decide el verbo cuando no hay archivo. Con archivo siempre es `POST`.
 */
async function enviarAnuncio (
  destino: string,
  cuerpo: Record<string, string | number | null>,
  imagen: File | null,
  esNuevo: boolean
): Promise<Resultado<AnuncioDePantallaEnPanel>> {
  if (imagen === null) {
    const resultado = await escribirEnBff<AnuncioDePantallaEnPanel | undefined>(
      destino,
      esNuevo ? 'POST' : 'PUT',
      cuerpo
    )

    if (!resultado.ok) return resultado

    // `escribirEnBff` devuelve `undefined` cuando la respuesta no trae envelope. Un 200 sin fila no
    // deja reconstruir la lista, y seguir como si nada dejaria en pantalla un anuncio inventado.
    if (resultado.datos === undefined) {
      return { ok: false, mensaje: 'El servidor no devolvió el anuncio guardado. Vuelve a cargar la página.' }
    }

    return { ok: true, datos: resultado.datos }
  }

  const formulario = new FormData()

  for (const [clave, valor] of camposMultipart(cuerpo)) formulario.append(clave, valor)

  formulario.append('image', imagen)

  let respuesta: Response

  try {
    respuesta = await fetch(`/api/bff/${destino}`, { method: 'POST', body: formulario })
  } catch {
    return { ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }
  }

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeRespuesta(respuesta) }

  try {
    const sobre = await respuesta.json() as { data?: AnuncioDePantallaEnPanel }

    if (sobre.data != null) return { ok: true, datos: sobre.data }
  } catch {
    // Un proxy puede devolver HTML con estado 200; eso no confirma que la imagen se haya guardado.
  }

  return { ok: false, mensaje: 'El servidor no confirmó que el anuncio se haya guardado. Vuelve a cargar la página.' }
}

/**
 * Una fila de la lista: que se ve, cuando se ve y los botones para moverla.
 *
 * El borrado es de dos pulsaciones y no de un dialogo modal: un anuncio se borra desde la misma fila
 * en la que se estaba mirando, y abrir una ventana encima para preguntar "¿seguro?" tapa justo lo
 * unico que ayuda a decidir — el propio anuncio. La segunda pulsacion vive donde estaba la primera.
 */
function FilaDeAnuncio ({
  anuncio, primera, ultima, ocupado, confirmando, onSubir, onBajar, onEditar, onBorrar, onCancelarBorrado
}: {
  anuncio: AnuncioDePantallaEnPanel
  primera: boolean
  ultima: boolean
  ocupado: boolean
  confirmando: boolean
  onSubir: () => void
  onBajar: () => void
  onEditar: () => void
  onBorrar: () => void
  onCancelarBorrado: () => void
}): ReactElement {
  const formato = FORMATOS[anuncio.tipo]

  return (
    <li
      className={cn(
        'border-linea bg-superficie-elevada flex flex-wrap items-center gap-3 rounded-lg border p-3',
        !anuncio.vigente_hoy && 'opacity-60'
      )}
    >
      <Miniatura anuncio={anuncio} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-texto truncate font-medium">
          {anuncio.titulo ?? (anuncio.tipo === 'imagen' ? anuncio.image_name ?? 'Imagen sin nombre' : 'Sin título')}
        </p>

        {anuncio.texto !== null && (
          <p className="text-texto-tenue line-clamp-2 text-sm">{anuncio.texto}</p>
        )}

        <p className="text-texto-sutil flex flex-wrap items-center gap-x-2 text-xs">
          <span>{formato.nombre}</span>
          <span aria-hidden>·</span>
          <Vigencia anuncio={anuncio} />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {confirmando
          ? (
            <>
              <Boton variante="peligro" tamano="chico" cargando={ocupado} onClick={onBorrar}>
                Borrar de verdad
              </Boton>
              <Boton variante="sutil" tamano="chico" soloIcono aria-label="Dejarlo como está" onClick={onCancelarBorrado}>
                <X className="size-4" aria-hidden />
              </Boton>
            </>
            )
          : (
            <>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                aria-label="Subir este anuncio en la rotación"
                disabled={primera || ocupado}
                onClick={onSubir}
              >
                <ChevronUp className="size-4" aria-hidden />
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                aria-label="Bajar este anuncio en la rotación"
                disabled={ultima || ocupado}
                onClick={onBajar}
              >
                <ChevronDown className="size-4" aria-hidden />
              </Boton>
              <Boton variante="sutil" tamano="chico" soloIcono aria-label="Editar este anuncio" onClick={onEditar}>
                <Pencil className="size-4" aria-hidden />
              </Boton>
              <Boton variante="sutil" tamano="chico" soloIcono aria-label="Borrar este anuncio" onClick={onBorrar}>
                <Trash2 className="size-4" aria-hidden />
              </Boton>
            </>
            )}
      </div>
    </li>
  )
}

/**
 * Cuando se ve el anuncio, dicho por la API y no recalculado acá.
 *
 * `vigente_hoy` lo calcula el servidor con el reloj del negocio. Volver a decidirlo en el navegador
 * —comparando las fechas contra el reloj del computador— daria una respuesta distinta para quien mire
 * esta pantalla desde otra zona horaria, y la que manda es la del televisor.
 */
function Vigencia ({ anuncio }: { anuncio: AnuncioDePantallaEnPanel }): ReactElement {
  if (anuncio.vigente_desde === null && anuncio.vigente_hasta === null) {
    return <span className="text-texto-exito">Siempre en la rotación</span>
  }

  return (
    <span className={cn('flex flex-wrap items-center gap-x-1', anuncio.vigente_hoy && 'text-texto-exito')}>
      <span>{anuncio.vigente_hoy ? 'En la pared hoy' : 'Fuera de la rotación hoy'}</span>
      <span aria-hidden>·</span>
      {anuncio.vigente_desde !== null && <>desde <Fecha valor={anuncio.vigente_desde} /></>}
      {anuncio.vigente_hasta !== null && <>hasta <Fecha valor={anuncio.vigente_hasta} /></>}
    </span>
  )
}

/**
 * El cuadradito de la izquierda de cada fila.
 *
 * Con `image_url` nulo y `image_name` cargado **hay imagen y no se puede mostrar**: la unica ruta que
 * sirve ese binario cuelga del codigo de la pantalla, y el area todavia no tiene codigo. El icono
 * tachado es para que eso no se lea como "no subiste nada" — la explicacion completa la da el
 * formulario al abrirlo.
 */
function Miniatura ({ anuncio }: { anuncio: AnuncioDePantallaEnPanel }): ReactElement {
  const marco = 'border-linea bg-superficie-hundida grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border'

  if (anuncio.image_url !== null) {
    return (
      <div className={marco}>
        {/* Sale de `uploads/` de la API, sin tamaño conocido: `next/image` no puede optimizarla. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={anuncio.image_url} alt="" className="size-full object-cover" />
      </div>
    )
  }

  if (anuncio.image_name !== null) {
    return (
      <div className={marco} title="La imagen está guardada, pero no se puede previsualizar todavía.">
        <ImageOff className="text-texto-sutil size-5" aria-hidden />
      </div>
    )
  }

  return (
    <div className={marco}>
      <Megaphone className="text-texto-sutil size-5" aria-hidden />
    </div>
  )
}

/**
 * El formulario de un anuncio, con la vista previa al lado.
 *
 * === LA VISTA PREVIA NO ES DECORACION ===
 *
 * Quien publica no va a ver el resultado: el televisor esta en otro piso y el anuncio sale dentro de
 * una rotacion de dos minutos. Sin una vista previa, la unica forma de comprobar que el titulo no tapa
 * la cara de la foto es bajar a mirar la pared. Por eso la vista previa tiene la proporcion real
 * (16:9), el mismo apilado —imagen de fondo, degradado, texto abajo— y se actualiza mientras se
 * teclea.
 *
 * === EL CAMPO "ORDEN" NO EXISTE ===
 *
 * La API acepta un `orden` entre 0 y 9999, pero escribirlo a mano es la peor forma de ordenar cinco
 * cosas: hay que conocer los numeros de las otras cuatro. Se ordena con los botones de subir y bajar
 * de la lista —la misma decision que `pantallas-panel.ts` tomo para las escenas—, y el borrador
 * conserva el `orden` que tenia para no moverlo al guardar. Uno nuevo entra al final.
 */
/** El archivo recien elegido y la URL con la que se lo previsualiza. Van juntos porque mueren juntos. */
interface ImagenElegida {
  archivo: File
  url: string
}

function FormularioDeAnuncio ({ anuncio, ordenSugerido, guardando, onGuardar, onCancelar }: {
  anuncio: AnuncioDePantallaEnPanel | null
  ordenSugerido: number
  guardando: boolean
  onGuardar: (borrador: BorradorDeAnuncio, imagen: File | null, quitarImagen: boolean) => Promise<boolean>
  onCancelar: () => void
}): ReactElement {
  const idFormato = useId()
  const entradaDeArchivo = useRef<HTMLInputElement>(null)
  const [borrador, setBorrador] = useState(() => borradorDesde(anuncio, ordenSugerido))
  const [elegida, setElegida] = useState<ImagenElegida | null>(null)
  const [quitarImagen, setQuitarImagen] = useState(false)
  const [problemaDeArchivo, setProblemaDeArchivo] = useState<string | null>(null)

  /**
   * Devuelve la memoria de la vista previa anterior.
   *
   * === POR QUE LA URL SE CREA EN EL MANEJADOR Y SE REVOCA ACA ===
   *
   * `createObjectURL` reserva memoria hasta que se la revoca a mano: sin esto, cambiar diez veces de
   * imagen deja diez copias del archivo vivas en la pestaña. La URL se crea al elegir el archivo
   * —donde ocurre el gesto, que es donde se permiten los efectos— y este efecto **solo limpia**: se
   * dispara cuando la elegida cambia y al desmontar, que son exactamente los dos momentos en que la
   * anterior deja de poder mostrarse.
   */
  useEffect(() => {
    if (elegida === null) return

    return () => { URL.revokeObjectURL(elegida.url) }
  }, [elegida])

  const guardada = anuncio?.image_name != null && !quitarImagen
  const tendraImagen = elegida !== null || guardada
  const errores = erroresDelBorrador(borrador, tendraImagen)
  const formato = FORMATOS[borrador.tipo]
  const puedeGuardar = sinErrores(errores) && problemaDeArchivo === null

  /**
   * Cambia el formato y arrastra la imagen con el.
   *
   * Pasar a "solo texto" **marca la imagen para quitarla**: la API contesta 422 si el formato no
   * admite imagen y la fila todavia la tiene, asi que la unica forma de que ese cambio funcione es
   * mandar `quitar_imagen`. Volver a un formato que si lleva imagen recupera la que estaba guardada,
   * porque hasta que no se guarda no se ha perdido nada.
   */
  const cambiarFormato = useCallback((tipo: TipoDeAnuncio): void => {
    setBorrador((previo) => aplicarTipo(previo, tipo))
    setProblemaDeArchivo(null)

    if (!FORMATOS[tipo].admiteImagen) {
      setElegida(null)
      setQuitarImagen(true)

      return
    }

    setQuitarImagen(false)
  }, [])

  /** Comprueba el archivo en el navegador: cinco megas rechazados por el servidor son cinco megas subidos. */
  const elegirArchivo = useCallback((evento: ChangeEvent<HTMLInputElement>): void => {
    const elegido = evento.target.files?.[0] ?? null

    evento.target.value = ''

    if (elegido === null) return

    const problema = problemaDeLaImagen(elegido)

    if (problema !== null) {
      setProblemaDeArchivo(problema)
      setElegida(null)

      return
    }

    setProblemaDeArchivo(null)
    setElegida({ archivo: elegido, url: URL.createObjectURL(elegido) })
    setQuitarImagen(false)
  }, [])

  const enviar = useCallback((): void => {
    void onGuardar(borrador, elegida?.archivo ?? null, quitarImagen)
  }, [borrador, elegida, onGuardar, quitarImagen])

  return (
    <section className="border-linea bg-superficie-elevada flex flex-col gap-4 rounded-lg border p-4">
      <h3 className="text-texto font-semibold">
        {anuncio === null ? 'Nuevo anuncio' : 'Editar el anuncio'}
      </h3>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-texto mb-2 text-sm font-medium">Formato</legend>

        <div className="grid gap-2 sm:grid-cols-3">
          {TIPOS_DE_ANUNCIO.map((tipo) => (
            <label
              key={tipo}
              className={cn(
                'border-linea flex cursor-pointer items-start gap-2 rounded-md border p-3',
                borrador.tipo === tipo && 'border-acento bg-hover'
              )}
            >
              <input
                type="radio"
                name={idFormato}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-acento)]"
                checked={borrador.tipo === tipo}
                onChange={() => { cambiarFormato(tipo) }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-texto text-sm font-medium">{FORMATOS[tipo].nombre}</span>
                <span className="text-texto-tenue text-xs">{FORMATOS[tipo].descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          {formato.admiteImagen && (
            <Imagen
              anuncio={anuncio}
              archivo={elegida?.archivo ?? null}
              quitada={quitarImagen}
              error={problemaDeArchivo ?? errores.imagen}
              onElegir={elegirArchivo}
              onQuitar={() => { setElegida(null); setQuitarImagen(true); setProblemaDeArchivo(null) }}
              entrada={entradaDeArchivo}
            />
          )}

          {formato.admiteTexto && (
            <>
              <Campo
                etiqueta="Título"
                error={errores.titulo}
                ayuda={`${borrador.titulo.length} de ${TITULO_MAXIMO} caracteres.`}
              >
                {(props) => (
                  <Entrada
                    {...props}
                    value={borrador.titulo}
                    maxLength={TITULO_MAXIMO}
                    placeholder="Cierre anticipado el viernes"
                    onChange={(evento) => { setBorrador({ ...borrador, titulo: evento.target.value }) }}
                  />
                )}
              </Campo>

              <Campo
                etiqueta="Texto"
                error={errores.texto}
                ayuda={`${borrador.texto.length} de ${TEXTO_MAXIMO} caracteres.`}
              >
                {(props) => (
                  <AreaTexto
                    {...props}
                    value={borrador.texto}
                    maxLength={TEXTO_MAXIMO}
                    placeholder="La oficina cierra a las 15:00. Quien necesite quedarse, avisa a su jefatura."
                    onChange={(evento) => { setBorrador({ ...borrador, texto: evento.target.value }) }}
                  />
                )}
              </Campo>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Desde" ayuda="En blanco, se ve desde ya.">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  value={borrador.vigenteDesde}
                  onChange={(evento) => { setBorrador({ ...borrador, vigenteDesde: evento.target.value }) }}
                />
              )}
            </Campo>

            <Campo etiqueta="Hasta" error={errores.vigencia} ayuda="En blanco, se ve hasta que se borre.">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  min={borrador.vigenteDesde === '' ? undefined : borrador.vigenteDesde}
                  value={borrador.vigenteHasta}
                  onChange={(evento) => { setBorrador({ ...borrador, vigenteHasta: evento.target.value }) }}
                />
              )}
            </Campo>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-texto-tenue text-sm">Así se verá en la pared</p>
          <VistaPreviaDelSlide
            tipo={borrador.tipo}
            titulo={borrador.titulo}
            texto={borrador.texto}
            imagen={elegida?.url ?? (quitarImagen ? null : anuncio?.image_url ?? null)}
            hayImagenSinVer={tendraImagen && elegida === null && (anuncio?.image_url ?? null) === null}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Boton variante="sutil" onClick={onCancelar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!puedeGuardar} cargando={guardando} onClick={enviar}>
          {anuncio === null ? 'Publicar' : 'Guardar'}
        </Boton>
      </div>
    </section>
  )
}

/**
 * El control de la imagen: elegir, reemplazar o quitar.
 *
 * El caso raro que hay que explicar es el del anuncio que **tiene** imagen y no se puede previsualizar
 * (`image_url` nulo con `image_name` cargado). Se dice con todas las letras y con el nombre del
 * archivo delante, porque lo contrario —un hueco gris— se lee como "se perdió la imagen" y lleva a
 * volver a subirla encima de una que estaba bien.
 */
function Imagen ({ anuncio, archivo, quitada, error, onElegir, onQuitar, entrada }: {
  anuncio: AnuncioDePantallaEnPanel | null
  archivo: File | null
  quitada: boolean
  error: string | undefined
  onElegir: (evento: ChangeEvent<HTMLInputElement>) => void
  onQuitar: () => void
  entrada: React.RefObject<HTMLInputElement | null>
}): ReactElement {
  const guardada = !quitada && anuncio?.image_name != null ? anuncio : null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-texto text-sm font-medium">Imagen</span>

      <input
        ref={entrada}
        type="file"
        accept={ACEPTA_IMAGEN}
        className="sr-only"
        onChange={onElegir}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="secundario" tamano="chico" onClick={() => { entrada.current?.click() }}>
          {archivo !== null || guardada !== null ? 'Cambiar la imagen' : 'Elegir una imagen'}
        </Boton>

        {(archivo !== null || guardada !== null) && (
          <Boton variante="sutil" tamano="chico" onClick={onQuitar}>
            Quitarla
          </Boton>
        )}
      </div>

      {archivo !== null && (
        <p className="text-texto-tenue text-xs">
          {archivo.name} · {pesoLegible(archivo.size)}
        </p>
      )}

      {archivo === null && guardada !== null && (
        <p className="text-texto-tenue text-xs">
          {guardada.image_name} · {pesoLegible(guardada.image_bytes)}
          {guardada.image_url === null && (
            <span className="text-texto-aviso block">
              Está guardada, pero no se puede previsualizar hasta que esta pantalla tenga código: la
              imagen se sirve por la dirección del televisor.
            </span>
          )}
        </p>
      )}

      <p className={cn('text-xs', error === undefined ? 'text-texto-sutil' : 'text-texto-peligro')} role={error === undefined ? undefined : 'alert'}>
        {error ?? 'JPG, PNG o WebP, hasta 5 MB. Horizontal, porque la pantalla lo es.'}
      </p>
    </div>
  )
}

/**
 * Como se vera el slide en la pared, en su proporcion real.
 *
 * 16:9 y no una caja cualquiera: el error que se comete con un anuncio es subir una foto vertical, y
 * en una vista previa cuadrada eso se ve bien. Acá se ve recortada, que es lo que va a pasar.
 *
 * El texto va abajo sobre un degradado, apilado sobre la imagen, y no al lado: es el mismo montaje
 * que usa el televisor, y ponerlo de otra forma acá haria que la vista previa mienta justo en lo unico
 * que se viene a comprobar.
 */
function VistaPreviaDelSlide ({ tipo, titulo, texto, imagen, hayImagenSinVer }: {
  tipo: TipoDeAnuncio
  titulo: string
  texto: string
  imagen: string | null
  /** Hay imagen guardada pero no hay forma de mostrarla: la pantalla todavia no tiene codigo. */
  hayImagenSinVer: boolean
}): ReactElement {
  const formato = FORMATOS[tipo]

  return (
    <div className="border-linea relative aspect-video w-full overflow-hidden rounded-lg border bg-neutral-900">
      {imagen !== null && (
        // Es un `blob:` del archivo recien elegido o una URL publica de la API: en los dos casos sin
        // tamaño conocido, asi que `next/image` no puede optimizarla.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagen} alt="" className="absolute inset-0 size-full object-cover" />
      )}

      {imagen === null && formato.exigeImagen && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <p className="text-sm text-neutral-400">
            {hayImagenSinVer
              ? 'La imagen está guardada. No se puede mostrar acá hasta que esta pantalla tenga código.'
              : 'Elige una imagen para ver cómo queda.'}
          </p>
        </div>
      )}

      {formato.admiteTexto && (titulo !== '' || texto !== '') && (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5',
            imagen !== null && 'bg-gradient-to-t from-black/85 to-transparent pt-16',
            tipo === 'texto' && 'inset-0 justify-center'
          )}
        >
          {titulo !== '' && (
            <p className="line-clamp-2 text-balance text-xl font-bold leading-tight text-white">{titulo}</p>
          )}
          {texto !== '' && (
            <p className="line-clamp-4 text-pretty text-sm leading-snug text-neutral-200">{texto}</p>
          )}
        </div>
      )}
    </div>
  )
}
