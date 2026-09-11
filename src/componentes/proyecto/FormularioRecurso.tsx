'use client'

import { Fragment, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { cn } from '@/lib/clases'
import { aFechaDelContrato, aFechaLocal, enmascararFechaLocal } from '@/lib/fechas'
import { AsistenteDescripcion } from './AsistenteDescripcion'
import {
  cuerpoDelFormulario,
  validarFormulario,
  valoresIniciales,
  type CampoFormulario,
  type ValoresFormulario
} from './formulario'

/**
 * Formulario de alta y edicion, generico y en dialogo.
 *
 * Hitos, Notas y Discusiones son la misma operacion con distintos campos: un `POST` o un `PATCH` con
 * un puñado de valores y errores por campo. En vez de tres formularios casi iguales hay una
 * descripcion de campos (`CampoFormulario[]`) y este componente.
 *
 * El dialogo es Radix: la trampa de foco, el cierre con `Escape` y el `aria-modal` no se
 * reimplementan.
 */

interface PropsFormulario {
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
  titulo: string
  descripcion?: string
  campos: CampoFormulario[]
  /** Ruta del BFF sin barra inicial. Ej: `projects/93/milestones` o `projects/93/notes/5`. */
  ruta: string
  metodo: 'POST' | 'PATCH'
  /** Registro a editar, o `null` para un alta. Se lee por las claves de los campos. */
  registro?: Record<string, unknown> | null
  /** Se llama despues de guardar bien, para que la pestaña recargue su listado. */
  onGuardado: () => void
  /**
   * Dos columnas para formularios largos.
   *
   * Una ficha de cliente son dieciocho campos: en una sola columna el boton de guardar queda a dos
   * pantallas de scroll del primer campo.
   */
  columnas?: 1 | 2
  /** Ancho del dialogo, para acompañar a `columnas`. */
  ancho?: 'chico' | 'medio' | 'grande'
}

export function FormularioRecurso ({
  abierto,
  onAbiertoCambia,
  titulo,
  descripcion,
  campos,
  ruta,
  metodo,
  registro = null,
  onGuardado,
  columnas = 1,
  ancho = 'medio'
}: PropsFormulario): ReactElement {
  const [valores, setValores] = useState<ValoresFormulario>(() => valoresIniciales(campos, registro))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [fallo, setFallo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Al abrir se vuelve a sembrar: el dialogo se reusa para altas y ediciones, y conservar lo que
  // quedo escrito de la vez anterior haria guardar datos de otro registro. Se hace en el render y no
  // en un efecto porque el formulario tiene que aparecer ya sembrado, no sembrarse en un segundo
  // render con los campos vacios a la vista.
  const [abiertoPrevio, setAbiertoPrevio] = useState(abierto)
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto)

    if (abierto) {
      setValores(valoresIniciales(campos, registro))
      setErrores({})
      setFallo(null)
    }
  }

  /**
   * Valida y envia.
   *
   * Nunca lanza: un error del contrato es un valor que la persona tiene que poder leer, no una
   * excepcion que rompa la pantalla.
   */
  async function enviar (evento: React.FormEvent): Promise<void> {
    evento.preventDefault()

    const encontrados = validarFormulario(campos, valores)
    setErrores(encontrados)
    if (Object.keys(encontrados).length > 0) return

    setGuardando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(cuerpoDelFormulario(campos, valores))
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      onAbiertoCambia(false)
      onGuardado()
    } catch {
      setFallo('No se pudo guardar: revisa la conexión.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={onAbiertoCambia}>
      <ContenidoDialogo titulo={titulo} descripcion={descripcion} ancho={ancho}>
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void enviar(evento) }}>
          <div className={cn('grid gap-4', columnas === 2 && 'sm:grid-cols-2')}>
            {campos.map((campo) => (
              <Fragment key={campo.clave}>
                {campo.seccion !== undefined && (
                  <h3 className="text-texto-tenue border-linea-suave mt-2 border-b pb-1 text-xs font-semibold tracking-wide uppercase sm:col-span-full">
                    {campo.seccion}
                  </h3>
                )}
                <ControlDeCampo
                  campo={campo}
                  valor={valores[campo.clave]}
                  error={errores[campo.clave]}
                  titulo={tituloEscrito(campos, valores)}
                  proyectoId={proyectoDeLaRuta(ruta)}
                  alCambiar={(valor) => { setValores((previos) => ({ ...previos, [campo.clave]: valor })) }}
                />
              </Fragment>
            ))}
          </div>

          {fallo !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>
          )}

          <div className="flex justify-end gap-2">
            <Boton type="button" variante="sutil" onClick={() => { onAbiertoCambia(false) }}>
              Cancelar
            </Boton>
            <Boton type="submit" variante="primario" cargando={guardando}>Guardar</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * El titulo que se esta escribiendo, para darle contexto al asistente de IA.
 *
 * Es el primer campo de texto del formulario: en las siete altas que usan este componente —Fecha
 * Clave, Nota, Discusion, Proyecto, Licitacion, Upsell, Iteracion— ese campo es siempre el nombre o
 * el asunto. Buscarlo asi y no pedirselo a cada pantalla es lo que hace que el boton aparezca en las
 * siete sin tocar siete archivos.
 *
 * @param campos La descripcion del formulario.
 * @param valores Lo que hay escrito.
 * @returns El titulo, o la cadena vacia si el formulario no tiene uno (el asistente lo admite).
 */
