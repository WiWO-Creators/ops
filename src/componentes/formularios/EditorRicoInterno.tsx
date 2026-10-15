'use client'

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { Extensions } from '@tiptap/core'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Underline as Subrayado,
  type LucideIcon
} from 'lucide-react'
import { atributoAcceptDeImagenes, separarImagenes } from '@/dominio/imagenes-ricas'
import { direccionDeEnlace, esHtml, htmlVacio, textoAHtml } from '@/dominio/texto-rico'
import { extensionesDeTexto } from '@/lib/en-vivo/extensiones-texto'
import { LOCALE } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { Boton } from './Boton'
import { CLASES_CONTROL, Entrada } from './Entrada'
import { ALTO_MINIMO_RICO, EditorRicoMarcador } from './EditorRicoMarcador'
import { subirImagenRica, type DestinoDeImagenes } from './subirImagenRica'

/**
 * Cuerpo del editor de texto enriquecido. Se carga con `next/dynamic` desde `EditorRico`: nadie lo
 * importa directo, o el peso de Tiptap vuelve a viajar en el chunk de la pantalla.
 *
 * === EL ESQUEMA ES EL FORMATO ===
 *
 * Lo que las extensiones no conocen, ProseMirror lo descarta **en silencio** al abrir el documento.
 * La lista (`extensionesDeTexto`, en `lib/en-vivo/extensiones-texto.ts`) coincide con la de
 * `dominio/texto-rico.ts` —lo unico que `Contenido` sabe dibujar—: parrafos, titulos 2 y 3, listas,
 * negrita, cursiva, subrayado, tachado, enlaces, citas e imagenes propias (`ImagenRica`). Sin codigo,
 * bloque de codigo ni linea horizontal, que ninguna vista pinta. Vive aparte porque el servicio de
 * «Ops en vivo» tiene que convertir el texto con EXACTAMENTE el mismo esquema.
 *
 * === EDICION CONJUNTA ===
 *
 * Con la prop `colaboracion` el contenido es el de un documento Yjs compartido: no se pasa `content`
 * (lo escribiria encima), no hay marcador de posicion ni historial propio (el deshacer lo da Yjs) y,
 * si cambia la sesion, se crea un editor nuevo. Las extensiones de colaboracion llegan armadas de
 * fuera para que este cuerpo no cargue Yjs en cada campo de texto que no es conjunto.
 *
 * === IMAGENES ===
 *
 * Con la prop `imagenes`, pegar o arrastrar una imagen la sube a la API (`subirImagenRica`) y la
 * inserta como `<img>` de linea en el cursor, o donde se suelta; el boton «Imagen» de la barra hace lo
 * mismo con el selector de archivos, que es la via para quien no arrastra. Sin la prop, el editor no
 * se hace cargo de las imagenes y la barra no muestra el boton. Si el portapapeles trae texto ademas
 * de la imagen (Word, Excel), manda el texto: pegar una tabla no debe convertirse en una captura.
 *
 * === POR QUE MONTAR HTML ACA NO ES UN XSS ===
 *
 * Tiptap parsea con `DOMParser` sobre un documento desprendido y construye nodos contra su esquema:
 * un `<script>` no ejecuta y un `onerror` nunca dispara. Lo que el esquema no cierra solo es el
 * `href`, por eso `Link` va con `protocols` explicito. Quien sanea de verdad es la API.
 */

/** Las herramientas de la barra, en el orden en que se dibujan. */
export type HerramientaRica =
  | 'negrita' | 'cursiva' | 'subrayado' | 'h2' | 'h3' | 'vinetas' | 'numerada' | 'cita' | 'enlace' | 'imagen'

const TODAS: readonly HerramientaRica[] = [
  'negrita', 'cursiva', 'subrayado', 'h2', 'h3', 'vinetas', 'numerada', 'cita', 'enlace', 'imagen'
]

/**
 * Lo que convierte al editor en uno conjunto.
 *
 * `extensiones` son las de colaboracion (documento Yjs y cursores) ya armadas; `sesion` identifica el
 * documento Yjs al que pertenecen: cada documento necesita su editor, asi que cuando cambia (una
 * reconexion) el editor se vuelve a crear.
 */
export interface ColaboracionDelTexto {
  extensiones: Extensions
  sesion: object
}

