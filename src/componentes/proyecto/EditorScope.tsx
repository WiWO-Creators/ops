'use client'

import { useId, useRef, useState, type ReactElement } from 'react'
import { Plus, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  camposDeInterpretacionPdf,
  contenidoDe,
  contenidoVacio,
  cuerpoDeGuardado,
  cuerpoDeInterpretacion,
  errorDeArchivo,
  entradaInicial,
  errorDeEntrada,
  erroresDeContenido,
  FUENTES_SCOPE,
  mensajeDeFalloIa,
  MOTIVO_IA_SCOPE,
  normalizarLista,
  ROTULO_LISTA,
  type EntradaScope
} from '@/dominio/scope'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoIa } from '@/dominio/ajustes'
import type { ContenidoScope, EstadoScope, FuenteScope, Interpretacion, Scope } from '@/datos/scope'
import { rutasDeScope } from '@/datos/scope'

/**
 * Editor del Scope: cargar, interpretar con IA, revisar y guardar.
 *
 * Son dos pasos y el segundo nunca se salta: **nada se guarda sin que la persona haya visto lo que
 * se entendio**. Primero se carga el contrato en una de tres formas —Estructurado, Texto libre o
 * PDF— y se pide «Interpretar»; la IA devuelve resumen, listas y observaciones, y eso se revisa y
 * corrige en el mismo formulario antes de «Guardar scope». Las observaciones son las ambigüedades
 * del contrato: van destacadas porque son lo que hay que aclarar con el cliente, no con la IA.
 *
 * Editar un Scope guardado arranca directo en la revision, con sus datos: corregir una linea no
 * deberia costar otra llamada al modelo. «Volver a la entrada» deja reinterpretar.
 */

interface PropsEditorScope {
  proyectoId: number
  /** El Scope guardado, o `null` si es la primera carga. */
  scope: Scope | null
  ia: EstadoIa
  /** Se llama con lo que devolvio el `PUT`. */
  onGuardado: (estado: EstadoScope) => void
  onCancelar: () => void
}

/** En que paso esta el editor. */
type Paso = 'entrada' | 'revision'

