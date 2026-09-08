'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cn } from '@/lib/clases'

/**
 * Editor del Meeting Paper, con reescritura por IA del fragmento seleccionado.
 *
 * === POR QUE ESTE ARCHIVO SE CARGA CON `next/dynamic` ===
 *
 * Son ~100 KB de JavaScript. `Pestanas` monta la pestaña de forma perezosa, pero **el bundle no**: un
 * `import` estático desde `PanelActas` mete ese peso en el chunk de `/espacios/[id]`, que es la
 * pantalla más usada del panel, y lo paga también quien nunca abre un acta. Quien lo importe tiene
 * que hacerlo con `dynamic(..., { ssr: false })`.
 *
 * `immediatelyRender: false` no es opcional: sin eso Next prerrenderiza este componente en el
 * servidor y TipTap rompe la hidratación.
 *
 * === EL ESQUEMA ES EL FORMATO DE ALMACENAMIENTO ===
 *
 * Lo que las extensiones no conocen, ProseMirror lo descarta **en silencio** al abrir el documento.
 * Por eso la lista es corta y coincide con lo que el prompt del backend le pide al modelo: párrafos,
 * títulos, listas, negrita, cursiva, subrayado, citas y separadores. Agregar una extensión después es
 * una línea; quitarla cuando ya hay actas que la usan es pérdida de datos.
 *
 * StarterKit v3 ya trae Link y Underline, así que no se instalan por separado.
 *
 * === POR QUE MONTAR HTML ACA NO ES UN XSS ===
 *
 * TipTap no inyecta el HTML en la página: lo parsea con `DOMParser` sobre un documento **desprendido**
 * y construye nodos contra su esquema. Ahí un `<script>` no ejecuta y un `<img onerror>` nunca
 * dispara, porque el nodo nunca entra al documento vivo. Lo que el esquema no cierra solo es el
 * `href` —`javascript:` sobrevive al parseo—, y por eso Link va con `protocols` explícito.
 *
 * De todos modos, **quien sanea de verdad es la API**: esto sale del navegador, y cualquiera con las
 * herramientas de desarrollo abiertas manda otra cosa. Lo de acá es defensa en profundidad.
 */

/** Las cuatro acciones de reescritura, con el verbo que ve la persona. */
const ACCIONES: Array<{ clave: string, etiqueta: string }> = [
  { clave: 'acortar', etiqueta: 'Acortar' },
  { clave: 'alargar', etiqueta: 'Alargar' },
  { clave: 'simplificar', etiqueta: 'Simplificar' },
  { clave: 'complejizar', etiqueta: 'Formalizar' }
]

interface PropsEditor {
  /** HTML inicial. Se monta una sola vez: los cambios posteriores los maneja el editor. */
  htmlInicial: string
  /** Recibe el HTML en cada cambio, para que el panel sepa que hay algo sin guardar. */
  onCambio: (html: string) => void
  /** Proyecto al que pertenece el acta: la reescritura cuelga de él para poder autorizarla. */
  proyectoId: number
  /** Apaga la reescritura por IA cuando la capa está desactivada. */
  conIa?: boolean
}

export function EditorDeActa ({ htmlInicial, onCambio, proyectoId, conIa = true }: PropsEditor): ReactElement {
  const [reescribiendo, setReescribiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          // `javascript:` sobrevive a cualquier parseo de HTML: el esquema no lo filtra solo.
          protocols: ['http', 'https', 'mailto']
        }
      }),
      Placeholder.configure({ placeholder: 'El acta de la reunión…' })
    ],
    content: htmlInicial,
    editorProps: {
      attributes: {
        class: 'acta-editor min-h-[24rem] rounded-chico border border-control-borde bg-control p-4 focus:outline-none'
      }
    },
    onUpdate: ({ editor: actual }) => { onCambio(actual.getHTML()) }
  })

  // El contenido cambia cuando termina una generación nueva sobre el mismo editor montado.
  useEffect(() => {
    if (editor !== null && htmlInicial !== editor.getHTML()) {
      editor.commands.setContent(htmlInicial)
    }
    // `editor.getHTML()` se lee adentro pero no va en las dependencias: cambia en cada tecla y
    // remontaría el contenido mientras alguien escribe.
  }, [htmlInicial, editor])

  if (editor === null) return <p className="text-texto-tenue text-sm">Cargando el editor…</p>

  /** Manda la selección a la API y la reemplaza por lo que devuelve. */
  async function reescribir (accion: string, actual: Editor): Promise<void> {
    const { from, to } = actual.state.selection
    const seleccion = actual.state.doc.textBetween(from, to, ' ').trim()

    if (seleccion === '') return

    setReescribiendo(true)
    setError(null)

    const resultado = await escribirEnBff<{ html: string }>(
      `ia/proyectos/${encodeURIComponent(String(proyectoId))}/acta-transformar`,
      'POST',
      { accion, texto: seleccion }
    )

    setReescribiendo(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    const html = resultado.datos?.html ?? ''
    if (html === '') {
      setError('La reescritura llegó vacía.')

      return
    }

    actual.chain().focus().deleteRange({ from, to }).insertContent(html).run()
  }

  return (
    <div className="flex flex-col gap-2">
      <BarraDeFormato editor={editor} />

      {conIa && (
        <BubbleMenu
          editor={editor}
          // Sin selección real no hay nada que reescribir, y el menú tapando el cursor molesta.
          shouldShow={({ from, to }) => from !== to}
        >
          <div className="border-linea bg-superficie-flotante rounded-control shadow-1 flex items-center gap-1 border p-1">
            {ACCIONES.map((accion) => (
              <Boton
                key={accion.clave}
                variante="sutil"
                tamano="chico"
                cargando={reescribiendo}
                onClick={() => { void reescribir(accion.clave, editor) }}
              >
                {accion.etiqueta}
              </Boton>
            ))}
          </div>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
    </div>
  )
}

/** Los formatos que el esquema entiende. Lo que no está acá tampoco se guarda. */
function BarraDeFormato ({ editor }: { editor: Editor }): ReactElement {
  const botones: Array<{ etiqueta: string, activo: string, aplicar: () => void }> = [
    { etiqueta: 'Título', activo: 'heading', aplicar: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { etiqueta: 'Subtítulo', activo: 'heading', aplicar: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { etiqueta: 'Negrita', activo: 'bold', aplicar: () => editor.chain().focus().toggleBold().run() },
    { etiqueta: 'Cursiva', activo: 'italic', aplicar: () => editor.chain().focus().toggleItalic().run() },
    { etiqueta: 'Lista', activo: 'bulletList', aplicar: () => editor.chain().focus().toggleBulletList().run() },
    { etiqueta: 'Cita', activo: 'blockquote', aplicar: () => editor.chain().focus().toggleBlockquote().run() }
  ]

  return (
    <div className="border-linea flex flex-wrap gap-1 border-b pb-2">
      {botones.map((boton) => (
        <button
          key={boton.etiqueta}
          type="button"
          onClick={boton.aplicar}
          aria-pressed={editor.isActive(boton.activo)}
          className={cn(
            'rounded-control px-2 py-1 text-xs font-medium transition-colors',
            editor.isActive(boton.activo) ? 'bg-acento text-acento-contenido' : 'text-texto-tenue hover:bg-hover'
          )}
        >
          {boton.etiqueta}
        </button>
      ))}
    </div>
  )
}