function tituloEscrito (campos: CampoFormulario[], valores: ValoresFormulario): string {
  const primero = campos.find((campo) => campo.tipo === 'texto')

  if (primero === undefined) return ''

  const valor = valores[primero.clave]

  return typeof valor === 'string' ? valor : ''
}

/**
 * El Espacio al que pertenece lo que se esta creando, leido de la ruta del BFF.
 *
 * `projects/93/notes` y `projects/93` son el mismo Espacio 93; `tasks/40/iterations` no cuelga de
 * ninguno. Sacarlo de la ruta evita una prop que las siete pantallas tendrian que pasar y que seis
 * se olvidarian: la ruta ya lo sabe porque es la que va a recibir el `POST`.
 *
 * @param ruta Ruta del BFF sin barra inicial.
 * @returns El id del Espacio, o `null` si la ruta no cuelga de uno.
 */
function proyectoDeLaRuta (ruta: string): number | null {
  const encontrado = /^projects\/(\d+)(?:\/|$)/.exec(ruta)

  if (encontrado === null) return null

  const id = Number(encontrado[1])

  return Number.isSafeInteger(id) && id > 0 ? id : null
}

interface PropsControl {
  campo: CampoFormulario
  valor: string | boolean | undefined
  error: string | undefined
  alCambiar: (valor: string | boolean) => void
  /** Contexto para el asistente de IA de los campos `area`. Solo suma; puede faltar. */
  titulo?: string
  /** El Espacio del recurso, si cuelga de uno. Solo suma contexto para el asistente. */
  proyectoId?: number | null
}

/**
 * Dibuja el control que corresponde al tipo del campo.
 *
 * Se usan controles nativos (`<input type="color">`, `<input type="checkbox">`) en vez de widgets
 * propios: el navegador ya resuelve teclado, formato regional y accesibilidad.
 *
 * La excepcion es la fecha. `<input type="date">` es el unico nativo que **no** respeta el idioma del
 * documento: dibuja dia, mes y año en el orden del sistema operativo, asi que en un equipo en ingles
 * el formulario pide MM/DD/AAAA sin avisarlo. Ver `EntradaFecha`.
 */
