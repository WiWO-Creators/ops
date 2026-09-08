'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo
} from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { leerError } from '@/datos/errores'
import type { Hito, PersonaAsignable, Proceso, ResultadoAccionMasiva } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import {
  accionesMasivasPermitidas,
  valorDeAccionMasiva,
  type AccionMasivaDescrita
} from './tareas'

/**
 * Barra de acciones masivas de la tabla de tareas.
 *
 * Aparece solo con filas seleccionadas y desaparece al vaciarlas: una barra siempre visible con
 * botones que no hacen nada ocupa el lugar donde deberia estar la tabla.
 *
 * Cada accion abre un dialogo con el control que le corresponde en vez de aplicarse de una: cambiar
 * el estado de veinte tareas sin poder elegir cual es un boton que nadie va a tocar.
 *
 * **El permiso lo vuelve a decidir el backend.** Aca solo se poda lo que ya se sabe que falla, y en
 * `status` ni siquiera eso: el backend aplica fila por fila y devuelve en `meta.omitidos` las que se
 * salteo, que es lo que la barra informa al terminar.
 *
 * Recibe la forma que pide `seleccionMasiva` de `TablaRecurso` —las filas, limpiar y recargar—, asi
 * que la misma barra sirve en la vista global y en la pestaña de un Espacio, y las casillas las
 * dibuja el motor en las dos.
 */

interface PropsAcciones {
  /**
   * El Espacio, cuando la barra vive dentro de uno. Sin el se poda "Mover a un hito": los hitos
   * cuelgan de un Espacio y la API no expone un listado global, el mismo motivo por el que el filtro
   * de Hito depende de elegir Espacio.
   */
  proyectoId?: number
  /** Las tareas seleccionadas en la pagina visible. */
  filas: Proceso[]
  capacidades: Capacidad[]
  estados: OpcionFiltro[]
  prioridades: OpcionFiltro[]
  limpiar: () => void
  /** Se llama cuando el backend confirmo: la tabla tiene que volver a pedir los datos. */
  recargar: () => void
}