export function EditorScope ({ proyectoId, scope, ia, onGuardado, onCancelar }: PropsEditorScope): ReactElement {
  const rutas = rutasDeScope(proyectoId)
  const [entrada, setEntrada] = useState<EntradaScope>(() => entradaInicial(scope))
  const [archivo, setArchivo] = useState<File | null>(null)
  const [paso, setPaso] = useState<Paso>(scope === null ? 'entrada' : 'revision')
  const [contenido, setContenido] = useState<ContenidoScope>(() => scope === null ? contenidoVacio() : contenidoDe(scope))
  const [observaciones, setObservaciones] = useState<string[]>([])
  const [ocupado, setOcupado] = useState<'interpretando' | 'guardando' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [intentoGuardar, setIntentoGuardar] = useState(false)

  const motivoIa = MOTIVO_IA_SCOPE[ia.motivo]

  /** Pide a la IA que interprete lo cargado y pasa a la revision. */
  async function interpretar (): Promise<void> {
    const problema = errorDeEntrada(entrada)
    if (problema !== null) {
      setError(problema)
      return
    }

    if (!ia.activa) {
      setError(`${motivoIa.titulo} ${motivoIa.ayuda}`)
      return
    }

    setOcupado('interpretando')
    setError(null)

    const resultado = await escribirEnBff<Interpretacion>(rutas.interpretar, 'POST', cuerpoParaInterpretar(entrada, archivo))

    setOcupado(null)

    if (!resultado.ok) {
      setError(mensajeDeFalloIa(resultado, 'interpretar'))
      return
    }

    setContenido(contenidoDe(resultado.datos))
    setObservaciones(normalizarLista(resultado.datos.observaciones))
    setIntentoGuardar(false)
    setPaso('revision')
  }

  /** Lleva lo estructurado a la revision tal cual, sin pasar por la IA. */
  function revisarSinIa (): void {
    const problema = errorDeEntrada(entrada)
    if (problema !== null) {
      setError(problema)
      return
    }

    setError(null)
    setContenido(contenidoDe(entrada.estructurado))
    setObservaciones([])
    setPaso('revision')
  }

  /** Guarda lo revisado. */
  async function guardar (): Promise<void> {
    setIntentoGuardar(true)
    if (Object.keys(erroresDeContenido(contenido)).length > 0) return

    setOcupado('guardando')
    setError(null)

    const resultado = await escribirEnBff<EstadoScope>(rutas.scope, 'PUT', cuerpoDeGuardado(entrada, contenido))

    setOcupado(null)

    if (!resultado.ok) {
      // El `PUT` no pasa por la IA: su 404 es el Proyecto que ya no se ve, no la IA apagada. Solo
      // el 422 se traduce, porque trae el campo rechazado.
      setError(resultado.estado === 422 ? mensajeDeFalloIa(resultado, 'interpretar') : resultado.mensaje)
      return
    }

    onGuardado(resultado.datos)
  }

  const errores = intentoGuardar ? erroresDeContenido(contenido) : {}

  return (
    <section
      aria-label={`Editar el ${GLOSARIO.scope.singular.toLowerCase()}`}
      className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-4 border p-4"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-texto text-base font-semibold">
          {scope === null ? `Cargar el ${GLOSARIO.scope.singular.toLowerCase()} del contrato` : `Editar el ${GLOSARIO.scope.singular.toLowerCase()} del contrato`}
        </h2>
        <span className="text-texto-sutil text-xs">
          Paso {paso === 'entrada' ? '1 de 2: cargar' : '2 de 2: revisar lo que se entendió'}
        </span>
        {!ia.activa && <Insignia tono="aviso" tamano="chico" className="ml-auto">{motivoIa.chip}</Insignia>}
      </header>

      {paso === 'entrada'
        ? (
          <PasoEntrada
            entrada={entrada}
            archivo={archivo}
            onEntrada={(siguiente) => { setEntrada(siguiente); setError(null) }}
            onArchivo={(elegido) => {
              setArchivo(elegido)
              setEntrada((actual) => ({
                ...actual,
                archivo: elegido === null ? null : { nombre: elegido.name, tipo: elegido.type, bytes: elegido.size }
              }))
              setError(null)
            }}
          />
          )
        : (
          <PasoRevision
            contenido={contenido}
            observaciones={observaciones}
            errores={errores}
            onContenido={setContenido}
          />
          )}

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <footer className="flex flex-wrap items-center justify-end gap-2">
        <Boton variante="sutil" tamano="chico" onClick={onCancelar} disabled={ocupado !== null}>Cancelar</Boton>
        {paso === 'entrada'
          ? (
            <>
              {!ia.activa && entrada.fuente === 'estructurado' && (
                <Boton tamano="chico" onClick={revisarSinIa}>Revisar sin IA</Boton>
              )}
              <Boton variante="primario" tamano="chico" cargando={ocupado === 'interpretando'} onClick={() => { void interpretar() }}>
                {ocupado === 'interpretando' ? 'Interpretando…' : 'Interpretar'}
              </Boton>
            </>
            )
          : (
            <>
              <Boton tamano="chico" disabled={ocupado !== null} onClick={() => { setPaso('entrada'); setError(null) }}>
                Volver a la entrada
              </Boton>
              <Boton variante="primario" tamano="chico" cargando={ocupado === 'guardando'} onClick={() => { void guardar() }}>
                Guardar {GLOSARIO.scope.singular.toLowerCase()}
              </Boton>
            </>
            )}
      </footer>
    </section>
  )
}

/**
 * El cuerpo de la interpretacion: JSON, o multipart cuando es un PDF.
 *
 * @param entrada lo que se cargo
 * @param archivo el PDF elegido, si la forma es PDF
 * @returns el cuerpo para `escribirEnBff`
 */
