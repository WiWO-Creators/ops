'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Expand, GraduationCap, Handshake, Heading2, Heading3, Italic, List, ListCollapse, Quote, Shrink, Sparkles } from 'lucide-react'
import { DOMSerializer } from '@tiptap/pm/model'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cn } from '@/lib/clases'
import '@/estilos/acta.css'
import type { LucideIcon } from 'lucide-react'
import { claseDeMarca, cssDeMarcas } from '@/dominio/marcas-acta'
import {
  ACCIONES_DE_REESCRITURA,
  armarReescritura,
  LARGO_MAXIMO_INSTRUCCION,
  textoDeFragmento,
  type ClaveDeAccion,
  type PedidoDeReescritura
} from '@/dominio/reescritura-acta'

/**
 * Editor del Meeting Paper, con reescritura por IA del fragmento seleccionado.
 *
 * === POR QUE ESTE ARCHIVO SE CARGA CON `next/dynamic` ===
 *
 * Son ~100 KB de JavaScript. `Pestanas` monta la pestaña de forma perezosa, pero **el bundle no**: un
 * `import` estático desde `PanelActas` mete ese peso en el chunk de `/proyectos/[id]`, que es la
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
 * Los iconos de cada acción atajo. El verbo y la clave salen de `ACCIONES_DE_REESCRITURA`, que es lo
 * que el servidor acepta; acá solo se les pone cara.
 *
 * El icono acompaña al verbo, no lo reemplaza: "Acortar" y "Simplificar" no tienen un dibujo que
 * signifique eso sin ayuda.
 */
const ICONOS: Record<ClaveDeAccion, LucideIcon> = {
  acortar: Shrink,
  alargar: Expand,
  simplificar: Sparkles,
  complejizar: GraduationCap,
  resumir: ListCollapse,
  tono_cliente: Handshake
}

/** Caracteres de la sección que rodea al fragmento que viajan como contexto. */
const CONTEXTO_MAXIMO = 3500

/** Un cambio propuesto por la IA, esperando que alguien lo acepte. */
interface Propuesta {
  /** Rango del documento que se reemplaza. El editor queda bloqueado mientras exista, así que no se corre. */
  from: number
  to: number
  antes: string
  despues: string
  pedido: PedidoDeReescritura
  /** Fragmento y contexto que se mandaron, para poder reintentar sin volver a leer la selección. */
  fragmento: string
  contexto: string
}

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
  /** El acta que se edita: la API valida que sea de este Proyecto y usa el respaldo de su reunión. */
  actaId: number
  /** Avisa que un cambio de la IA se aplicó, para rotular el historial como `ia` al guardar. */
  onReescrituraIa?: () => void
}