/** Un contenido que reemplaza al del editor ya montado: cada `version` nueva se aplica una vez. */
export interface ReemplazoDelTexto {
  version: number
  /** HTML; cadena vacia para dejar el editor vacio. */
  html: string
}

export interface PropsEditorRico {
  /** HTML, o texto plano de una fila vieja (se convierte con `textoAHtml`). Se lee una sola vez. */
  valorInicial?: string | null
  /**
   * Edicion conjunta sobre un documento Yjs. Con ella `valorInicial` se ignora: el contenido viene del
   * documento compartido.
   */
  colaboracion?: ColaboracionDelTexto
  /**
   * Cambia el contenido del editor ya montado (una predefinida, la redaccion del asistente, vaciar tras
   * enviar). En edicion conjunta el cambio viaja a los demas como cualquier otra edicion; sin ella el
   * campo se remonta con otra `key`, y esto no hace falta. La version con la que se monta no se aplica.
   */
  reemplazo?: ReemplazoDelTexto
  /** Recibe el HTML en cada cambio; cadena vacia cuando no hay nada visible. */
  onCambio: (html: string) => void
  /**
   * Se llama una vez al montar con el HTML tal como lo normaliza el editor. Sirve para comparar
   * contra lo que se editara despues sin mandar un cambio que no es tal.
   */
  onListo?: (htmlNormalizado: string) => void
  /** Nombre accesible. Un `contenteditable` no es etiquetable con `<label for>`: va como `aria-label`. */
  etiqueta?: string
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
  placeholder?: string
  deshabilitado?: boolean
  /** Tope de texto visible (no del HTML). Muestra un contador; el que valida es quien lo usa. */
  maxCaracteres?: number
  /** Alto minimo en renglones. */
  filasMinimas?: number
  /** Ctrl+Enter o Cmd+Enter. */
  onEnviar?: () => void
  /** Subconjunto de herramientas; por omision, todas. */
  herramientas?: readonly HerramientaRica[]
  /** Pone el cursor al final del texto al montar, sin mover el scroll. */
  autoenfocar?: boolean
  /**
   * Activa las imagenes incrustadas (pegar, arrastrar y el boton de la barra) y dice a donde se suben.
   * Se lee al momento de subir, asi que puede cambiar mientras el editor esta montado (el Espacio que
   * elige el formulario). Sin esta prop, el editor no acepta imagenes.
   */
  imagenes?: DestinoDeImagenes
}

/** Lo que el editor entrega: `''` cuando no hay nada visible, que es lo que las validaciones esperan. */
function htmlDeEditor (editor: Editor): string {
  const html = editor.getHTML()

  return htmlVacio(html) ? '' : html
}

/** La definicion de cada boton: nombre, icono, si esta puesto y que hace. */
interface BotonDeBarra {
  clave: HerramientaRica
  etiqueta: string
  Icono: LucideIcon
  puesto: boolean
  aplicar: () => void
}

/**
 * Los botones de la barra, con su estado.
 *
 * Cada formato dice si esta puesto con su propia consulta y no con un nombre de nodo suelto: los dos
 * niveles de titulo son el mismo nodo `heading`, y con el nombre a secas se encenderian los dos.
 *
 * @param editor el editor montado
 * @param activos que formatos estan puestos en la seleccion
 * @param alternarEnlace abre o cierra el cuadro de enlace
 * @returns todos los botones; quien llama filtra por `herramientas`
 */
function botonesDe (
  editor: Editor,
  activos: Record<HerramientaRica, boolean>,
  alternarEnlace: () => void,
  elegirImagen: () => void
): BotonDeBarra[] {
  const cadena = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const definicion: Array<Omit<BotonDeBarra, 'puesto'>> = [
    { clave: 'negrita', etiqueta: 'Negrita', Icono: Bold, aplicar: () => cadena().toggleBold().run() },
    { clave: 'cursiva', etiqueta: 'Cursiva', Icono: Italic, aplicar: () => cadena().toggleItalic().run() },
    { clave: 'subrayado', etiqueta: 'Subrayado', Icono: Subrayado, aplicar: () => cadena().toggleUnderline().run() },
    { clave: 'h2', etiqueta: 'Título', Icono: Heading2, aplicar: () => cadena().toggleHeading({ level: 2 }).run() },
    { clave: 'h3', etiqueta: 'Subtítulo', Icono: Heading3, aplicar: () => cadena().toggleHeading({ level: 3 }).run() },
    { clave: 'vinetas', etiqueta: 'Lista con viñetas', Icono: List, aplicar: () => cadena().toggleBulletList().run() },
    { clave: 'numerada', etiqueta: 'Lista numerada', Icono: ListOrdered, aplicar: () => cadena().toggleOrderedList().run() },
    { clave: 'cita', etiqueta: 'Cita', Icono: Quote, aplicar: () => cadena().toggleBlockquote().run() },
    { clave: 'enlace', etiqueta: 'Enlace', Icono: Link2, aplicar: alternarEnlace },
    { clave: 'imagen', etiqueta: 'Insertar imagen', Icono: ImagePlus, aplicar: elegirImagen }
  ]

  return definicion.map((boton) => ({ ...boton, puesto: activos[boton.clave] }))
}

