'use client'

import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { pedirSobre } from '@/datos/cliente'
import { leerError } from '@/datos/errores'
import type { AsignadoTarea, RegistroTiempo, TareaElegible } from '@/datos/recursos'
import { AYUDA_DURACION, validarTimesheet, type EntradaTimesheet } from './timesheet'

/**
 * Formulario de "Registro de horas": alta y edicion.
 *
 * Tiene los dos modos del panel viejo y son **excluyentes**: o se dice cuando empezo y cuando
 * termino, o cuanto duro. El contrato responde `422` si viajan juntos, asi que alternar de modo
 * limpia los campos del otro — igual que el panel, y por la misma razon.
 *
 * La lista de tareas la decide el backend (`timesheets/tasks`: del proyecto, sin completar y sin
 * facturar) y la de personas tambien (`tasks/{id}/assignees`). El frontend no filtra ninguna de las
 * dos: quien puede registrar tiempo de quien es una regla de permisos, no de presentacion.
 *
 * El estado arranca de cero en cada apertura porque quien lo monta le pasa una `key` distinta: reusar
 * lo que quedo de la vez anterior es la forma mas facil de registrar dos veces la misma hora.
 */

interface PropsFormulario {
  proyectoId: number
  abierto: boolean
  /** El registro que se edita, o `null` para un alta. */
  registro: RegistroTiempo | null
  onOpenChange: (abierto: boolean) => void
  onGuardado: () => void
}

/** Estado inicial de los campos, ya sea vacio o con lo que trae el registro que se edita. */
function entradaInicial (registro: RegistroTiempo | null): EntradaTimesheet {
  return {
    modo: 'fechas',
    taskId: registro === null ? '' : String(registro.task.id),
    staffId: registro === null ? '' : String(registro.staff.id),
    inicio: paraCampoLocal(registro?.start_time ?? null),
    fin: paraCampoLocal(registro?.end_time ?? null),
    duracion: '',
    nota: registro?.note ?? '',
    etiquetas: registro === null ? '' : registro.tags.map((etiqueta) => etiqueta.name).join(', ')
  }
}

/**
 * Convierte un instante ISO al formato que acepta `<input type="datetime-local">`.
 *
 * El input trabaja en hora local sin zona; mandarle el ISO con `Z` lo deja vacio en silencio.
 *
 * @param iso el instante, o `null`
 * @returns `YYYY-MM-DDTHH:MM`, o cadena vacia
 */
function paraCampoLocal (iso: string | null): string {
  if (iso === null) return ''

  const fecha = new Date(iso)

  if (Number.isNaN(fecha.getTime())) return ''

  const dosDigitos = (n: number): string => String(n).padStart(2, '0')

  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
}