export function EditorDeActa ({ htmlInicial, onCambio, proyectoId, conIa = true, marca = null, actaId, onReescrituraIa }: PropsEditor): ReactElement {
  const [reescribiendo, setReescribiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [instruccion, setInstruccion] = useState('')
  const [pidiendoAlActa, setPidiendoAlActa] = useState(false)

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

  /** El HTML del rango, tal como el editor lo serializa (conserva listas y negritas). */
  function htmlDelRango (actual: Editor, from: number, to: number): string {
    const contenedor = document.createElement('div')
    contenedor.appendChild(DOMSerializer.fromSchema(actual.schema).serializeFragment(actual.state.doc.slice(from, to).content))

    return contenedor.innerHTML
  }

  /** El texto de la sección (hasta el siguiente título) que contiene la posición, como contexto. */
  function contextoDe (actual: Editor, posicion: number): string {
    const bloques: string[] = []
    let dentro = false
    let terminado = false

    actual.state.doc.forEach((nodo, desplazamiento) => {
      if (terminado) return
      const fin = desplazamiento + nodo.nodeSize
      if (nodo.type.name === 'heading') {
        if (dentro) {
          terminado = true

          return
        }
        bloques.length = 0
      }
      bloques.push(nodo.textContent)
      if (posicion >= desplazamiento && posicion <= fin) dentro = true
    })

    return bloques.join('\n').slice(0, CONTEXTO_MAXIMO)
  }

  /**
   * Pide el cambio a la API y lo deja como propuesta: nada toca el documento hasta "Aplicar".
   *
   * El editor se bloquea mientras corre la llamada y mientras la propuesta espera, así el rango
   * `from..to` sigue siendo el que se eligió.
   */
  async function pedir (actual: Editor, pedido: PedidoDeReescritura, rango?: { from: number, to: number }): Promise<void> {
    const from = rango?.from ?? actual.state.selection.from
    const to = rango?.to ?? actual.state.selection.to
    const fragmento = htmlDelRango(actual, from, to)
    const contexto = contextoDe(actual, from)

    await enviar(actual, { from, to, antes: textoDeFragmento(fragmento), despues: '', pedido, fragmento, contexto })
  }

  async function enviar (actual: Editor, base: Propuesta): Promise<void> {
    const armado = armarReescritura(base.pedido, base.fragmento, base.contexto, actaId)

    if (!armado.ok) {
      setError(armado.motivo)

      return
    }

    setReescribiendo(true)
    setError(null)
    actual.setEditable(false, false)

    const resultado = await escribirEnBff<{ html: string }>(
      `ia/proyectos/${encodeURIComponent(String(proyectoId))}/acta-transformar`,
      'POST',
      armado.cuerpo
    )

    setReescribiendo(false)

    const html = resultado.ok ? resultado.datos?.html ?? '' : ''

    if (!resultado.ok || html === '') {
      // Con una propuesta en pantalla el editor sigue bloqueado: su rango solo vale mientras nadie escriba.
      if (propuesta === null) actual.setEditable(true, false)
      setError(resultado.ok ? 'La reescritura llegó vacía.' : resultado.mensaje)

      return
    }

    setPropuesta({ ...base, despues: html })
  }

  /** Aplica la propuesta como una sola transacción: un Ctrl+Z la deshace entera. */
  function aplicar (actual: Editor): void {
    if (propuesta === null) return

    actual.setEditable(true, false)
    actual.chain().focus().insertContentAt({ from: propuesta.from, to: propuesta.to }, propuesta.despues).run()
    setPropuesta(null)
    setInstruccion('')
    setPidiendoAlActa(false)
    onReescrituraIa?.()
  }

  function descartar (actual: Editor): void {
    actual.setEditable(true, false)
    setPropuesta(null)
  }

  /** Manda la instrucción escrita sobre la selección, o sobre el acta completa. */
  function pedirInstruccion (actual: Editor, alActa: boolean): void {
    const pedido: PedidoDeReescritura = { tipo: 'instruccion', instruccion }

    void pedir(actual, pedido, alActa ? { from: 0, to: actual.state.doc.content.size } : undefined)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Las mismas reglas que inyecta el visor en su iframe, servidas acá desde el mismo módulo:
          es lo único que mantiene a los dos lados mostrando el mismo documento. El origen va vacío
          porque acá sí resuelven las rutas relativas; el iframe es el que necesita el absoluto. */}
      <style>{cssDeMarcas('')}</style>

      <BarraDeFormato editor={editor} />

      {conIa && (
        <p className="text-texto-tenue flex items-center gap-1.5 text-xs">
          <Sparkles size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          Selecciona un fragmento para reescribirlo con IA.
        </p>
      )}

      {conIa && (
        <BubbleMenu
          editor={editor}
          // Sin selección real no hay nada que reescribir, y el menú tapando el cursor molesta.
          shouldShow={({ from, to }) => from !== to}
        >
          <div className="border-linea bg-superficie-flotante rounded-control shadow-1 flex items-center gap-1 border p-1">
            {ACCIONES_DE_REESCRITURA.map((accion) => {
              const Icono = ICONOS[accion.clave]

              return (
                <Boton
                  key={accion.clave}
                  variante="sutil"
                  tamano="chico"
                  cargando={reescribiendo}
                  onClick={() => { void pedir(editor, { tipo: 'accion', accion: accion.clave }) }}
                >
                  <Icono size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                  {accion.etiqueta}
                </Boton>
              )
            })}
            <form
              className="flex items-center gap-1"
              onSubmit={(evento) => { evento.preventDefault(); pedirInstruccion(editor, false) }}
            >
              <input
                type="text"
                value={instruccion}
                maxLength={LARGO_MAXIMO_INSTRUCCION}
                onChange={(evento) => { setInstruccion(evento.target.value) }}
                placeholder="Pídele un cambio…"
                aria-label="Pídele un cambio a la IA sobre la selección"
                className="border-linea bg-superficie rounded-chico h-8 w-44 border px-2 text-sm"
              />
              <Boton variante="primario" tamano="chico" type="submit" cargando={reescribiendo}>Pedir</Boton>
            </form>
          </div>
        </BubbleMenu>
      )}

      {conIa && propuesta === null && (
        pidiendoAlActa
          ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(evento) => { evento.preventDefault(); pedirInstruccion(editor, true) }}
            >
              <input
                type="text"
                value={instruccion}
                maxLength={LARGO_MAXIMO_INSTRUCCION}
                onChange={(evento) => { setInstruccion(evento.target.value) }}
                placeholder="Qué cambio quieres en todo el acta…"
                aria-label="Pídele un cambio a la IA sobre todo el acta"
                className="border-linea bg-superficie rounded-chico h-8 flex-1 border px-2 text-sm"
              />
              <Boton variante="primario" tamano="chico" type="submit" cargando={reescribiendo}>Pedir</Boton>
              <Boton variante="sutil" tamano="chico" type="button" onClick={() => { setPidiendoAlActa(false) }}>Cancelar</Boton>
            </form>
            )
          : (
            <div>
              <Boton variante="sutil" tamano="chico" onClick={() => { setPidiendoAlActa(true) }}>
                <Sparkles size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                Pedir un cambio al acta completa
              </Boton>
            </div>
            )
      )}

      {error !== null && <AvisoEnLinea variante="error" mensaje={error} className="text-sm" />}

      {propuesta !== null && (
        <section aria-label="Cambio propuesto por la IA" className="border-linea bg-superficie-flotante rounded-chico flex flex-col gap-3 border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="text-texto-tenue mb-1 text-xs font-medium uppercase">Antes</h4>
              <p className="max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">{propuesta.antes}</p>
            </div>
            <div>
              <h4 className="text-texto-tenue mb-1 text-xs font-medium uppercase">Después</h4>
              <p className="max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">{textoDeFragmento(propuesta.despues)}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Boton variante="sutil" tamano="chico" onClick={() => { descartar(editor) }}>Descartar</Boton>
            <Boton variante="secundario" tamano="chico" cargando={reescribiendo} onClick={() => { void enviar(editor, propuesta) }}>
              Reintentar
            </Boton>
            <Boton variante="primario" tamano="chico" onClick={() => { aplicar(editor) }}>Aplicar</Boton>
          </div>
        </section>
      )}

      <EditorContent editor={editor} />
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