/** Que formatos estan puestos en la seleccion actual. Se re-evalua en cada transaccion del editor. */
function useFormatosActivos (editor: Editor | null): Record<HerramientaRica, boolean> {
  const estado = useEditorState({
    editor,
    selector: ({ editor: actual }) => ({
      negrita: actual?.isActive('bold') ?? false,
      cursiva: actual?.isActive('italic') ?? false,
      subrayado: actual?.isActive('underline') ?? false,
      h2: actual?.isActive('heading', { level: 2 }) ?? false,
      h3: actual?.isActive('heading', { level: 3 }) ?? false,
      vinetas: actual?.isActive('bulletList') ?? false,
      numerada: actual?.isActive('orderedList') ?? false,
      cita: actual?.isActive('blockquote') ?? false,
      enlace: actual?.isActive('link') ?? false,
      imagen: false
    })
  })

  return estado ?? {
    negrita: false, cursiva: false, subrayado: false, h2: false, h3: false,
    vinetas: false, numerada: false, cita: false, enlace: false, imagen: false
  }
}

export function EditorRicoInterno ({
  valorInicial = null,
  colaboracion,
  reemplazo,
  onCambio,
  onListo,
  etiqueta,
  id,
  'aria-describedby': describedby,
  'aria-invalid': invalido,
  'aria-required': requerido,
  placeholder = 'Escribe aquí…',
  deshabilitado = false,
  maxCaracteres,
  filasMinimas = 4,
  onEnviar,
  herramientas = TODAS,
  autoenfocar = false,
  imagenes
}: PropsEditorRico): ReactElement {
  // Los callbacks viajan por ref: el editor se crea una sola vez y no puede quedarse con los de la
  // primera pasada, que cierran sobre estado viejo.
  const onCambioRef = useRef(onCambio)
  const onEnviarRef = useRef(onEnviar)
  const onListoRef = useRef(onListo)
  const imagenesRef = useRef(imagenes)
  // Estado y no ref: la barra lo lee al dibujarse y un ref no puede leerse en el render.
  const [selectorDeImagen, setSelectorDeImagen] = useState<HTMLInputElement | null>(null)
  const subirImagenesRef = useRef<(archivos: File[], posicion?: number) => Promise<void>>(async () => {})
  const [caracteres, setCaracteres] = useState(0)
  const [enlaceAbierto, setEnlaceAbierto] = useState(false)
  // Imagenes que estan subiendo y el ultimo motivo por el que una no entro.
  const [subiendo, setSubiendo] = useState(0)
  const [falloDeImagen, setFalloDeImagen] = useState<string | null>(null)

  useEffect(() => {
    onCambioRef.current = onCambio
    onEnviarRef.current = onEnviar
    onListoRef.current = onListo
    imagenesRef.current = imagenes
  })

  const excedido = maxCaracteres !== undefined && caracteres > maxCaracteres
  const atributos = (): Record<string, string> => ({
    ...(id !== undefined ? { id } : {}),
    role: 'textbox',
    'aria-multiline': 'true',
    ...(etiqueta !== undefined ? { 'aria-label': etiqueta } : {}),
    ...(describedby !== undefined ? { 'aria-describedby': describedby } : {}),
    ...(invalido === true || excedido ? { 'aria-invalid': 'true' } : {}),
    ...(requerido === true ? { 'aria-required': 'true' } : {}),
    ...(deshabilitado ? { 'aria-disabled': 'true' } : {}),
    class: cn(
      CLASES_CONTROL,
      'texto-rico texto-rico-editor max-h-80 overflow-y-auto py-2 text-sm leading-relaxed',
      'aria-disabled:cursor-not-allowed aria-disabled:bg-superficie-hundida aria-disabled:text-texto-tenue'
    ),
    style: `--filas-rico: ${filasMinimas}; min-height: ${ALTO_MINIMO_RICO}`
  })

  const conjunto = colaboracion !== undefined

  const editor = useEditor({
    immediatelyRender: false,
    editable: !deshabilitado,
    extensions: conjunto
      ? [...extensionesDeTexto({ conHistorial: false }), ...colaboracion.extensiones]
      : [...extensionesDeTexto(), Placeholder.configure({ placeholder })],
    // Con Yjs el contenido lo da el documento compartido: pasar `content` lo escribiria encima.
    ...(conjunto
      ? {}
      : { content: valorInicial === null || valorInicial === '' ? '' : esHtml(valorInicial) ? valorInicial : textoAHtml(valorInicial) }),
    editorProps: {
      attributes: atributos(),
      handleKeyDown: (_vista, evento) => {
        if ((evento.ctrlKey || evento.metaKey) && evento.key === 'Enter' && onEnviarRef.current !== undefined) {
          evento.preventDefault()
          onEnviarRef.current()

          return true
        }

        return false
      },
      // Una captura pegada o una imagen soltada se sube y se inserta; todo lo demas sigue su camino.
      handlePaste: (_vista, evento) => {
        const portapapeles = evento.clipboardData
        const texto = (portapapeles?.getData('text/plain') ?? '').trim()
        const { imagenes: archivos } = separarImagenes(Array.from(portapapeles?.files ?? []))

        if (imagenesRef.current === undefined || archivos.length === 0 || texto !== '') return false

        evento.preventDefault()
        void subirImagenesRef.current(archivos)

        return true
      },
      handleDrop: (vista, evento, _rebanada, movido) => {
        const { imagenes: archivos } = separarImagenes(Array.from(evento.dataTransfer?.files ?? []))

        if (movido || imagenesRef.current === undefined || archivos.length === 0) return false

        evento.preventDefault()
        const posicion = vista.posAtCoords({ left: evento.clientX, top: evento.clientY })?.pos
        void subirImagenesRef.current(archivos, posicion)

        return true
      }
    },
    onCreate: ({ editor: actual }) => {
      setCaracteres(actual.getText().length)
      onListoRef.current?.(htmlDeEditor(actual))
      if (autoenfocar) actual.commands.focus('end', { scrollIntoView: false })
    },
    onUpdate: ({ editor: actual }) => {
      setCaracteres(actual.getText().length)
      onCambioRef.current(htmlDeEditor(actual))
    }
    // Cada documento Yjs necesita su editor: el de una sesion que se reconecto ya no sirve.
  }, [colaboracion?.sesion])

  // Aplica un contenido nuevo sobre el editor montado. La version con la que el campo se monta no
  // cuenta: es la que ya estaba y el contenido inicial ya la refleja.
  const versionAplicada = useRef(reemplazo?.version)

  useEffect(() => {
    if (editor === null || reemplazo === undefined || reemplazo.version === versionAplicada.current) return

    versionAplicada.current = reemplazo.version
    editor.commands.setContent(reemplazo.html)
  }, [editor, reemplazo])

  // Sube las imagenes y las inserta en el cursor, o en `posicion` si se soltaron ahi. Vive en un
  // efecto y se publica por ref porque el editor se crea una sola vez y sus manejadores de pegado y
  // arrastre no ven nada que cambie despues.
  useEffect(() => {
    if (editor === null) return

    subirImagenesRef.current = async (archivos, posicion) => {
      const destino = imagenesRef.current

      if (destino === undefined || !editor.isEditable) return

      setFalloDeImagen(null)
      let donde = posicion

      for (const archivo of archivos) {
        setSubiendo((n) => n + 1)
        const resultado = await subirImagenRica(archivo, destino)
        setSubiendo((n) => n - 1)

        if (editor.isDestroyed) return
        if (!resultado.ok) {
          setFalloDeImagen(resultado.mensaje)
          continue
        }

        const nodo = { type: 'imagenRica', attrs: { src: resultado.src, alt: resultado.alt } }

        if (donde === undefined) {
          editor.chain().focus().insertContent(nodo).run()
        } else {
          donde = Math.min(donde, editor.state.doc.content.size)
          editor.chain().focus().insertContentAt(donde, nodo).run()
          donde += 1
        }
      }
    }
  }, [editor])

  /** El selector de archivos del boton de la barra: lo que no es imagen se explica, no se ignora. */
  function alElegirImagenes (evento: ChangeEvent<HTMLInputElement>): void {
    const elegidos = Array.from(evento.target.files ?? [])

    // Se limpia para que elegir la misma imagen otra vez dispare el cambio.
    evento.target.value = ''
    if (elegidos.length === 0) return

    const { imagenes: validas, otros } = separarImagenes(elegidos)

    if (otros.length > 0) {
      setFalloDeImagen(`${otros.map((archivo) => `«${archivo.name}»`).join(', ')}: solo se pueden insertar imágenes PNG, JPG, GIF o WebP.`)
    }
    if (validas.length > 0) void subirImagenesRef.current(validas)
  }

  // Los atributos del `contenteditable` se fijan al crear: lo que cambia despues (el error que
  // aparece, el campo que se bloquea mientras se envia) se reaplica a mano.
  useEffect(() => {
    if (editor === null) return

    // Sin `emitUpdate`: cambiar el modo no es un cambio de contenido, y avisarlo borraria el error del
    // campo (`onCambio` lo limpia) justo cuando acaba de aparecer.
    if (editor.isEditable === deshabilitado) editor.setEditable(!deshabilitado, false)
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: atributos() } })
    // `atributos` se reconstruye en cada pasada; las dependencias son lo que de verdad lo cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, deshabilitado, invalido, excedido, describedby, requerido])

  // Un `contenteditable` no se enfoca desde `<label for>`: se reproduce el comportamiento a mano.
  useEffect(() => {
    if (editor === null || id === undefined) return

    const etiquetaDelCampo = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)
    const enfocar = (): void => { editor.commands.focus() }
    etiquetaDelCampo?.addEventListener('click', enfocar)

    return () => { etiquetaDelCampo?.removeEventListener('click', enfocar) }
  }, [editor, id])

  const activos = useFormatosActivos(editor)

  if (editor === null) return <EditorRicoMarcador etiqueta={etiqueta} />

  const visibles = botonesDe(editor, activos, () => { setEnlaceAbierto(!enlaceAbierto) }, () => { selectorDeImagen?.click() })
    .filter((boton) => herramientas.includes(boton.clave) && (boton.clave !== 'imagen' || imagenes !== undefined))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        {visibles.length > 0 && (
          <BarraRica
            botones={visibles}
            deshabilitado={deshabilitado}
            enlaceAbierto={enlaceAbierto}
          />
        )}

        {enlaceAbierto && (
          <PopoverEnlace
            editor={editor}
            onCerrar={() => {
              setEnlaceAbierto(false)
              editor.commands.focus()
            }}
          />
        )}
      </div>

      <EditorContent editor={editor} />

      {imagenes !== undefined && (
        <>
          <input
            ref={setSelectorDeImagen}
            type="file"
            multiple
            hidden
            accept={atributoAcceptDeImagenes()}
            aria-label="Elegir imágenes para insertar"
            onChange={alElegirImagenes}
          />
          <p className="sr-only" role="status" aria-live="polite">
            {subiendo > 0 ? 'Subiendo imagen…' : ''}
          </p>
          {subiendo > 0 && (
            <p className="text-texto-tenue text-xs" aria-hidden="true">
              {subiendo === 1 ? 'Subiendo imagen…' : `Subiendo ${subiendo} imágenes…`}
            </p>
          )}
          {falloDeImagen !== null && (
            <p role="alert" className="text-texto-peligro text-xs">{falloDeImagen}</p>
          )}
        </>
      )}

      {maxCaracteres !== undefined && (
        <p
          className={cn('text-xs tabular-nums text-right', excedido ? 'text-texto-peligro' : 'text-texto-sutil')}
          aria-live={excedido ? 'polite' : 'off'}
        >
          {caracteres.toLocaleString(LOCALE)} / {maxCaracteres.toLocaleString(LOCALE)}
        </p>
      )}
    </div>
  )
}