function cuerpoParaInterpretar (entrada: EntradaScope, archivo: File | null): unknown {
  if (entrada.fuente !== 'pdf' || archivo === null) return cuerpoDeInterpretacion(entrada)

  const formulario = new FormData()
  for (const [campo, valor] of camposDeInterpretacionPdf(entrada)) formulario.append(campo, valor)
  formulario.append('archivo', archivo)

  return formulario
}

interface PropsPasoEntrada {
  entrada: EntradaScope
  archivo: File | null
  onEntrada: (entrada: EntradaScope) => void
  onArchivo: (archivo: File | null) => void
}

/** Paso 1: la forma de carga y lo que se carga. */
function PasoEntrada ({ entrada, archivo, onEntrada, onArchivo }: PropsPasoEntrada): ReactElement {
  const ayuda = FUENTES_SCOPE.find((opcion) => opcion.valor === entrada.fuente)?.ayuda

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Segmentado
          etiqueta="Forma de carga"
          etiquetaVisible
          tamano="chico"
          opciones={FUENTES_SCOPE.map(({ valor, etiqueta }) => ({ valor, etiqueta }))}
          activo={entrada.fuente}
          onElegir={(valor) => { onEntrada({ ...entrada, fuente: valor as FuenteScope }) }}
        />
        {ayuda !== undefined && <p className="text-texto-sutil text-xs">{ayuda}</p>}
      </div>

      {entrada.fuente === 'texto' && (
        <Campo etiqueta="Texto del contrato o la propuesta" requerido>
          {(props) => (
            <AreaTexto
              {...props}
              value={entrada.texto}
              rows={10}
              className="min-h-48"
              placeholder="Pega aquí el alcance tal como está en el contrato…"
              onChange={(evento) => { onEntrada({ ...entrada, texto: evento.target.value }) }}
            />
          )}
        </Campo>
      )}

      {entrada.fuente === 'pdf' && (
        <>
          <SelectorPdf archivo={archivo} guardado={entrada.archivoGuardado} onArchivo={onArchivo} />
          <Campo etiqueta="Contexto (opcional)" ayuda="Lo que el PDF no dice: acuerdos de palabra, anexos, prioridades.">
            {(props) => (
              <AreaTexto
                {...props}
                value={entrada.texto}
                onChange={(evento) => { onEntrada({ ...entrada, texto: evento.target.value }) }}
              />
            )}
          </Campo>
        </>
      )}

      {entrada.fuente === 'estructurado' && (
        <FormularioContenido
          contenido={entrada.estructurado}
          errores={{}}
          onContenido={(estructurado) => { onEntrada({ ...entrada, estructurado }) }}
        />
      )}
    </div>
  )
}

interface PropsSelectorPdf {
  archivo: File | null
  guardado: string | null
  onArchivo: (archivo: File | null) => void
}

/** Elige el PDF y dice en el acto si no sirve, antes de subir nada. */
function SelectorPdf ({ archivo, guardado, onArchivo }: PropsSelectorPdf): ReactElement {
  const id = useId()
  const campo = useRef<HTMLInputElement>(null)
  const problema = archivo === null ? null : errorDeArchivo({ nombre: archivo.name, tipo: archivo.type, bytes: archivo.size })

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-texto text-sm font-medium">PDF del contrato</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={campo}
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          className="text-texto file:border-control-borde file:bg-control file:text-texto file:rounded-control text-sm file:mr-3 file:h-8 file:border file:px-3 file:text-xs"
          aria-invalid={problema !== null || undefined}
          onChange={(evento) => { onArchivo(evento.target.files?.[0] ?? null) }}
        />
        {archivo !== null && (
          <Boton
            variante="sutil"
            tamano="chico"
            onClick={() => {
              if (campo.current !== null) campo.current.value = ''
              onArchivo(null)
            }}
          >
            Quitar
          </Boton>
        )}
      </div>
      {problema !== null
        ? <p role="alert" className="text-texto-peligro text-xs">{problema}</p>
        : (
          <p className="text-texto-sutil text-xs">
            {archivo === null && guardado !== null
              ? `Guardado: ${guardado}. Para reinterpretar hay que volver a subirlo.`
              : 'Solo PDF, hasta 10 MB.'}
          </p>
          )}
    </div>
  )
}