export function AccionesMasivasTareas ({
  proyectoId,
  filas,
  capacidades,
  estados,
  prioridades,
  limpiar,
  recargar
}: PropsAcciones): ReactElement | null {
  const [accion, setAccion] = useState<AccionMasivaDescrita | null>(null)
  const [valor, setValor] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personal, setPersonal] = useState<PersonaAsignable[]>([])
  const [hitos, setHitos] = useState<Hito[]>([])

  const ids = filas.map((fila) => fila.id)
  const disponibles = accionesMasivasPermitidas(capacidades)
    .filter((accion) => accion.control !== 'hito' || proyectoId !== undefined)

  if (ids.length === 0 || disponibles.length === 0) return null

  /**
   * Abre el dialogo de una accion y trae las opciones que esa accion necesita.
   *
   * Los catalogos grandes —el personal activo, los hitos del proyecto— se piden al abrir y no al
   * montar la pantalla: la mayoria de las veces nadie usa acciones masivas, y son dos peticiones que
   * no le sirven a nadie.
   */
  function abrir (elegida: AccionMasivaDescrita): void {
    setAccion(elegida)
    setValor('')
    setError(null)

    if (elegida.control === 'personas' && personal.length === 0) {
      // `GET /staff/asignables` y no `GET /staff`: este exige `staff.view`, que tienen 19 de 184
      // personas, y sin el la lista llegaba vacia. Es la misma fuente que el selector de la tarea,
      // asi que las dos pantallas ofrecen exactamente la misma gente.
      void cargarAsignables()
        .then(setPersonal)
        .catch(() => setError('No se pudo traer el equipo.'))
    }

    if (elegida.control === 'hito' && proyectoId !== undefined && hitos.length === 0) {
      void pedirSobre<Hito[]>(`projects/${proyectoId}/milestones`, new AbortController().signal)
        .then((sobre) => setHitos(sobre.data))
        .catch(() => setError('No se pudieron traer los hitos.'))
    }
  }

  /** Manda la accion al backend y avisa cuantas se aplicaron y cuantas se saltearon. */
  async function aplicar (): Promise<void> {
    if (accion === null) return

    const valorTipado = valorDeAccionMasiva(accion.control, valor)

    if (accion.control !== 'ninguno' && valorTipado === null) {
      setError('Elige un valor antes de aplicar.')
      return
    }

    setEnCurso(true)
    setError(null)

    try {
      const respuesta = await fetch('/api/bff/tasks/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          ids,
          accion: accion.clave,
          ...(valorTipado === null ? {} : { valor: valorTipado })
        })
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      const sobre = await respuesta.json() as { data: ResultadoAccionMasiva, meta?: { omitidos?: number[] } }
      const omitidos = sobre.meta?.omitidos ?? []

      setAccion(null)
      limpiar()
      recargar()

      if (omitidos.length > 0) {
        setError(`Se aplicó a ${sobre.data.aplicados}. ${omitidos.length} quedaron sin cambiar por permisos.`)
      }
    } catch {
      setError('No se pudo aplicar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <div
      role="group"
      aria-label="Acciones sobre las tareas seleccionadas"
      className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-wrap items-center gap-2 border p-2"
    >
      <span className="text-texto text-sm font-medium tabular-nums">
        {ids.length} seleccionada{ids.length === 1 ? '' : 's'}
      </span>

      <Boton variante="sutil" tamano="chico" onClick={limpiar}>
        Limpiar
      </Boton>

      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="secundario" tamano="chico" className="ml-auto">
            Acción masiva
          </Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end">
          {disponibles.map((disponible) => (
            <ItemMenu
              key={disponible.clave}
              peligroso={disponible.peligrosa === true}
              onSelect={() => abrir(disponible)}
            >
              {disponible.etiqueta}
            </ItemMenu>
          ))}
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && (
        <p role="alert" className="text-texto-peligro w-full text-xs">{error}</p>
      )}

      <Dialogo open={accion !== null} onOpenChange={(abierto) => { if (!abierto) setAccion(null) }}>
        <ContenidoDialogo
          titulo={accion?.etiqueta ?? ''}
          descripcion={`Se aplica a ${ids.length} tarea${ids.length === 1 ? '' : 's'}.`}
        >
          <div className="flex flex-col gap-4">
            {accion !== null && (
              <ControlDeAccion
                accion={accion}
                valor={valor}
                onValor={setValor}
                estados={estados}
                prioridades={prioridades}
                personal={personal}
                hitos={hitos}
              />
            )}

            {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
              <CerrarDialogo asChild>
                <Boton variante="sutil">Cancelar</Boton>
              </CerrarDialogo>
              <Boton
                variante={accion?.peligrosa === true ? 'peligro' : 'primario'}
                cargando={enCurso}
                onClick={() => { void aplicar() }}
              >
                Aplicar
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}

interface PropsControl {
  accion: AccionMasivaDescrita
  valor: string
  onValor: (valor: string) => void
  estados: OpcionFiltro[]
  prioridades: OpcionFiltro[]
  personal: PersonaAsignable[]
  hitos: Hito[]
}

/**
 * El control con el que se elige el valor de la accion.
 *
 * Los ids elegidos viajan como una cadena separada por comas y `valorDeAccionMasiva` los tipa: asi la
 * traduccion al cuerpo del contrato queda en un `.ts` que se prueba, y no repartida por el JSX.
 */
function ControlDeAccion ({
  accion,
  valor,
  onValor,
  estados,
  prioridades,
  personal,
  hitos
}: PropsControl): ReactElement {
  if (accion.control === 'ninguno') {
    return (
      <p className="text-texto-tenue text-sm">
        Esta acción no se puede deshacer.
      </p>
    )
  }

  if (accion.control === 'etiquetas') {
    return (
      <Campo etiqueta="Etiquetas" ayuda="Separadas por coma. Se agregan a las que ya tenga la tarea.">
        {(props) => (
          <Entrada
            value={valor}
            onChange={(evento) => onValor(evento.target.value)}
            placeholder="urgente, revisión"
            {...props}
          />
        )}
      </Campo>
    )
  }

  if (accion.control === 'personas') {
    const elegidos = valor.split(',').filter((n) => n !== '')

    // Una lista de casillas no es un control: cada casilla lleva su propia etiqueta, y el grupo se
    // nombra con `fieldset`/`legend`. Por eso no usa `Campo`, que cablea UN `label` a UN control.
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-texto text-sm font-medium">Personas</legend>

        {/* Scroller vertical dentro del scroller del armazon: `data-lenis-prevent` le devuelve la
            rueda al navegador, que es lo que se espera de una lista acotada dentro de un panel. */}
        <ul data-lenis-prevent className="border-linea rounded-medio max-h-64 overflow-y-auto border">
          {personal.length === 0 && (
            <li className="p-3">
              <CargandoConOrbe mensaje="Cargando el equipo…" retardoMs={0} />
            </li>
          )}
          {personal.map((persona) => (
            <li key={persona.id} className="border-linea-suave border-b last:border-b-0">
              <label className="hover:bg-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={elegidos.includes(String(persona.id))}
                  onChange={() => {
                    const id = String(persona.id)
                    const siguiente = elegidos.includes(id)
                      ? elegidos.filter((n) => n !== id)
                      : [...elegidos, id]

                    onValor(siguiente.join(','))
                  }}
                />
                {persona.full_name}
              </label>
            </li>
          ))}
        </ul>

        <p className="text-texto-sutil text-xs">Se agregan a quienes ya estén asignados.</p>
      </fieldset>
    )
  }

  const opciones = accion.control === 'estado'
    ? estados
    : accion.control === 'prioridad'
      ? prioridades
      : accion.control === 'hito'
        ? hitos.map((hito) => ({ valor: String(hito.id), etiqueta: hito.name }))
        : [{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]

  return (
    <Campo etiqueta={accion.etiqueta}>
      {(props) => (
        <Selector value={valor} onValueChange={onValor}>
          <DisparadorSelector marcador="Elige una opción" id={props.id} />
          <ContenidoSelector>
            {opciones.map((opcion) => (
              <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>
      )}
    </Campo>
  )
}
