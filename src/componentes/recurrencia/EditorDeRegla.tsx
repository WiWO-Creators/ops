'use client'

import { CalendarDays, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta } from '@/datos/cliente'
import {
  camposDeRegla, cuerpoDePrevia, erroresDeApiEnRegla, erroresDeRegla, parcheDeRegla, textoDeFechaDePrevia, tieneDosTopes,
  UNIDADES_REGLA, type CampoRegla, type CamposRegla, type CuerpoPrevia, type Previa, type ReglaGuardada
} from '@/dominio/recurrencia'
import { formatearFecha } from '@/lib/fechas'
import { DiasExcluidos } from './DiasExcluidos'
import { FinDeRecurrencia } from './FinDeRecurrencia'

/** La Tarea cuya regla se edita: lo guardado y lo minimo para nombrarla. */
export type TareaConRegla = ReglaGuardada & { id: number, name: string, paused?: boolean }

/** Espera entre la ultima tecla y el pedido de la vista previa. */
const ESPERA_PREVIA_MS = 300

/**
 * Editor de la regla de una Tarea recurrente, y solo de la regla.
 *
 * Existe porque editar la recurrencia era abrir la ficha, apretar "Editar" y buscar la casilla entre
 * Facturable y Pública, con el formulario entero de la Tarea alrededor. Aca estan solo las cinco
 * cosas que definen cuando nace una copia —inicio, frecuencia, dias excluidos y fin— y una vista
 * previa con las fechas que van a salir, calculadas por la API con la misma aritmetica del cron.
 *
 * Es un `Dialogo` como `EdicionTarea`: se abre igual sobre el listado de recurrentes que sobre la
 * ficha (que ya vive en un modal), y Radix apila los dos sin pelear por el foco.
 *
 * Guardar manda solo lo que cambio (`parcheDeRegla`); `escribirEnBff` avisa `ops:tareas-cambiadas`
 * y el listado y la ficha se recargan solos.
 *
 * @param tarea la Tarea a editar, o null con el editor cerrado
 * @param onCerrar se llama al cerrar, se haya guardado o no
 * @param onGuardada se llama despues de un guardado que salio bien
 */
export function EditorDeRegla ({ tarea, onCerrar, onGuardada }: {
  tarea: TareaConRegla | null
  onCerrar: () => void
  onGuardada?: () => void
}): ReactElement {
  return (
    <Dialogo open={tarea !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      {tarea !== null && (
        <ContenidoDialogo titulo="Editar recurrencia" descripcion={tarea.name} cerrable>
          {/* Montado por Tarea: abrir otra arranca de sus valores, no de los de la anterior. */}
          <FormularioDeRegla key={tarea.id} tarea={tarea} onCerrar={onCerrar} onGuardada={onGuardada} />
        </ContenidoDialogo>
      )}
    </Dialogo>
  )
}

/** Estado de la vista previa. `errores` son los del 422, repartidos por campo. */
type EstadoPrevia =
  | { fase: 'esperando' }
  | { fase: 'lista', previa: Previa }
  | { fase: 'error', mensaje: string, errores: Partial<Record<CampoRegla, string>> }

/**
 * Pide la vista previa a la API, sin pasar por `escribirEnBff`.
 *
 * Es un `POST` que no escribe nada: por `escribirEnBff` dispararia `ops:tareas-cambiadas` en cada
 * tecla y el listado de atras se recargaria sin motivo. Ademas necesita la señal para cancelar la
 * respuesta vieja cuando la persona sigue escribiendo.
 *
 * @param cuerpo lo que hay en el formulario, en la forma del contrato
 * @param senal aborta el pedido si llega otro
 * @returns el estado ya resuelto
 * @throws DOMException `AbortError` si se cancelo; quien llama lo descarta
 */
async function pedirPrevia (cuerpo: CuerpoPrevia, senal: AbortSignal): Promise<EstadoPrevia> {
  const respuesta = await fetch('/api/bff/tasks/recurrentes/previa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: senal
  })

  if (!respuesta.ok) {
    const detalles = await respuesta.clone().json()
      .then((sobre: { error?: { details?: Record<string, unknown> } }) => sobre.error?.details)
      .catch(() => undefined)

    return { fase: 'error', mensaje: await mensajeDeRespuesta(respuesta), errores: erroresDeApiEnRegla(detalles) }
  }

  const sobre = await respuesta.json() as { data: Previa }

  return { fase: 'lista', previa: sobre.data }
}