export function FormularioTimesheet ({
  proyectoId,
  abierto,
  registro,
  onOpenChange,
  onGuardado
}: PropsFormulario): ReactElement {
  const [entrada, setEntrada] = useState<EntradaTimesheet>(() => entradaInicial(registro))
  const [tareas, setTareas] = useState<TareaElegible[]>([])
  const [personas, setPersonas] = useState<AsignadoTarea[]>([])
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campoConError, setCampoConError] = useState<keyof EntradaTimesheet | null>(null)

  useEffect(() => {
    if (!abierto) return

    const control = new AbortController()

    void pedirSobre<TareaElegible[]>(`projects/${proyectoId}/timesheets/tasks`, control.signal)
      .then((sobre) => setTareas(sobre.data))
      .catch(() => { if (!control.signal.aborted) setError('No se pudieron traer las tareas del proyecto.') })

    return () => { control.abort() }
  }, [abierto, proyectoId])

  const tareaElegida = entrada.taskId

  useEffect(() => {
    if (!abierto || tareaElegida === '') return

    const control = new AbortController()

    void pedirSobre<AsignadoTarea[]>(`tasks/${tareaElegida}/assignees`, control.signal)
      .then((sobre) => setPersonas(sobre.data))
      .catch(() => { if (!control.signal.aborted) setError('No se pudieron traer los asignados de la tarea.') })

    return () => { control.abort() }
  }, [abierto, tareaElegida])

  /** Cambia un campo del formulario sin pisar los demas. */
  function cambiar (parcial: Partial<EntradaTimesheet>): void {
    setEntrada((actual) => ({ ...actual, ...parcial }))
  }

  /** Alterna entre fechas y duracion, limpiando los campos del modo que se abandona. */
  function alternarModo (): void {
    setCampoConError(null)
    setEntrada((actual) => actual.modo === 'fechas'
      ? { ...actual, modo: 'duracion', inicio: '', fin: '' }
      : { ...actual, modo: 'fechas', duracion: '' })
  }

  /** Valida, arma el cuerpo y lo manda. Alta con `POST`, edicion con `PATCH`. */
  async function enviar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()

    const validacion = validarTimesheet(entrada)

    if (!validacion.ok) {
      setCampoConError(validacion.campo)
      setError(validacion.mensaje)
      return
    }

    setEnCurso(true)
    setError(null)
    setCampoConError(null)

    const ruta = registro === null
      ? `projects/${proyectoId}/timesheets`
      : `projects/${proyectoId}/timesheets/${registro.id}`

    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: registro === null ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(validacion.cuerpo)
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      onOpenChange(false)
      onGuardado()
    } catch {
      setError('No se pudo guardar: revisá la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={onOpenChange}>
      <ContenidoDialogo
        titulo="Registro de horas"
        descripcion={registro === null ? 'Anotá tiempo ya trabajado.' : 'Corregí un registro existente.'}
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void enviar(evento) }}>
          <Campo
            etiqueta="Tarea"
            requerido
            error={campoConError === 'taskId' ? error ?? undefined : undefined}
          >
            {(props) => (
              <Selector value={entrada.taskId} onValueChange={(valor) => cambiar({ taskId: valor, staffId: '' })}>
                <DisparadorSelector marcador="Elegí la tarea" id={props.id} />
                <ContenidoSelector>
                  {tareas.map((tarea) => (
                    <Opcion key={tarea.id} value={String(tarea.id)}>{tarea.name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo etiqueta="Persona" ayuda="Sólo quienes tienen la tarea asignada.">
            {(props) => (
              <Selector value={entrada.staffId} onValueChange={(valor) => cambiar({ staffId: valor })}>
                <DisparadorSelector marcador="Yo" id={props.id} />
                <ContenidoSelector>
                  {(tareaElegida === '' ? [] : personas).map((persona) => (
                    <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {entrada.modo === 'fechas'
            ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  etiqueta="Hora de inicio"
                  requerido
                  error={campoConError === 'inicio' ? error ?? undefined : undefined}
                >
                  {(props) => (
                    <Entrada
                      type="datetime-local"
                      value={entrada.inicio}
                      onChange={(evento) => cambiar({ inicio: evento.target.value })}
                      {...props}
                    />
                  )}
                </Campo>
                <Campo
                  etiqueta="Hora de finalización"
                  requerido
                  error={campoConError === 'fin' ? error ?? undefined : undefined}
                >
                  {(props) => (
                    <Entrada
                      type="datetime-local"
                      value={entrada.fin}
                      onChange={(evento) => cambiar({ fin: evento.target.value })}
                      {...props}
                    />
                  )}
                </Campo>
              </div>
              )
            : (
              <Campo
                etiqueta="Duración"
                requerido
                ayuda={AYUDA_DURACION}
                error={campoConError === 'duracion' ? error ?? undefined : undefined}
              >
                {(props) => (
                  <Entrada
                    value={entrada.duracion}
                    onChange={(evento) => cambiar({ duracion: evento.target.value })}
                    placeholder="2:30"
                    {...props}
                  />
                )}
              </Campo>
              )}

          <Boton variante="sutil" tamano="chico" type="button" onClick={alternarModo} className="self-start">
            {entrada.modo === 'fechas' ? 'Introducir duración' : 'Introducir fechas'}
          </Boton>

          <Campo etiqueta="Etiquetas" ayuda="Separadas por coma.">
            {(props) => (
              <Entrada
                value={entrada.etiquetas}
                onChange={(evento) => cambiar({ etiquetas: evento.target.value })}
                {...props}
              />
            )}
          </Campo>

          <Campo etiqueta="Nota">
            {(props) => (
              <AreaTexto
                value={entrada.nota}
                onChange={(evento) => cambiar({ nota: evento.target.value })}
                {...props}
              />
            )}
          </Campo>

          {error !== null && campoConError === null && (
            <p role="alert" className="text-texto-peligro text-xs">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={enCurso}>Guardar</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
