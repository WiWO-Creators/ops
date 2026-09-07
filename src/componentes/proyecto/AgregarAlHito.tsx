'use client'

import { Plus } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import {
  cuerpoDeAltaEnHito,
  filtrarCandidatas,
  movimientoAlHito,
  rutaTareasSinHito,
  validarAltaEnHito,
  type TareaCandidata
} from './agregar-al-hito'
import { cuerpoMoverHito } from './hitos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * El "+" de la cabecera de una columna del kanban de Hitos.
 *
 * Abre un solo dialogo con los dos caminos que la persona puede querer: **crear** una tarea que nazca
 * ya colgada de ese hito, o **sumar** una de las que hoy no tienen ninguno. Son dos caminos y no dos
 * botones porque quien aprieta el "+" todavia no decidio cual de los dos es: la decision se toma
 * viendo la lista de sueltas.
 *
 * No lo lleva la columna sintetica "Sin categorizar": no es un hito, es el cajon de lo que no se
 * clasifico, y "agregar algo sin clasificar" ya es crear una tarea a secas.
 */

/** Los dos caminos del dialogo. `nueva` es el primero porque es el que se usa a diario. */
const CAMINOS: readonly OpcionSegmentada[] = [
  { valor: 'nueva', etiqueta: 'Crear nueva' },
  { valor: 'existente', etiqueta: 'Sumar existente' }
]

/** Prioridad "Normal" de Perfex. Es el valor por defecto del alta en toda la aplicacion. */
const PRIORIDAD_POR_DEFECTO = '2'

/** Lo que hace falta para pintar la lista de tareas sin hito. El error es un texto listo. */
type CargaSueltas =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', tareas: TareaCandidata[] }

interface PropsAgregarAlHito {
  proyectoId: number
  /** El hito de la columna donde se apreto el "+". */
  hito: { id: number, name: string }
  /** Catalogo de prioridades, para el selector del alta. */
  prioridades: OpcionFiltro[]
  /**
   * Se llama cuando la operacion salio bien. Es el mismo refresco que usa el arrastre: quien monta
   * esto le pasa el `recargar` del tablero, no un segundo camino de recarga.
   */
  onListo: () => void | Promise<void>
}