/**
 * La vista previa de lo que hay en el formulario, con espera y sin carreras.
 *
 * Cada cambio cancela el pedido anterior (`AbortController`) y espera `ESPERA_PREVIA_MS` antes de
 * salir: asi una respuesta vieja nunca pisa a una nueva, y escribir "12" no pide la del "1".
 * Con errores locales no se pide nada: la API contestaria el mismo 422 que ya se esta mostrando.
 *
 * @param cuerpo el cuerpo a pedir, o null si el formulario no esta para pedir
 * @returns el estado de la ultima vista previa pedida
 */
function useVistaPrevia (cuerpo: CuerpoPrevia | null): EstadoPrevia {
  // El resultado se guarda junto con el cuerpo que lo pidio: mientras el cuerpo actual no tenga el
  // suyo, la vista previa esta "esperando", y la de la configuracion anterior no se muestra como si
  // fuera de esta.
  const [resuelta, setResuelta] = useState<{ clave: string, estado: EstadoPrevia } | null>(null)
  const clave = cuerpo === null ? null : JSON.stringify(cuerpo)

  useEffect(() => {
    if (clave === null) return

    const control = new AbortController()
    const espera = window.setTimeout(() => {
      pedirPrevia(JSON.parse(clave) as CuerpoPrevia, control.signal)
        .then((estado) => { if (!control.signal.aborted) setResuelta({ clave, estado }) })
        .catch((fallo: unknown) => {
          if (control.signal.aborted) return
          const mensaje = fallo instanceof Error ? fallo.message : 'No se pudo calcular la vista previa.'
          setResuelta({ clave, estado: { fase: 'error', mensaje, errores: {} } })
        })
    }, ESPERA_PREVIA_MS)

    return () => {
      window.clearTimeout(espera)
      control.abort()
    }
  }, [clave])

  return clave !== null && resuelta?.clave === clave ? resuelta.estado : { fase: 'esperando' }
}

/**
 * El formulario: los campos, la vista previa y el guardado.
 */
