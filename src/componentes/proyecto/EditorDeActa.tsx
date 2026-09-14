'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Expand, GraduationCap, Heading2, Heading3, Italic, List, Quote, Shrink, Sparkles } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cn } from '@/lib/clases'
import type { LucideIcon } from 'lucide-react'
import { claseDeMarca, cssDeMarcas } from '@/dominio/marcas-acta'

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

/**
 * Las cuatro acciones de reescritura, con el verbo que ve la persona y su icono.
 *
 * El icono acompaña al verbo, no lo reemplaza: "Acortar" y "Simplificar" no tienen un dibujo que
 * signifique eso sin ayuda, y un menú de cuatro pictogramas sueltos obligaría a probarlos uno por uno
 * para saber qué hace cada cual. Lo que aporta el icono acá es reconocer la fila de un vistazo cuando
 * ya se sabe cuál es cuál.
 */
const ACCIONES: Array<{ clave: string, etiqueta: string, Icono: LucideIcon }> = [
  { clave: 'acortar', etiqueta: 'Acortar', Icono: Shrink },
  { clave: 'alargar', etiqueta: 'Alargar', Icono: Expand },
  { clave: 'simplificar', etiqueta: 'Simplificar', Icono: Sparkles },
  { clave: 'complejizar', etiqueta: 'Formalizar', Icono: GraduationCap }
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
  /**
   * Marca que firma el acta, para corregirla con la misma cara con la que se va a ver.
   *
   * Sin esto el editor mostraría el documento con los colores y la tipografía genéricos y el visor
   * con los de la marca: quien corrige estaría trabajando sobre algo que no es lo que se manda.
   */
  marca?: string | null
}

export function EditorDeActa ({ htmlInicial, onCambio, proyectoId, conIa = true, marca = null }: PropsEditor): ReactElement {
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
        class: `acta-editor acta-marca ${claseDeMarca(marca)} rounded-chico border-linea min-h-[24rem]`
          + ' border px-8 py-10 focus:outline-none'
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
      {/* Las mismas reglas que inyecta el visor en su iframe, servidas acá desde el mismo módulo:
          es lo único que mantiene a los dos lados mostrando el mismo documento. El origen va vacío
          porque acá sí resuelven las rutas relativas; el iframe es el que necesita el absoluto. */}
      <style>{cssDeMarcas('')}</style>

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
                <accion.Icono size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
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

/**
 * Los formatos que el esquema entiende. Lo que no está acá tampoco se guarda.
 *
 * Cada formato dice si está puesto con su propia consulta y no con un nombre de nodo suelto: los dos
 * niveles de título son el mismo nodo `heading`, así que con el nombre a secas se encendían los dos
 * botones a la vez y la barra mentía sobre lo que estaba aplicado.
 */
function BarraDeFormato ({ editor }: { editor: Editor }): ReactElement {
  const botones: Array<{ etiqueta: string, Icono: LucideIcon, puesto: boolean, aplicar: () => void }> = [
    {
      etiqueta: 'Título',
      Icono: Heading2,
      puesto: editor.isActive('heading', { level: 2 }),
      aplicar: () => editor.chain().focus().toggleHeading({ level: 2 }).run()
    },
    {
      etiqueta: 'Subtítulo',
      Icono: Heading3,
      puesto: editor.isActive('heading', { level: 3 }),
      aplicar: () => editor.chain().focus().toggleHeading({ level: 3 }).run()
    },
    {
      etiqueta: 'Negrita',
      Icono: Bold,
      puesto: editor.isActive('bold'),
      aplicar: () => editor.chain().focus().toggleBold().run()
    },
    {
      etiqueta: 'Cursiva',
      Icono: Italic,
      puesto: editor.isActive('italic'),
      aplicar: () => editor.chain().focus().toggleItalic().run()
    },
    {
      etiqueta: 'Lista',
      Icono: List,
      puesto: editor.isActive('bulletList'),
      aplicar: () => editor.chain().focus().toggleBulletList().run()
    },
    {
      etiqueta: 'Cita',
      Icono: Quote,
      puesto: editor.isActive('blockquote'),
      aplicar: () => editor.chain().focus().toggleBlockquote().run()
    }
  ]

  return (
    <div className="border-linea flex flex-wrap gap-1 border-b pb-2">
      {botones.map((boton) => (
        <button
          key={boton.etiqueta}
          type="button"
          onClick={boton.aplicar}
          aria-pressed={boton.puesto}
          /* El nombre va en `aria-label` y no en el texto de adentro porque el texto se esconde a
             menos de 640px: sin esto, en teléfono el boton se anunciaria vacio. `title` da el mismo
             nombre con el puntero encima, que es lo que se espera de una barra de formato. */
          aria-label={boton.etiqueta}
          title={boton.etiqueta}
          className={cn(
            'rounded-control ease-neo inline-flex h-8 items-center gap-1.5 px-2 text-xs font-semibold transition-colors duration-rapida sm:px-2.5',
            boton.puesto ? 'bg-acento text-acento-contenido' : 'text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          <boton.Icono size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          {/* A 400px los seis nombres empujaban la barra a tres renglones antes de que el acta
              empezara. Escondidos, los seis iconos entran en uno solo; desde `sm` vuelve el nombre,
              que es donde hay ancho de sobra para no hacer adivinar cuál es "Cita" y cuál "Lista". */}
          <span className="hidden sm:inline">{boton.etiqueta}</span>
        </button>
      ))}
    </div>
  )
}
