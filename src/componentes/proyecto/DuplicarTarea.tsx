'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { GLOSARIO } from '@/dominio/glosario'
import {
  COPIABLES,
  ETIQUETAS,
  LARGO_MAXIMO_NOMBRE,
  copiaPorDefecto,
  cuantasMarcadas,
  cuerpoDeDuplicado,
  seleccionUniforme,
  todasMarcadas,
  type SeleccionDeCopia
} from './duplicar-tarea'
import type { Proceso } from '@/datos/recursos'

/**
 * Duplicar una Tarea eligiendo que se copia.
 *
 * Duplicar existia solo como efecto de "traer de otro proyecto" al agregar tareas a un Hito: copiaba
 * lo que ese flujo decidia y no habia forma de duplicar una tarea sola ni de dejar afuera los
 * asignados. Este modal es el gesto directo, y el selector es su razon de ser: la mayoria de las
 * veces se duplica para rehacer el mismo trabajo con otra gente, y arrastrar los asignados del
 * original manda avisos a personas que no tienen nada que ver con la copia.
 *
 * **Arranca con solo "Descripción" marcada, igual que la API con el cuerpo vacio** (ver
 * `copiaPorDefecto`). Que las dos puertas de entrada y el cuerpo vacio den el mismo resultado es lo
 * que hace predecible la accion.
 *
 * El resultado NO cierra el modal: se muestra ahi mismo con el codigo de la copia y un enlace para
 * abrirla. Cerrar de golpe deja a la persona mirando un tablero donde acaba de aparecer una tarjeta
 * mas, sin saber cual de las dos es la nueva —se llaman igual salvo que le haya cambiado el nombre—.
 *
 * El error de la API se muestra tal como viene: `escribirEnBff` ya pasa por `mensajeConDetalles`,
 * que traduce las claves de los `422` ("Etiquetas no existe", "Hito no pertenece a este Proyecto").
 */

interface PropsDuplicarTarea {
  tareaId: number
  /** Nombre del original. Prellena el campo y se muestra en la descripcion del modal. */
  nombreTarea: string
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
  /**
   * Se llama con la copia ya creada, para que el listado de atras vuelva a pedir sus datos.
   *
   * Recibe la ficha entera y no solo el id: quien monta el modal puede querer algo mas que recargar
   * —el detalle la usa para saber que Espacio toco—, y volver a pedirla seria una peticion de mas
   * por un dato que la respuesta ya trajo.
   */
  onDuplicada?: (copia: Proceso) => void
}

/** Estado del envio. El resultado se queda en pantalla hasta que la persona cierra el modal. */
type Envio =
  | { fase: 'formulario' }
  | { fase: 'enviando' }
  | { fase: 'listo', copia: Proceso }

