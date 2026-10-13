'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { EntradaFecha } from '@/componentes/formularios/EntradaFecha'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { claveDeIdempotencia } from '@/datos/red'
import type { AltaDeTareas, TareaPortal } from '@/datos/portal'
import { GLOSARIO } from '@/dominio/glosario'
import {
  BORRADOR_VACIO_DE_TAREA, LARGO_NOMBRE_TAREA, PRIORIDADES_DE_TAREA, SIN_PRIORIDAD, cuerpoDeTarea,
  erroresDeBorrador, falloDeAltaDeTarea, tareaCompleta, type ErroresDeTarea
} from '@/dominio/tareas-del-portal'

/**
 * Alta de una {@link GLOSARIO.proceso} desde la pestaña de Tareas de un Proyecto del portal.
 *
 * Solo se monta cuando la API dijo que este contacto puede (`alta_de_tareas` distinto de `null`):
 * el cliente tiene la funcion encendida y el Proyecto comparte sus Tareas. La pagina decide eso; acá
 * no se vuelve a preguntar.
 *
 * Va en un dialogo y no en una pantalla propia, igual que el alta de solicitudes de soporte
 * (`NuevaSolicitud`): son pocos campos, y el listado detras del velo recuerda que esto se suma a lo
 * que ya hay.
 *
 * === LO QUE SE PIDE, Y LO QUE NO ===
 *
 * Nombre, descripcion en texto plano, fecha de vencimiento, prioridad y asignados. El vencimiento es
 * obligatorio solo si el cliente lo exige (`vencimiento_requerido`); los asignados se eligen entre el
 * equipo del Proyecto que la API publica en `asignables`, y sin esa lista no hay selector: el Proyecto
 * no muestra su equipo al cliente y mandar `assignees` seria un `422`. Estado, etiquetas, tarifa y
 * visibilidad no se ofrecen: la Tarea entra al flujo normal y el equipo la completa.
 *
 * === ERRORES ===
 *
 * El `422` se pinta junto al campo que lo causo, con lo tipeado intacto. El `429` bloquea el envio
 * el tiempo que la API pidio esperar. La API es la que decide: lo que el formulario valida antes del
 * viaje es cortesia.
 *
 * @param proyectoId el Proyecto en que se crea
 * @param alta lo que este contacto puede hacer ahi
 */
