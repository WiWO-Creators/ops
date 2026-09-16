'use client'

import { useEffect, useRef, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Orbe } from '@/componentes/estado/Orbe'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { consultarDisponibilidad, redactarDescripcion } from '@/datos/descripcion-ia'
import {
  type ModoDeBorrador,
  PREGUNTAS_DESCRIPCION,
  TOPE_RESPUESTA,
  combinarDescripcion,
  cuerpoDeRedaccion,
  descripcionVacia,
  errorDeDetalle
} from '@/dominio/descripcion-tarea'

interface PropsAsistente {
  /** El titulo que hay escrito en el formulario. Va como contexto; puede estar vacio. */
  titulo: string
  /** Lo que ya hay escrito en el campo Descripcion. Decide si aceptar el borrador pregunta antes. */
  descripcionActual?: string
  /** El Espacio elegido, si el formulario ya tiene uno. Solo suma contexto. */
  proyectoId?: number | null
  /** Se llama con el texto que la persona acepto, para que el formulario lo ponga en el campo. */
  onRedactada: (texto: string) => void
  /** Lo apaga mientras el formulario esta ocupado (guardando, cargando catalogos). */
  deshabilitado?: boolean
}

/**
 * El asistente que redacta la descripcion de una Tarea preguntando tres cosas.
 *
 * === POR QUE EXISTE ===
 *
 * La descripcion es obligatoria al crear y al editar. De las 3.046 Tareas que hay, 1.700 no tienen
 * ninguna: quien abra una de esas para correr una fecha se topa con que antes tiene que redactar un
 * parrafo. Sin una salida al lado del campo, esa obligacion se cumple escribiendo "-" y el campo
 * queda igual de vacio pero ahora ademas mintiendo. Este boton es la salida.
 *
 * === LO QUE NUNCA HACE ===
 *
 * **No guarda.** Pega el texto en el campo y ahi termina su trabajo: la persona lo lee, lo corrige y
 * guarda el formulario como siempre. Un asistente que escribiera directo en la base convertiria
 * cualquier error del modelo en un dato que nadie reviso.
 *
 * **No pisa lo que ya estaba escrito sin preguntar.** Con el campo vacio, aceptar el borrador lo
 * pega y listo. Con el campo escrito, hay que elegir entre sumarlo al final o reemplazar: el campo
 * es controlado y el Ctrl+Z del navegador no devuelve lo perdido, asi que la pregunta es la unica
 * marcha atras que existe. Cerrar o cancelar deja el campo exactamente como estaba.
 *
 * === POR QUE SE PREGUNTA ANTES DE LLAMAR AL MODELO, Y UNA SOLA VEZ ===
 *
 * Las tres preguntas son fijas y viven en `dominio/descripcion-tarea.ts`; el modelo se llama recien
 * con las tres respuestas juntas. Eso hace que el cuestionario sea gratis, que dos tareas distintas
 * salgan con descripciones comparables, y —lo que mas importa acá— que un corte de red no se lleve
 * nada: lo escrito vive en este componente hasta el ultimo paso, y ese paso se reintenta.
 *
 * === POR QUE HAY UNA SONDA ANTES DE MOSTRAR EL BOTON ===
 *
 * Con `ia_habilitada` en `0` la API responde 404 a todo `/ia/*`. Un boton que falla al apretarlo es
 * peor que un boton que no esta: quien lo aprieta no puede distinguir "esto no esta contratado" de
 * "esto se rompio". El `GET` de la ruta contesta si esta persona puede usar el asistente —y no
 * contesta nada si la capa esta apagada—, asi que mientras no diga que si, este componente no pinta
 * nada. Es la misma decision que toma `ResumenDelDia` con su fase `apagada`.
 *
 * === LOS TRES FINALES DE LA LLAMADA, Y NINGUNO ES ESPERAR PARA SIEMPRE ===
 *
 * Pidiendo, llego, fallo. El "pidiendo" tiene siempre dos salidas: el boton de cancelar, que aborta
 * en el acto, y el techo de espera de `datos/descripcion-ia.ts`, que corta solo si la API no vuelve.
 * Un "Redactando…" del que no se pueda salir seria peor que un error.
 */