export function ControlDeCampo (
  { campo, valor, error, alCambiar, titulo = '', proyectoId = null }: PropsControl
): ReactElement {
  const id = `campo-${campo.clave}`

  if (campo.tipo === 'booleano') {
    return (
      <label htmlFor={id} className="text-texto flex items-center gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={valor === true}
          onChange={(evento) => { alCambiar(evento.target.checked) }}
          className="accent-acento size-4"
        />
        {campo.etiqueta}
      </label>
    )
  }

  const texto = typeof valor === 'string' ? valor : ''

  if (campo.tipo === 'seleccion') {
    return (
      <Campo
        etiqueta={campo.etiqueta}
        requerido={campo.requerido}
        {...(campo.ayuda === undefined ? {} : { ayuda: campo.ayuda })}
        {...(error === undefined ? {} : { error })}
      >
        {(props) => (
          <Selector value={texto} onValueChange={alCambiar}>
            <DisparadorSelector marcador="Elige una opción" id={props.id} />
            <ContenidoSelector>
              {(campo.opciones ?? []).map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>
    )
  }

  if (campo.tipo === 'fecha') {
    return (
      <Campo
        etiqueta={campo.etiqueta}
        requerido={campo.requerido}
        ayuda={campo.ayuda ?? 'Día, mes y año: 31/12/2026.'}
        {...(error === undefined ? {} : { error })}
      >
        {(props) => <EntradaFecha props={props} valor={texto} alCambiar={alCambiar} />}
      </Campo>
    )
  }

  if (campo.tipo === 'area') {
    return (
      <>
        <Campo
          etiqueta={campo.etiqueta}
          requerido={campo.requerido}
          {...(campo.ayuda === undefined ? {} : { ayuda: campo.ayuda })}
          {...(error === undefined ? {} : { error })}
        >
          {(props) => (
            <AreaTexto
              {...props}
              rows={4}
              value={texto}
              onChange={(evento) => { alCambiar(evento.target.value) }}
            />
          )}
        </Campo>

        {/* Se monta siempre y se esconde solo, como en `EdicionTarea`: con la capa de IA apagada la
            sonda del propio asistente recibe un 404 y no pinta nada. Asi ningun formulario tiene que
            enterarse de si la IA esta contratada. */}
        {campo.sinAsistenteIa !== true && (
          <div className="flex justify-end">
            <AsistenteDescripcion
              titulo={titulo}
              proyectoId={proyectoId}
              onRedactada={(redactado) => { alCambiar(redactado) }}
            />
          </div>
        )}
      </>
    )
  }

  return (
    <Campo
      etiqueta={campo.etiqueta}
      requerido={campo.requerido}
      {...(campo.ayuda === undefined ? {} : { ayuda: campo.ayuda })}
      {...(error === undefined ? {} : { error })}
    >
      {(props) => (
        <Entrada
          {...props}
          type={tipoHtml(campo.tipo)}
          value={texto}
          {...(campo.min === undefined ? {} : { min: campo.min })}
          {...(campo.max === undefined ? {} : { max: campo.max })}
          onChange={(evento) => { alCambiar(evento.target.value) }}
        />
      )}
    </Campo>
  )
}

/** Los identificadores que `Campo` le cablea a su control. */
type PropsDeCampo = Parameters<Parameters<typeof Campo>[0]['children']>[0]

/**
 * Campo de fecha que se lee y se escribe como se lee y se escribe acá: `31/12/2026`.
 *
 * === POR QUE NO ES UN `<input type="date">` ===
 *
 * Porque ese control ignora el `lang="es"` del documento y ordena dia, mes y año segun el idioma del
 * SISTEMA OPERATIVO. En un equipo en ingles —la mitad de los notebooks del equipo— el mismo
 * formulario pide MM/DD/AAAA, y quien escribe 03/09 pensando en el 3 de septiembre guarda el 9 de
 * marzo. No hay atributo, CSS ni `lang` que lo cambie: es decision del navegador y no se expone.
 *
 * === POR QUE NO ES UN CALENDARIO PROPIO ===
 *
 * Porque el problema es el formato, no el calendario. Un date picker son cientos de lineas, foco,
 * teclado, zonas horarias y accesibilidad a mano, para resolver algo que un input de texto con
 * mascara resuelve entero. Lo que se pierde es el almanaque desplegable; lo que se gana es que la
 * fecha guardada sea la que la persona quiso.
 *
 * === QUE VIAJA HACIA ARRIBA ===
 *
 * El valor del formulario sigue siendo `YYYY-MM-DD`, sin excepcion: la traduccion muere acá y ni
 * `validarFormulario` ni `cuerpoDelFormulario` se enteran. Mientras la fecha esta a medio escribir
 * sube el texto crudo, que no pasa el formato y hace que el formulario lo señale al guardar: es
 * preferible a subir vacio, que perderia en silencio lo tipeado.
 */
function EntradaFecha (
  { props, valor, alCambiar }: {
    props: PropsDeCampo
    valor: string
    alCambiar: (valor: string) => void
  }
): ReactElement {
  const [texto, setTexto] = useState(() => aFechaLocal(valor))

  // El valor puede cambiar desde afuera —el dialogo se reabre y se vuelve a sembrar—, y entonces lo
  // escrito ya no corresponde. Se resincroniza en el render y no en un efecto por el mismo motivo que
  // la siembra de `FormularioRecurso`: el campo tiene que aparecer con el dato, no aparecer vacio y
  // llenarse en un segundo render.
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    setTexto(aFechaLocal(valor))
  }

  return (
    <Entrada
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      value={texto}
      onChange={(evento) => {
        const escrito = enmascararFechaLocal(evento.target.value)

        setTexto(escrito)
        alCambiar(aFechaDelContrato(escrito) ?? escrito)
      }}
    />
  )
}

/** Traduce el tipo de campo al `type` del input nativo. La fecha no pasa por acá: ver `EntradaFecha`. */
function tipoHtml (tipo: CampoFormulario['tipo']): string {
  if (tipo === 'color') return 'color'
  if (tipo === 'numero') return 'number'

  return 'text'
}
