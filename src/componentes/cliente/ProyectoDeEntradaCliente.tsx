'use client'

import { useEffect, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Campo } from '@/componentes/formularios/Campo'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { SelectorBuscable } from '@/componentes/formularios/Selector'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad } from '@/datos/tipos'

/** Lo que guarda y devuelve `GET|PUT /clients/{id}/proyecto-de-entrada`. */
interface ProyectoDeEntrada {
  project_id: number | null
  /** El nombre del elegido, o `null` si no hay ninguno o el elegido se fue a la papelera. */
  project_name: string | null
  activo: boolean
}

/** Lo minimo que esta pantalla necesita de cada Proyecto para ofrecerlo en el selector. */
interface OpcionDeProyecto {
  id: number
  name: string
}

/** `GET|PUT /clients/{id}/proyecto-de-entrada`, con el id ya escapado. */
function rutaDeEntrada (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/proyecto-de-entrada`
}

/** El valor del selector cuando no hay ningun Proyecto elegido. */
const SIN_ELEGIR = ''

interface Props {
  clienteId: number
  /** Los Proyectos del cliente que ya trajo la pestaña. No se vuelven a pedir. */
  proyectos: OpcionDeProyecto[]
  /** Capacidades sobre `customers`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

/**
 * Donde cae el contacto de este cliente cuando entra a su portal.
 *
 * === QUE HACE Y QUE NO ===
 *
 * Elige cual de los {@link GLOSARIO.espacio} que el contacto YA VE se abre primero, y nada mas. No
 * reparte acceso —a diferencia de Equipo y de {@link GLOSARIO.focal}, que si lo hacen— y por eso la
 * pantalla no lleva ninguna advertencia: lo peor que puede pasar con una eleccion equivocada es que
 * el contacto entre a un Proyecto suyo que no esperaba, y navegue al que quiera desde ahi.
 *
 * La API vuelve a comprobar en cada entrada que el Proyecto siga vivo, siga siendo de este cliente
 * y que ese contacto lo vea. Si algo de eso falla, el contacto cae en el Inicio de su portal sin
 * ningun error, que es donde caia antes de que esto existiera.
 *
 * === POR QUE APAGADO Y ELEGIDO SON DOS COSAS ===
 *
 * Porque apagar la apertura automatica no tiene por que borrar cual era el Proyecto: quien la apaga
 * una semana la vuelve a encender sin tener que acordarse. Por eso la casilla y el selector son dos
 * controles y se guardan juntos en un solo PUT.
 *
 * === POR QUE VIVE EN LA PESTAÑA DE PROYECTOS ===
 *
 * Porque la lista de Proyectos del cliente ya esta cargada ahi, y ese es el contexto en el que la
 * pregunta se entiende: se elige uno de los que estan justo debajo. En una pestaña propia seria una
 * pantalla entera para un campo, con su propia peticion de la misma lista.
 *
 * Sin `customers.edit` se dibuja en solo lectura, igual que Equipo y {@link GLOSARIO.focal}: saber
 * donde entra el cliente no es informacion reservada.
 *
 * @param clienteId el cliente que se esta mirando
 * @param proyectos sus Proyectos, ya traidos por la pestaña
 * @param capacidades capacidades sobre `customers`
 */
export function ProyectoDeEntradaCliente ({ clienteId, proyectos, capacidades }: Props) {
  const puedeEditar = capacidades.includes('edit')

  const [guardado, setGuardado] = useState<ProyectoDeEntrada | null>(null)
  const [elegido, setElegido] = useState<string>(SIN_ELEGIR)
  const [activo, setActivo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [avisoDeGuardado, setAvisoDeGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<ProyectoDeEntrada>(rutaDeEntrada(clienteId), aborto.signal)
      .then((sobre) => {
        if (aborto.signal.aborted) return

        setGuardado(sobre.data)
        setElegido(sobre.data.project_id === null ? SIN_ELEGIR : String(sobre.data.project_id))
        setActivo(sobre.data.activo)
      })
      .catch((fallo: unknown) => {
        if (aborto.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la apertura automática.')
      })

    return () => { aborto.abort() }
  }, [clienteId])

  /**
   * Guarda las dos decisiones juntas.
   *
   * El PUT manda siempre los dos campos porque la API los exige los dos: encender sin Proyecto
   * elegido es un 422 del backend, y se le adelanta acá deshabilitando el boton para que la persona
   * vea por que no puede guardar antes de intentarlo.
   */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando) return

    setEnviando(true)
    setError(null)
    setAvisoDeGuardado(false)

    const resultado = await escribirEnBff<ProyectoDeEntrada>(rutaDeEntrada(clienteId), 'PUT', {
      project_id: elegido === SIN_ELEGIR ? null : Number(elegido),
      activo
    })

    setEnviando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setGuardado(resultado.datos)
    setElegido(resultado.datos.project_id === null ? SIN_ELEGIR : String(resultado.datos.project_id))
    setActivo(resultado.datos.activo)
    setAvisoDeGuardado(true)
  }

  if (error !== null && guardado === null) {
    return (
      <Seccion>
        <p role="alert" className="text-texto-peligro text-sm">{error}</p>
      </Seccion>
    )
  }

  if (guardado === null) {
    return (
      <Seccion>
        <p className="text-texto-tenue text-sm">Cargando la apertura automática…</p>
      </Seccion>
    )
  }

  const opciones = proyectos.map((proyecto) => ({ valor: String(proyecto.id), etiqueta: proyecto.name }))
  const sinCambios = elegido === (guardado.project_id === null ? SIN_ELEGIR : String(guardado.project_id))
    && activo === guardado.activo

  if (!puedeEditar) {
    return (
      <Seccion>
        <SoloLectura guardado={guardado} />
      </Seccion>
    )
  }

  return (
    <Seccion>
      <form onSubmit={guardar} className="flex flex-col gap-3">
        <fieldset disabled={enviando} className="flex min-w-0 flex-col gap-3">
          <Campo
            etiqueta={`${GLOSARIO.espacio.singular} que se abre al entrar`}
            ayuda={`Si el contacto no puede ver este ${GLOSARIO.espacio.singular.toLowerCase()}, entra a su inicio como siempre.`}
            className="max-w-md"
          >
            {(props) => (
              <SelectorBuscable
                id={props.id}
                valor={elegido}
                onElegir={setElegido}
                opciones={opciones}
                marcador="Ninguno: entra a su inicio"
                nombre={GLOSARIO.espacio.singular.toLowerCase()}
              />
            )}
          </Campo>

          <label htmlFor="entrada-activa" className="text-texto flex items-center gap-2 text-sm">
            <input
              id="entrada-activa"
              type="checkbox"
              checked={activo}
              onChange={(evento) => { setActivo(evento.target.checked) }}
              className={CLASES_CASILLA}
            />
            Abrirlo automáticamente cuando el contacto entre
          </label>

          {activo && elegido === SIN_ELEGIR && (
            <p className="text-texto-tenue text-xs">
              Elegí primero el {GLOSARIO.espacio.singular.toLowerCase()} que se va a abrir.
            </p>
          )}
        </fieldset>

        {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
        {avisoDeGuardado && (
          <p role="status" className="text-texto-tenue text-xs">
            {guardado.activo && guardado.project_name !== null
              ? `Al entrar, sus contactos van a ver ${guardado.project_name}.`
              : 'Sus contactos entran a su inicio, como siempre.'}
          </p>
        )}

        <div>
          <Boton
            type="submit"
            tamano="chico"
            variante="primario"
            disabled={enviando || sinCambios || (activo && elegido === SIN_ELEGIR)}
            cargando={enviando}
          >
            Guardar apertura
          </Boton>
        </div>
      </form>
    </Seccion>
  )
}

/** El marco de la seccion, uno solo para los cuatro estados en que se dibuja. */
function Seccion ({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 flex flex-col gap-3 border p-5">
      <div>
        <h3 className="font-titular text-texto text-sm font-semibold">Al entrar al portal</h3>
        <p className="text-texto-tenue mt-1 text-xs">
          Dónde cae el contacto de este cliente apenas entra. No le da acceso a nada nuevo: solo
          elige cuál de sus {GLOSARIO.espacio.plural.toLowerCase()} se abre primero.
        </p>
      </div>

      {children}
    </section>
  )
}

/** Lo mismo para quien no puede cambiarlo: la decision escrita, sin controles que no sirven. */
function SoloLectura ({ guardado }: { guardado: ProyectoDeEntrada }) {
  if (!guardado.activo || guardado.project_name === null) {
    return <p className="text-texto-tenue text-sm">Sus contactos entran a su inicio, como siempre.</p>
  }

  return (
    <p className="text-texto text-sm">
      Al entrar, sus contactos ven <span className="font-medium">{guardado.project_name}</span>.
    </p>
  )
}