export function NuevaTareaPortal ({ proyectoId, alta }: { proyectoId: number, alta: AltaDeTareas }) {
  const router = useRouter()
  const avisar = useAviso()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [borrador, setBorrador] = useState(BORRADOR_VACIO_DE_TAREA)
  // Los errores previos al viaje solo se muestran despues del primer intento de crear.
  const [intentado, setIntentado] = useState(false)
  const [rechazos, setRechazos] = useState<ErroresDeTarea>({})
  const [fallo, setFallo] = useState<string | null>(null)
  // Segundos que pidio esperar un 429; mientras no es `null` el envio queda bloqueado.
  const [espera, setEspera] = useState<number | null>(null)
  const enviandoAhora = useRef(false)
  // Clave del alta en curso: la misma mientras lo escrito no cambie, para que repetir tras una
  // respuesta perdida no cree una segunda Tarea.
  const claveAlta = useRef<{ huella: string, clave: string } | null>(null)

  useEffect(() => {
    if (espera === null) return

    const id = window.setTimeout(() => { setEspera(null) }, espera * 1000)

    return () => { window.clearTimeout(id) }
  }, [espera])

  const opcionesDeAsignados = useMemo(
    () => alta.asignables.map((persona) => ({ id: persona.id, nombre: persona.nombre, imagen: persona.avatar })),
    [alta.asignables]
  )
  const previos = intentado ? erroresDeBorrador(borrador, alta) : {}
  const errores: ErroresDeTarea = { ...previos, ...rechazos }
  const tarea = GLOSARIO.proceso.singular

  /** Cambia un campo y suelta el rechazo del servidor que le tocaba: ya no describe lo tipeado. */
  function cambiar (cambios: Partial<typeof borrador>, campos: Array<keyof ErroresDeTarea>): void {
    setBorrador((actual) => ({ ...actual, ...cambios }))
    setRechazos((actual) => {
      const resto = { ...actual }

      for (const campo of campos) delete resto[campo]

      return resto
    })
  }

  /** Deja el formulario como recien abierto. */
  function reiniciar (): void {
    setBorrador(BORRADOR_VACIO_DE_TAREA)
    setIntentado(false)
    setRechazos({})
    setFallo(null)
  }

  /**
   * Crea la Tarea y la deja a la vista en la lista.
   *
   * Nunca lanza: el error del contrato se muestra dentro del dialogo, con lo tipeado intacto, para
   * que el cliente corrija y reintente sin volver a escribir.
   */
  async function crear (): Promise<void> {
    if (enviandoAhora.current || espera !== null) return

    setIntentado(true)
    if (!tareaCompleta(borrador, alta)) return

    enviandoAhora.current = true
    setEnviando(true)
    setFallo(null)
    setRechazos({})

    const cuerpo = cuerpoDeTarea(borrador, alta)
    const huella = JSON.stringify(cuerpo)

    if (claveAlta.current?.huella !== huella) claveAlta.current = { huella, clave: claveDeIdempotencia() }

    const resultado = await escribirEnBff<TareaPortal>(
      `portal/projects/${proyectoId}/tasks`,
      'POST',
      cuerpo,
      { idempotencia: claveAlta.current.clave }
    )

    enviandoAhora.current = false
    setEnviando(false)

    if (!resultado.ok) {
      const explicado = falloDeAltaDeTarea(resultado)

      setFallo(explicado.texto)
      setRechazos(explicado.campos)
      if (explicado.esperarSegundos !== null) setEspera(explicado.esperarSegundos)

      return
    }

    claveAlta.current = null
    reiniciar()
    setAbierto(false)
    avisar.exito(`${tarea} creada.`)
    // La lista de abajo se vuelve a pedir sola con la escritura; esto trae los contadores del servidor.
    router.refresh()
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante="primario" data-rastreo="tarea-portal.nueva">{`Nueva ${tarea.toLowerCase()}`}</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`Nueva ${tarea.toLowerCase()}`}
        descripcion={`Cuéntanos qué necesitas y el equipo la suma a las ${GLOSARIO.proceso.plural.toLowerCase()} de este ${GLOSARIO.espacio.singular.toLowerCase()}.`}
      >
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(evento) => {
            evento.preventDefault()
            void crear()
          }}
        >
          <Campo etiqueta="Nombre" requerido error={errores.name}>
            {(props) => (
              <Entrada
                {...props}
                value={borrador.nombre}
                autoFocus
                maxLength={LARGO_NOMBRE_TAREA}
                placeholder="En una línea, qué hay que hacer"
                onChange={(evento) => { cambiar({ nombre: evento.target.value }, ['name']) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Descripción" error={errores.description}>
            {(props) => (
              <AreaTexto
                {...props}
                value={borrador.descripcion}
                rows={4}
                placeholder="Detalles que ayuden al equipo (opcional)"
                onChange={(evento) => { cambiar({ descripcion: evento.target.value }, ['description']) }}
              />
            )}
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              etiqueta="Vence"
              requerido={alta.vencimiento_requerido}
              error={errores.due_date}
              ayuda={alta.vencimiento_requerido ? undefined : 'Si no la pones, queda sin fecha.'}
            >
              {(props) => (
                <EntradaFecha
                  props={props}
                  valor={borrador.vencimiento}
                  alCambiar={(valor) => { cambiar({ vencimiento: valor }, ['due_date']) }}
                />
              )}
            </Campo>

            <Campo etiqueta="Prioridad" error={errores.priority}>
              {(props) => (
                <Selector value={borrador.prioridad} onValueChange={(valor) => { cambiar({ prioridad: valor }, ['priority']) }}>
                  <DisparadorSelector id={props.id} />
                  <ContenidoSelector>
                    <Opcion value={SIN_PRIORIDAD}>Sin elegir</Opcion>
                    {PRIORIDADES_DE_TAREA.map((opcion) => (
                      <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.etiqueta}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
          </div>

          {alta.asignables.length > 0 && (
            <Campo etiqueta="Asignados" error={errores.assignees} ayuda="Opcional. Si no eliges a nadie, avisamos al equipo del proyecto.">
              {(props) => (
                <SelectorBuscableMultiple
                  id={props.id}
                  opciones={opcionesDeAsignados}
                  elegidos={borrador.asignados}
                  onCambiar={(ids) => { cambiar({ asignados: ids }, ['assignees']) }}
                  icono={UserPlus}
                  resumen={(lista) => lista.length === 0
                    ? 'Agregar personas'
                    : `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}`}
                  placeholder="Buscar una persona…"
                  sinResultados="Nadie con ese nombre."
                  etiquetaSacar={(nombre) => `Sacar a ${nombre}`}
                />
              )}
            </Campo>
          )}

          {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

          <div className="flex justify-end gap-2">
            <Boton type="button" variante="sutil" data-rastreo="tarea-portal.cancelar" onClick={() => { setAbierto(false) }}>
              Cancelar
            </Boton>
            <Boton
              type="submit"
              variante="primario"
              data-rastreo="tarea-portal.crear"
              cargando={enviando}
              disabled={espera !== null}
            >
              {`Crear ${tarea.toLowerCase()}`}
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