interface PropsPasoRevision {
  contenido: ContenidoScope
  observaciones: string[]
  errores: Partial<Record<keyof ContenidoScope, string>>
  onContenido: (contenido: ContenidoScope) => void
}

/** Paso 2: lo que entendio la IA, editable, con sus observaciones arriba. */
function PasoRevision ({ contenido, observaciones, errores, onContenido }: PropsPasoRevision): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      {observaciones.length > 0 && (
        <div role="status" className="border-linea bg-superficie-aviso text-texto-aviso rounded-tarjeta flex flex-col gap-1.5 border px-3 py-2">
          <p className="text-sm font-semibold">Conviene aclarar antes de guardar</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {observaciones.map((observacion) => <li key={observacion}>{observacion}</li>)}
          </ul>
        </div>
      )}
      <p className="text-texto-tenue text-sm">
        Esto es lo que se entendió del contrato. Corrige lo que haga falta: se guarda tal como quede acá.
      </p>
      <FormularioContenido contenido={contenido} errores={errores} onContenido={onContenido} />
    </div>
  )
}

interface PropsFormularioContenido {
  contenido: ContenidoScope
  errores: Partial<Record<keyof ContenidoScope, string>>
  onContenido: (contenido: ContenidoScope) => void
}

/** Resumen y las tres listas. Lo usan el modo Estructurado y la revision. */
function FormularioContenido ({ contenido, errores, onContenido }: PropsFormularioContenido): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Resumen" error={errores.resumen}>
        {(props) => (
          <AreaTexto
            {...props}
            value={contenido.resumen}
            placeholder="Qué se contrató, en dos o tres líneas."
            onChange={(evento) => { onContenido({ ...contenido, resumen: evento.target.value }) }}
          />
        )}
      </Campo>
      <div className="grid gap-4 lg:grid-cols-3">
        {(['incluye', 'excluye', 'supuestos'] as const).map((clave) => (
          <ListaEditable
            key={clave}
            rotulo={ROTULO_LISTA[clave]}
            items={contenido[clave]}
            error={errores[clave]}
            onItems={(items) => { onContenido({ ...contenido, [clave]: items }) }}
          />
        ))}
      </div>
    </div>
  )
}

interface PropsListaEditable {
  rotulo: string
  items: string[]
  error: string | undefined
  onItems: (items: string[]) => void
}

/**
 * Una lista de items editables, uno por fila.
 *
 * Deja filas en blanco para ir escribiendo; las vacias se descartan al interpretar y al guardar.
 * Enter en una fila agrega la siguiente, que es como se dicta una lista.
 */
function ListaEditable ({ rotulo, items, error, onItems }: PropsListaEditable): ReactElement {
  const filas = items.length === 0 ? [''] : items

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-texto mb-1.5 text-sm font-medium">{rotulo}</legend>
      <ul className="flex flex-col gap-1.5">
        {filas.map((item, indice) => (
          <li key={indice} className="flex items-center gap-1.5">
            <Entrada
              value={item}
              aria-label={`${rotulo}, ítem ${indice + 1}`}
              maxLength={500}
              onChange={(evento) => { onItems(filas.map((actual, i) => i === indice ? evento.target.value : actual)) }}
              onKeyDown={(evento) => {
                if (evento.key !== 'Enter') return
                evento.preventDefault()
                onItems([...filas.slice(0, indice + 1), '', ...filas.slice(indice + 1)])
              }}
            />
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              aria-label={`Quitar el ítem ${indice + 1} de ${rotulo}`}
              onClick={() => { onItems(filas.filter((_, i) => i !== indice)) }}
            >
              <X size={14} aria-hidden="true" />
            </Boton>
          </li>
        ))}
      </ul>
      <Boton variante="sutil" tamano="chico" className="self-start" onClick={() => { onItems([...filas, '']) }}>
        <Plus size={14} aria-hidden="true" />
        Agregar ítem
      </Boton>
      {error !== undefined && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </fieldset>
  )
}