function FormularioDeRegla ({ tarea, onCerrar, onGuardada }: {
  tarea: TareaConRegla
  onCerrar: () => void
  onGuardada?: () => void
}): ReactElement {
  const inicial = useMemo(() => camposDeRegla(tarea), [tarea])
  const [campos, setCampos] = useState<CamposRegla>(inicial)
  const [intentado, setIntentado] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [erroresApi, setErroresApi] = useState<Partial<Record<CampoRegla, string>>>({})

  const erroresLocales = erroresDeRegla(campos)
  const hayErroresLocales = Object.keys(erroresLocales).length > 0
  const previa = useVistaPrevia(hayErroresLocales ? null : cuerpoDePrevia(inicial, campos, tarea.id))
  const erroresPrevia = previa.fase === 'error' ? previa.errores : {}
  // Los dias se avisan apenas se marcan: excluir el septimo es el error que se comete con un clic.
  // El resto espera al primer intento de guardar, para no retar a quien todavia esta escribiendo.
  const errores: Partial<Record<CampoRegla, string>> = {
    ...erroresPrevia,
    ...erroresApi,
    ...(intentado ? erroresLocales : { dias: erroresLocales.dias })
  }
  const sinCopias = previa.fase === 'lista' && previa.previa.none
  const dosTopes = tieneDosTopes(inicial) && campos.fin.modo === inicial.fin.modo &&
    campos.fin.ciclos === inicial.fin.ciclos && campos.fin.hasta === inicial.fin.hasta

  /** Cambia un campo y limpia los errores de la API, que eran del valor anterior. */
  function cambiar (siguientes: Partial<CamposRegla>): void {
    setCampos((antes) => ({ ...antes, ...siguientes }))
    setErroresApi({})
    setError(null)
  }

  /** Valida, manda el parche y cierra si salio bien. */
  async function guardar (evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    setIntentado(true)
    if (hayErroresLocales) return

    const parche = parcheDeRegla(inicial, campos)
    if (Object.keys(parche).length === 0) {
      onCerrar()
      return
    }

    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`tasks/${tarea.id}`, 'PATCH', parche)
    setEnCurso(false)

    if (!resultado.ok) {
      setErroresApi(erroresDeApiEnRegla(resultado.detalles))
      setError(resultado.mensaje)
      return
    }

    onGuardada?.()
    onCerrar()
  }

  return (
    <form noValidate onSubmit={(evento) => { void guardar(evento) }} className="flex flex-col gap-5">
      {tarea.paused === true && (
        <p className="bg-superficie-hundida text-texto-tenue rounded-control px-3 py-2 text-sm">
          Esta regla está pausada: los cambios se guardan, pero no genera copias hasta que la reanudes.
        </p>
      )}

      <fieldset disabled={enCurso} className="grid min-w-0 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Inicio" error={errores.inicio} ayuda="Desde aquí se cuentan las copias.">
          {(props) => (
            <Entrada {...props} type="date" required value={campos.inicio} onChange={(evento) => { cambiar({ inicio: evento.target.value }) }} />
          )}
        </Campo>
        <Campo etiqueta="Repetir cada" error={errores.repetirCada}>
          {(props) => (
            <Entrada
              {...props}
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={campos.repetirCada}
              onChange={(evento) => { cambiar({ repetirCada: evento.target.value }) }}
            />
          )}
        </Campo>
        <Campo etiqueta="Unidad" error={errores.unidad}>
          {({ id }) => (
            <Selector value={campos.unidad} onValueChange={(valor) => { cambiar({ unidad: valor }) }}>
              <DisparadorSelector id={id} />
              <ContenidoSelector>
                {UNIDADES_REGLA.map((unidad) => <Opcion key={unidad.valor} value={unidad.valor}>{unidad.etiqueta}</Opcion>)}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <DiasExcluidos valor={campos.dias} onCambiar={(dias) => { cambiar({ dias }) }} error={errores.dias} />

        <div className="flex min-w-0 flex-col gap-2 sm:col-span-3">
          <FinDeRecurrencia inicio={campos.inicio} valor={campos.fin} onCambiar={(fin) => { cambiar({ fin }) }} />
          {errores.fin !== undefined && <p role="alert" className="text-texto-peligro text-xs">{errores.fin}</p>}
          {dosTopes && (
            <p className="text-texto-sutil text-xs">
              Esta regla termina tras {inicial.fin.ciclos} veces o el {formatearFecha(inicial.fin.hasta)}, lo que ocurra
              primero. Si no tocas “Termina”, se conservan los dos topes; si lo cambias, queda solo el que elijas.
            </p>
          )}
        </div>
      </fieldset>

      <VistaPrevia estado={previa} hayErroresLocales={hayErroresLocales} />

      {error !== null && <p role="alert" className="text-texto-peligro animate-entrar-abajo text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enCurso}>Cancelar</Boton>
        <Boton
          type="submit"
          variante={sinCopias ? 'peligro' : 'primario'}
          cargando={enCurso}
          // Sin vista previa resuelta no se sabe si la regla genera algo: guardar a ciegas una regla
          // que nunca copia es justo el error que la vista previa esta para evitar.
          disabled={!hayErroresLocales && previa.fase === 'esperando'}
        >
          {sinCopias ? 'Guardar de todos modos' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}

/**
 * La frase de la regla y las proximas fechas, o por que no hay.
 *
 * `aria-live` para que quien usa lector de pantalla oiga el resultado de cada cambio sin tener que ir
 * a buscarlo; `polite` para no cortarle lo que esta leyendo.
 */
function VistaPrevia ({ estado, hayErroresLocales }: { estado: EstadoPrevia, hayErroresLocales: boolean }): ReactElement {
  return (
    <section aria-live="polite" aria-busy={estado.fase === 'esperando' && !hayErroresLocales} className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-2 border p-4">
      <h3 className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">Vista previa</h3>

      {hayErroresLocales
        ? <p className="text-texto-tenue text-sm">Corrige los campos marcados para ver las próximas copias.</p>
        : estado.fase === 'esperando'
          ? <p className="text-texto-tenue text-sm">Calculando las próximas copias…</p>
          : estado.fase === 'error'
            ? <p className="text-texto-peligro text-sm">{estado.mensaje}</p>
            : <ContenidoPrevia previa={estado.previa} />}
    </section>
  )
}

/** La vista previa ya resuelta: la frase, y las fechas o el aviso de que no habra ninguna. */
function ContenidoPrevia ({ previa }: { previa: Previa }): ReactElement {
  return (
    <>
      <p className="text-texto text-sm font-semibold">{previa.frequency_label ?? 'Sin frecuencia'}</p>
      {previa.none
        ? (
          <p role="alert" className="bg-superficie-aviso text-texto-aviso rounded-control flex items-start gap-2 px-3 py-2 text-sm">
            <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            Con esta configuración no se generará ninguna copia.
          </p>
          )
        : (
          <ol aria-label="Próximas copias" className="flex flex-col gap-1">
            {previa.dates.map((fecha) => (
              <li key={fecha} className="text-texto-tenue flex items-center gap-2 text-sm">
                <CalendarDays size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
                <span className="first-letter:uppercase">{textoDeFechaDePrevia(fecha)}</span>
              </li>
            ))}
          </ol>
          )}
    </>
  )
}