export function DuplicarTarea ({
  tareaId,
  nombreTarea,
  abierto,
  onAbiertoCambia,
  onDuplicada
}: PropsDuplicarTarea): ReactElement {
  const [nombre, setNombre] = useState(nombreTarea)
  const [seleccion, setSeleccion] = useState<SeleccionDeCopia>(copiaPorDefecto)
  const [envio, setEnvio] = useState<Envio>({ fase: 'formulario' })
  const [error, setError] = useState<string | null>(null)
  const [errorNombre, setErrorNombre] = useState<string | null>(null)

  /**
   * Deja el formulario como recien abierto.
   *
   * Se llama al cerrar y no al abrir porque el componente queda montado entre aperturas —el
   * disparador vive al lado y desmontarlo perderia el foco—: sin esto, la segunda duplicacion
   * arranca con el resultado de la primera en pantalla.
   */
  function reiniciar (): void {
    setNombre(nombreTarea)
    setSeleccion(copiaPorDefecto())
    setEnvio({ fase: 'formulario' })
    setError(null)
    setErrorNombre(null)
  }

  function cerrar (): void {
    reiniciar()
    onAbiertoCambia(false)
  }

  /** Marca o desmarca las ocho opciones de una sola vez. */
  function marcarTodo (valor: boolean): void {
    setSeleccion(seleccionUniforme(valor))
  }

  /**
   * Crea la copia.
   *
   * El nombre vacio se corta aca y no en la API: el campo esta a la vista y prellenado, asi que
   * vaciarlo es un descuido, y hacer viajar el pedido para que vuelva un `nombre: requerido` es un
   * viaje de ida y vuelta por algo que se ve en pantalla.
   */
  async function duplicar (): Promise<void> {
    if (envio.fase === 'enviando') return

    const cuerpo = cuerpoDeDuplicado(nombre, seleccion)

    if (cuerpo.nombre === '') {
      setErrorNombre('Escribe un nombre para la copia.')

      return
    }

    setErrorNombre(null)
    setError(null)
    setEnvio({ fase: 'enviando' })

    const resultado = await escribirEnBff<Proceso>(
      `tasks/${encodeURIComponent(String(tareaId))}/duplicar`,
      'POST',
      cuerpo
    )

    if (!resultado.ok) {
      setEnvio({ fase: 'formulario' })
      setError(resultado.mensaje)

      return
    }

    setEnvio({ fase: 'listo', copia: resultado.datos })
    onDuplicada?.(resultado.datos)
  }

  const enviando = envio.fase === 'enviando'
  const marcadas = cuantasMarcadas(seleccion)
  const proceso = GLOSARIO.proceso.singular.toLowerCase()

  return (
    <Dialogo open={abierto} onOpenChange={(siguiente) => { if (!siguiente && !enviando) cerrar() }}>
      <ContenidoDialogo
        titulo={`Duplicar ${proceso}`}
        descripcion={envio.fase === 'listo'
          ? `La copia ya existe. El original "${nombreTarea}" quedó como estaba.`
          : `Se crea una ${proceso} nueva a partir de "${nombreTarea}". Elige qué se copia.`}
      >
        {envio.fase === 'listo'
          ? <ResultadoDeDuplicado copia={envio.copia} onCerrar={cerrar} />
          : (
            <div className="flex flex-col gap-4">
              <Campo
                etiqueta="Nombre de la copia"
                requerido
                error={errorNombre ?? undefined}
                ayuda={`Viene con el nombre del original. Cámbialo si las dos ${GLOSARIO.proceso.plural.toLowerCase()} van a convivir.`}
              >
                {(props) => (
                  <Entrada
                    value={nombre}
                    maxLength={LARGO_MAXIMO_NOMBRE}
                    disabled={enviando}
                    onChange={(evento) => setNombre(evento.target.value)}
                    {...props}
                  />
                )}
              </Campo>

              {/* Una lista de casillas no es un control: cada casilla lleva su etiqueta y el grupo se
                  nombra con `fieldset`/`legend`. Por eso no usa `Campo`, que cablea UN `label` a UN
                  control. Es el mismo criterio que la lista de personas de las acciones masivas. */}
              <fieldset className="flex flex-col gap-2" disabled={enviando}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <legend className="text-texto text-sm font-medium">Qué se copia</legend>

                  {/* El atajo dice lo que va a hacer, no lo que pasa ahora: con las ocho marcadas
                      ofrece desmarcarlas, y en cualquier otro caso marcarlas. Ocho casillas a mano
                      para duplicar una tarea completa es el gesto que este boton borra. */}
                  <Boton
                    variante="sutil"
                    tamano="chico"
                    onClick={() => marcarTodo(!todasMarcadas(seleccion))}
                  >
                    {todasMarcadas(seleccion) ? 'Desmarcar todo' : 'Marcar todo'}
                  </Boton>
                </div>

                <ul className="border-linea rounded-medio border">
                  {COPIABLES.map((clave) => (
                    <li key={clave} className="border-linea-suave border-b last:border-b-0">
                      <label className="hover:bg-hover flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className={CLASES_CASILLA}
                          checked={seleccion[clave]}
                          onChange={(evento) => setSeleccion((previa) => ({ ...previa, [clave]: evento.target.checked }))}
                        />
                        {ETIQUETAS[clave]}
                      </label>
                    </li>
                  ))}
                </ul>

                <p className="text-texto-sutil text-xs" aria-live="polite">
                  {marcadas === 0
                    ? `Se copia solo el nombre y las fechas de la ${proceso}.`
                    : `${marcadas} de ${COPIABLES.length} marcadas.`}
                </p>
              </fieldset>

              {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

              <div className="flex justify-end gap-2">
                <Boton variante="sutil" disabled={enviando} onClick={cerrar}>
                  Cancelar
                </Boton>
                <Boton variante="primario" cargando={enviando} onClick={() => { void duplicar() }}>
                  Duplicar
                </Boton>
              </div>
            </div>
            )}
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Lo que se ve cuando la copia ya existe.
 *
 * El enlace escribe `?tarea={id}` sobre la URL actual —el mismo parametro que usa cualquier listado
 * para abrir el detalle— en vez de navegar a otra pantalla: quien duplica desde el tablero sigue
 * estando en el tablero, y la copia se abre encima como se abriria cualquier otra tarjeta.
 */
function ResultadoDeDuplicado ({ copia, onCerrar }: { copia: Proceso, onCerrar: () => void }): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())

  siguientes.set(PARAMETRO_TAREA, String(copia.id))

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-texto text-sm">
        Se creó <span className="font-medium">{copia.name}</span>
        {' '}
        <span data-numerico className="text-texto-sutil font-mono text-xs">
          {copia.patente ?? `#${copia.id}`}
        </span>
      </p>

      <div className="flex justify-end gap-2">
        <Boton variante="sutil" onClick={onCerrar}>Seguir aquí</Boton>
        <Boton
          variante="primario"
          onClick={() => {
            onCerrar()
            router.push(`?${siguientes.toString()}`, { scroll: false })
          }}
        >
          Abrir la copia
        </Boton>
      </div>
    </div>
  )
}

/**
 * El boton "Duplicar…" con su modal al lado.
 *
 * Es lo que montan las dos puertas de entrada —la tarjeta del tablero de Hitos y el detalle de la
 * Tarea—: el estado de apertura no le interesa a ninguna de las dos, y dejarlo suelto obligaria a
 * cada una a sostener un `useState` identico.
 *
 * Los puntos suspensivos son deliberados y siguen a "Mover a…": avisan que el boton abre algo que
 * hay que completar, y no que duplica de una.
 */
export function BotonDuplicarTarea ({
  tareaId,
  nombreTarea,
  onDuplicada,
  className
}: {
  tareaId: number
  nombreTarea: string
  onDuplicada?: (copia: Proceso) => void
  className?: string
}): ReactElement {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Boton
        variante="sutil"
        tamano="chico"
        className={className}
        aria-label={`Duplicar "${nombreTarea}"`}
        onClick={() => setAbierto(true)}
      >
        Duplicar…
      </Boton>

      <DuplicarTarea
        tareaId={tareaId}
        nombreTarea={nombreTarea}
        abierto={abierto}
        onAbiertoCambia={setAbierto}
        onDuplicada={onDuplicada}
      />
    </>
  )
}
