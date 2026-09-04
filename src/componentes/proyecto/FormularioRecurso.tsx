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

interface PropsControl {
  campo: CampoFormulario
  valor: string | boolean | undefined
  error: string | undefined
  alCambiar: (valor: string | boolean) => void
}

/**
 * Dibuja el control que corresponde al tipo del campo.
 *
 * Se usan controles nativos (`<input type="date">`, `<input type="color">`, `<input type="checkbox">`)
 * en vez de widgets propios: el navegador ya resuelve teclado, formato regional y accesibilidad.
 */
function ControlDeCampo ({ campo, valor, error, alCambiar }: PropsControl): ReactElement {
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

  return (
    <Campo
      etiqueta={campo.etiqueta}
      requerido={campo.requerido}
      {...(campo.ayuda === undefined ? {} : { ayuda: campo.ayuda })}
      {...(error === undefined ? {} : { error })}
    >
      {(props) => (
        campo.tipo === 'area'
          ? (
            <AreaTexto
              {...props}
              rows={4}
              value={texto}
              onChange={(evento) => { alCambiar(evento.target.value) }}
            />
            )
          : (
            <Entrada
              {...props}
              type={tipoHtml(campo.tipo)}
              value={texto}
              {...(campo.min === undefined ? {} : { min: campo.min })}
              {...(campo.max === undefined ? {} : { max: campo.max })}
              onChange={(evento) => { alCambiar(evento.target.value) }}
            />
            )
      )}
    </Campo>
  )
}

/** Traduce el tipo de campo al `type` del input nativo. */
function tipoHtml (tipo: CampoFormulario['tipo']): string {
  if (tipo === 'fecha') return 'date'
  if (tipo === 'color') return 'color'
  if (tipo === 'numero') return 'number'

  return 'text'
}