export function AsistenteDescripcion (
  { titulo, descripcionActual = '', proyectoId, onRedactada, deshabilitado = false }: PropsAsistente
) {
  /** `null` mientras la sonda no contesto. Solo `true` pinta el boton. */
  const [disponible, setDisponible] = useState<boolean | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [indice, setIndice] = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, string>>({})
  const [borrador, setBorrador] = useState<string | null>(null)
  const [redactando, setRedactando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** La llamada en vuelo, para poder soltarla al cancelar, al cerrar o al desmontar. */
  const enVuelo = useRef<AbortController | null>(null)

  useEffect(() => {
    const control = new AbortController()

    void consultarDisponibilidad(control.signal).then((puede) => {
      if (!control.signal.aborted) setDisponible(puede)
    })

    return () => { control.abort() }
  }, [])

  // El desmontaje tiene que soltar la redaccion en vuelo: sin esto, cerrar el formulario mientras el
  // modelo escribe deja el `fetch` colgado y su `setState` cae sobre un componente que ya no esta.
  useEffect(() => () => { enVuelo.current?.abort() }, [])

  // `indice` no puede salirse del arreglo —solo lo mueven "Siguiente" y "Atrás"—, pero con
  // `noUncheckedIndexedAccess` el compilador exige que se diga, y decirlo cuesta una linea.
  const pregunta = PREGUNTAS_DESCRIPCION[indice]

  if (disponible !== true || pregunta === undefined) return null

  const esUltima = indice === PREGUNTAS_DESCRIPCION.length - 1
  const hayTextoEscrito = !descripcionVacia(descripcionActual)
  const contestadas = PREGUNTAS_DESCRIPCION
    .slice(0, indice)
    .filter((una) => !descripcionVacia(respuestas[una.clave]))

  /** Deja el cuestionario como recien abierto. Se llama al cerrar, no al abrir: cerrar es descartar. */
  function limpiar (): void {
    setIndice(0)
    setRespuestas({})
    setBorrador(null)
    setError(null)
  }

  /** Suelta la llamada en vuelo, si hay una. Cancelar y cerrar terminan los dos acá. */
  function soltarLlamada (): void {
    enVuelo.current?.abort()
    enVuelo.current = null
    setRedactando(false)
  }

  /**
   * Pide la redaccion con lo contestado hasta acá.
   *
   * Es el unico viaje a la red de todo el asistente. Cualquier final —texto, error, espera agotada o
   * cancelacion— deja el cuestionario intacto: lo que la persona escribio no se pierde nunca por
   * esto, y reintentar es apretar el boton de nuevo.
   */
  async function redactar (): Promise<void> {
    const cuerpo = cuerpoDeRedaccion(titulo, respuestas, proyectoId)

    if (cuerpo === null) {
      setError('Contesta al menos una de las preguntas para que el asistente tenga con qué escribir.')

      return
    }

    // El mismo piso de detalle que el alta en una linea, y por el mismo motivo: contestar "x" a la
    // primera pregunta pasaba el filtro de "no esta vacio" y le pedia al modelo que inventara la
    // tarea entera. Se mide sobre todo lo contestado, no pregunta por pregunta: el "para quién"
    // puede quedar vacio a proposito.
    const flojo = errorDeDetalle(cuerpo.respuestas.map((par) => par.respuesta).join(' '))

    if (flojo !== null) {
      setError(flojo)

      return
    }

    const control = new AbortController()

    enVuelo.current = control
    setRedactando(true)
    setError(null)

    const resultado = await redactarDescripcion(cuerpo, control.signal)

    // Una respuesta de una llamada que ya se cancelo no entra: la persona ya decidio que no la
    // queria, y pintarla despues seria el dialogo moviendose solo.
    if (control.signal.aborted) return

    enVuelo.current = null
    setRedactando(false)

    if (resultado.ok) {
      setBorrador(resultado.descripcion)

      return
    }

    if (resultado.motivo !== 'cancelada') setError(resultado.mensaje)
  }

  /** Avanza a la pregunta siguiente, o dispara la redaccion si esta era la ultima. */
  function avanzar (): void {
    setError(null)

    if (esUltima) {
      void redactar()

      return
    }

    setIndice(indice + 1)
  }

  /** Pega el borrador en el campo del formulario del modo elegido y cierra. */
  function aceptar (modo: ModoDeBorrador): void {
    if (borrador === null) return

    onRedactada(combinarDescripcion(descripcionActual, borrador, modo))
    setAbierto(false)
    limpiar()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(valor) => {
        // Cerrar mientras redacta es descartar: se suelta la llamada y el campo queda como estaba.
        if (!valor) {
          soltarLlamada()
          limpiar()
        }

        setAbierto(valor)
      }}
    >
      <DisparadorDialogo asChild>
        <Boton variante="sutil" tamano="chico" disabled={deshabilitado}>
          Redactar con IA
        </Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Redactar la descripción"
        descripcion="Contesta lo que puedas y el asistente arma un borrador. Nada se guarda hasta que tú lo guardes."
      >
        <div className="mt-4 flex flex-col gap-4">
          {borrador === null
            ? (
              <>
                {contestadas.length > 0 && (
                  <ul className="border-linea flex flex-col gap-2 border-l pl-3">
                    {contestadas.map((una) => (
                      <li key={una.clave} className="text-sm">
                        <p className="text-texto-tenue">{una.texto}</p>
                        <p className="text-texto">{(respuestas[una.clave] ?? '').trim()}</p>
                      </li>
                    ))}
                  </ul>
                )}

                <Campo
                  etiqueta={pregunta.texto}
                  ayuda={`${pregunta.ayuda} Paso ${indice + 1} de ${PREGUNTAS_DESCRIPCION.length}.`}
                >
                  {(props) => (
                    <AreaTexto
                      {...props}
                      rows={3}
                      autoFocus
                      maxLength={TOPE_RESPUESTA}
                      value={respuestas[pregunta.clave] ?? ''}
                      disabled={redactando}
                      onChange={(evento) => {
                        setRespuestas({ ...respuestas, [pregunta.clave]: evento.target.value })
                      }}
                    />
                  )}
                </Campo>
              </>
              )
            : (
              <Campo
                etiqueta="Borrador"
                ayuda={hayTextoEscrito
                  ? 'Corrígelo acá si quieres. Elige abajo si se suma a lo que ya escribiste o lo reemplaza.'
                  : 'Corrígelo acá si quieres. Al usarlo queda en el campo Descripción y todavía lo puedes editar.'}
              >
                {(props) => (
                  <AreaTexto
                    {...props}
                    rows={7}
                    autoFocus
                    value={borrador}
                    onChange={(evento) => { setBorrador(evento.target.value) }}
                  />
                )}
              </Campo>
              )}

          {borrador !== null && hayTextoEscrito && (
            <p className="text-texto-tenue text-sm">
              El campo Descripción ya tiene texto escrito. Si cierras esta ventana no se toca nada.
            </p>
          )}

          {redactando && (
            <p role="status" className="text-texto-tenue flex items-center gap-2 text-sm">
              <Orbe estado="generating" tamano="chico" />
              Redactando con lo que contestaste…
            </p>
          )}

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {redactando
              ? (
                <Boton
                  variante="sutil"
                  onClick={() => {
                    soltarLlamada()
                    setError(null)
                  }}
                >
                  Cancelar la redacción
                </Boton>
                )
              : (
                <CerrarDialogo asChild>
                  <Boton variante="sutil">Cancelar</Boton>
                </CerrarDialogo>
                )}

            {borrador === null
              ? (
                <>
                  {indice > 0 && (
                    <Boton
                      variante="secundario"
                      disabled={redactando}
                      onClick={() => { setError(null); setIndice(indice - 1) }}
                    >
                      Atrás
                    </Boton>
                  )}
                  <Boton variante="primario" cargando={redactando} onClick={avanzar}>
                    {esUltima ? 'Redactar' : 'Siguiente'}
                  </Boton>
                </>
                )
              : (
                <>
                  <Boton variante="secundario" onClick={() => { setBorrador(null); setIndice(0) }}>
                    Volver a las preguntas
                  </Boton>

                  {hayTextoEscrito
                    ? (
                      <>
                        <Boton
                          variante="secundario"
                          disabled={descripcionVacia(borrador)}
                          onClick={() => { aceptar('reemplazar') }}
                        >
                          Reemplazar lo escrito
                        </Boton>
                        <Boton
                          variante="primario"
                          disabled={descripcionVacia(borrador)}
                          onClick={() => { aceptar('agregar') }}
                        >
                          Agregar al final
                        </Boton>
                      </>
                      )
                    : (
                      <Boton
                        variante="primario"
                        disabled={descripcionVacia(borrador)}
                        onClick={() => { aceptar('reemplazar') }}
                      >
                        Usar esta descripción
                      </Boton>
                      )}
                </>
                )}
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