interface PropsBarra {
  botones: BotonDeBarra[]
  deshabilitado: boolean
  enlaceAbierto: boolean
}

/**
 * La barra de formato.
 *
 * `role="toolbar"` promete navegacion con flechas: un solo boton entra en el orden de tabulacion
 * (roving tabindex) y las flechas, Inicio y Fin mueven el foco entre los demas. Sin eso, nueve
 * botones seguidos son nueve paradas de Tab antes de llegar al texto.
 */
function BarraRica ({ botones, deshabilitado, enlaceAbierto }: PropsBarra): ReactElement {
  const [activo, setActivo] = useState(0)
  const barra = useRef<HTMLDivElement>(null)

  /** Mueve el foco al boton `indice` (con vuelta) y lo deja como el unico tabulable. */
  function enfocar (indice: number): void {
    const total = botones.length
    const destino = (indice + total) % total
    setActivo(destino)
    barra.current?.querySelectorAll<HTMLButtonElement>('button')[destino]?.focus()
  }

  function alPulsar (evento: KeyboardEvent<HTMLDivElement>): void {
    const teclas: Record<string, number> = {
      ArrowRight: activo + 1,
      ArrowLeft: activo - 1,
      Home: 0,
      End: botones.length - 1
    }
    const destino = teclas[evento.key]
    if (destino === undefined) return

    evento.preventDefault()
    enfocar(destino)
  }

  return (
    <div
      ref={barra}
      role="toolbar"
      aria-label="Formato del texto"
      aria-orientation="horizontal"
      onKeyDown={alPulsar}
      className="flex flex-wrap gap-0.5"
    >
      {botones.map((boton, indice) => (
        <button
          key={boton.clave}
          type="button"
          disabled={deshabilitado}
          tabIndex={indice === activo ? 0 : -1}
          aria-pressed={boton.puesto}
          aria-label={boton.etiqueta}
          aria-expanded={boton.clave === 'enlace' ? enlaceAbierto : undefined}
          title={boton.etiqueta}
          onFocus={() => { setActivo(indice) }}
          onMouseDown={(evento) => { evento.preventDefault() }}
          onClick={boton.aplicar}
          className={cn(
            'rounded-control ease-neo inline-flex size-8 cursor-pointer items-center justify-center transition-colors duration-rapida',
            'disabled:cursor-not-allowed disabled:text-texto-sutil',
            boton.puesto ? 'bg-acento text-acento-contenido' : 'text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          <boton.Icono size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

interface PropsPopover {
  editor: Editor
  onCerrar: () => void
}

/**
 * El cuadro para poner o quitar un enlace.
 *
 * Propio y no `window.prompt()`: el prompt del navegador no se estila, bloquea el hilo y no se puede
 * probar. Enter aplica, Escape cierra y devuelve el foco al texto.
 */
function PopoverEnlace ({ editor, onCerrar }: PropsPopover): ReactElement {
  const actual = editor.getAttributes('link') as { href?: string }
  const [direccion, setDireccion] = useState(actual.href ?? '')
  const [error, setError] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => { contenedor.current?.querySelector('input')?.focus() }, [])

  function aplicar (): void {
    const href = direccionDeEnlace(direccion)
    if (href === null) {
      setError('Escribe una dirección que empiece con http, https o mailto.')

      return
    }

    const { empty } = editor.state.selection
    if (empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    onCerrar()
  }

  function quitar (): void {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onCerrar()
  }

  return (
    <div
      ref={contenedor}
      role="group"
      aria-label="Enlace"
      onKeyDown={(evento) => {
        if (evento.key === 'Escape') {
          evento.preventDefault()
          evento.stopPropagation()
          onCerrar()
        }
      }}
      className="border-linea bg-superficie-flotante rounded-control shadow-1 absolute top-full left-0 z-20 mt-1 flex w-full max-w-sm flex-col gap-2 border p-2"
    >
      <Entrada
        type="url"
        inputMode="url"
        autoComplete="off"
        aria-label="Dirección del enlace"
        aria-invalid={error !== null ? true : undefined}
        placeholder="https://…"
        value={direccion}
        onChange={(evento) => {
          setDireccion(evento.target.value)
          setError(null)
        }}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault()
            aplicar()
          }
        }}
      />
      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
      <div className="flex flex-wrap justify-end gap-1">
        {editor.isActive('link') && <Boton variante="sutil" tamano="chico" onClick={quitar}>Quitar</Boton>}
        <Boton variante="sutil" tamano="chico" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" tamano="chico" onClick={aplicar}>Aplicar</Boton>
      </div>
    </div>
  )
}