export function AgregarAlHito ({ proyectoId, hito, prioridades, onListo }: PropsAgregarAlHito): ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [camino, setCamino] = useState<'nueva' | 'existente'>('nueva')

  const [nombre, setNombre] = useState('')
  const [prioridad, setPrioridad] = useState(PRIORIDAD_POR_DEFECTO)
  const [vencimiento, setVencimiento] = useState('')

  const [busqueda, setBusqueda] = useState('')
  const [sueltas, setSueltas] = useState<CargaSueltas>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Las tareas sin hito se piden al entrar al camino que las muestra, no al abrir el dialogo: quien
  // solo viene a crear una tarea no tiene por que gastar la peticion.
  const pidiendoSueltas = abierto && camino === 'existente'

  useEffect(() => {
    if (!pidiendoSueltas) return

    const control = new AbortController()

    void pedirSobre<TareaCandidata[]>(rutaTareasSinHito(proyectoId), control.signal)
      .then((sobre) => {
        if (!control.signal.aborted) setSueltas({ fase: 'listo', tareas: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setSueltas({
          fase: 'error',
          mensaje: fallo instanceof Error
            ? fallo.message
            : `No se pudieron traer las ${GLOSARIO.proceso.plural.toLowerCase()} sin ${GLOSARIO.hito.singular.toLowerCase()}.`
        })
      })

    return () => { control.abort() }
  }, [pidiendoSueltas, proyectoId, intento])

  /**
   * Deja el dialogo como recien abierto: lo escrito de la vez anterior no sirve para la proxima.
   *
   * Devolver la lista a "cargando" es lo que evita que la proxima apertura muestre por un instante
   * las candidatas de la vez anterior —una de ellas quiza la que se acaba de mover—. El efecto no
   * puede hacerlo por su cuenta: un `setState` sincronico ahi encadena renders.
   */
  function limpiar (): void {
    setNombre('')
    setPrioridad(PRIORIDAD_POR_DEFECTO)
    setVencimiento('')
    setBusqueda('')
    setError(null)
    setSueltas({ fase: 'cargando' })
  }

  /** Cierra, limpia y avisa a quien monta esto para que recargue el tablero. */
  async function terminar (): Promise<void> {
    limpiar()
    setAbierto(false)
    await onListo()
  }

  /** Crea la tarea ya colgada del hito. Un fallo del contrato se muestra, no rompe el dialogo. */
  async function crear (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const alta = { nombre, prioridad, vencimiento }
    const invalido = validarAltaEnHito(alta)

    if (invalido !== null) {
      setError(invalido)
      return
    }

    setEnCurso(true)
    setError(null)

    const respuesta = await escribirEnBff('tasks', 'POST', cuerpoDeAltaEnHito(alta, proyectoId, hito.id))

    setEnCurso(false)

    if (!respuesta.ok) {
      setError(respuesta.mensaje)
      return
    }

    await terminar()
  }

  /** Mueve una tarea sin hito a esta columna, por el mismo endpoint que usa el arrastre. */
  async function sumar (idTarea: number): Promise<void> {
    setEnCurso(true)
    setError(null)

    const respuesta = await escribirEnBff(
      `tasks/${idTarea}/mover-hito`,
      'POST',
      cuerpoMoverHito(movimientoAlHito(hito.id))
    )

    setEnCurso(false)

    if (!respuesta.ok) {
      setError(respuesta.mensaje)
      return
    }

    await terminar()
  }

  const candidatas = sueltas.fase === 'listo' ? filtrarCandidatas(sueltas.tareas, busqueda) : []

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(siguiente) => {
        setAbierto(siguiente)
        if (!siguiente) limpiar()
      }}
    >
      <DisparadorDialogo asChild>
        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          aria-label={`Agregar una ${GLOSARIO.proceso.singular.toLowerCase()} a ${hito.name}`}
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Agregar a "${hito.name}"`}
        descripcion={`Crea una ${GLOSARIO.proceso.singular.toLowerCase()} nueva en este ${GLOSARIO.hito.singular.toLowerCase()}, o suma una que hoy no tiene ninguno.`}
      >
        <div className="flex flex-col gap-4">
          <Segmentado
            etiqueta="Cómo agregar"
            opciones={CAMINOS}
            activo={camino}
            onElegir={(valor) => {
              const siguiente = valor === 'existente' ? 'existente' : 'nueva'

              setCamino(siguiente)
              setError(null)
              if (siguiente === 'existente') setSueltas({ fase: 'cargando' })
            }}
          />

          {camino === 'nueva'
            ? (
              <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
                <Campo etiqueta="Nombre" requerido>
                  {(props) => (
                    <Entrada
                      value={nombre}
                      onChange={(evento) => setNombre(evento.target.value)}
                      placeholder="Revisar el contrato"
                      {...props}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Prioridad">
                  {(props) => (
                    <Selector value={prioridad} onValueChange={setPrioridad}>
                      <DisparadorSelector marcador="Elige una" id={props.id} />
                      <ContenidoSelector>
                        {prioridades.map((opcion) => (
                          <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                        ))}
                      </ContenidoSelector>
                    </Selector>
                  )}
                </Campo>

                <Campo etiqueta="Fecha de vencimiento">
                  {(props) => (
                    <Entrada
                      type="date"
                      value={vencimiento}
                      onChange={(evento) => setVencimiento(evento.target.value)}
                      {...props}
                    />
                  )}
                </Campo>

                {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

                <div className="flex justify-end gap-2">
                  <CerrarDialogo asChild>
                    <Boton variante="sutil" type="button">Cancelar</Boton>
                  </CerrarDialogo>
                  <Boton variante="primario" type="submit" cargando={enCurso}>Crear</Boton>
                </div>
              </form>
              )
            : (
              <div className="flex flex-col gap-3">
                <Campo etiqueta={`Buscar entre las ${GLOSARIO.proceso.plural.toLowerCase()} sin ${GLOSARIO.hito.singular.toLowerCase()}`}>
                  {(props) => (
                    <Entrada
                      value={busqueda}
                      onChange={(evento) => setBusqueda(evento.target.value)}
                      placeholder="Parte del nombre"
                      {...props}
                    />
                  )}
                </Campo>

                {sueltas.fase === 'cargando' && <Cargando alto="min-h-24" mensaje="Buscando…" />}

                {sueltas.fase === 'error' && (
                  <ErrorEstado
                    detalle={sueltas.mensaje}
                    onReintentar={() => {
                      setSueltas({ fase: 'cargando' })
                      setIntento((n) => n + 1)
                    }}
                  />
                )}

                {sueltas.fase === 'listo' && candidatas.length === 0 && (
                  <p className="text-texto-sutil px-1 py-6 text-center text-xs">
                    {sueltas.tareas.length === 0
                      ? `No queda ninguna ${GLOSARIO.proceso.singular.toLowerCase()} sin ${GLOSARIO.hito.singular.toLowerCase()} en este ${GLOSARIO.espacio.singular.toLowerCase()}.`
                      : 'Ninguna coincide con lo que escribiste.'}
                  </p>
                )}

                {sueltas.fase === 'listo' && candidatas.length > 0 && (
                  <ul className="border-linea rounded-tarjeta flex max-h-72 flex-col divide-y divide-linea overflow-y-auto border">
                    {candidatas.map((tarea) => (
                      <li key={tarea.id}>
                        <Boton
                          variante="sutil"
                          disabled={enCurso}
                          className="w-full justify-start rounded-none text-left"
                          onClick={() => { void sumar(tarea.id) }}
                        >
                          {tarea.name}
                        </Boton>
                      </li>
                    ))}
                  </ul>
                )}

                {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

                <div className="flex justify-end">
                  <CerrarDialogo asChild>
                    <Boton variante="sutil" type="button">Cancelar</Boton>
                  </CerrarDialogo>
                </div>
              </div>
              )}
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
