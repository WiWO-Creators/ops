'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { VistaPreviaAlta, type MarcaPrevia } from './VistaPreviaAlta'
import type { Referencia } from '@/datos/recursos'

/**
 * Alta de un Proceso desde cualquier pantalla, en una linea.
 *
 * Existe por una razon concreta: hasta ahora la unica forma de crear una tarea era entrar al Espacio
 * y usar su formulario, lo que obliga a **saber a que Espacio pertenece antes de poder anotarla**.
 * Esa decision previa es la que termina mandando las tareas a un chat. Aca el Espacio es opcional y
 * se asigna despues.
 *
 * Lo que se escribe se interpreta con `interpretarAltaRapida`, que vive fuera de React porque es la
 * parte con reglas. Lo que el parser no reconoce **queda en el titulo**: nada se pierde en silencio.
 *
 * === POR QUE HAY DOS MODOS ===
 *
 * La linea es rapida cuando uno ya sabe la sintaxis, pero deja de serlo en cuanto un `@` no resuelve:
 * hay cuatro personas cuyo nombre empieza con "javier" y el parser, con razon, no elige por nadie.
 * Ahi la unica salida honesta es un campo donde se elija. "Por campos" es el mismo formulario que la
 * pantalla de un Espacio muestra cuando la IA esta apagada, mas el Espacio y el responsable, que ahi
 * vienen fijos y aca no.
 *
 * Los dos modos terminan en el mismo `POST /tasks`: lo que cambia es como se llenan los campos, no
 * que se crea.
 */

interface PropsAltaRapida {
  /** Personas, Espacios y prioridades contra los que resolver `@`, `#` y `!`. */
  catalogos: CatalogosAlta
  /**
   * Etiquetas que ya existen (`lookups.tags`).
   *
   * Se ofrecen como sugerencia en un `datalist`, no como limite: una etiqueta escrita que no esta
   * en el catalogo se crea en el alta. Solo las usa el modo por campos.
   */
  etiquetas: Referencia[]
}

/** Valor del selector cuando no se eligio nada. Radix no admite `value=""` en una opcion. */
const NINGUNO = 'ninguno'

/** `id` del `datalist` de etiquetas; el `list` del campo lo referencia por nombre. */
const LISTA_ETIQUETAS = 'etiquetas-alta-rapida'

/** Los dos modos del dialogo. */
const MODOS = [
  { valor: 'linea', etiqueta: 'En una línea' },
  { valor: 'campos', etiqueta: 'Por campos' }
] as const

type Modo = typeof MODOS[number]['valor']

export function AltaRapidaProceso ({ catalogos, etiquetas }: PropsAltaRapida): ReactElement {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState<Modo>('linea')
  const [texto, setTexto] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Campos del modo "por campos". Viven aparte de la linea a proposito: cambiar de modo no debe
  // borrar lo que se escribio en el otro, porque se alterna justo cuando un `@` no resolvio.
  const [nombre, setNombre] = useState('')
  const [espacio, setEspacio] = useState(NINGUNO)
  const [responsable, setResponsable] = useState(NINGUNO)
  const [prioridad, setPrioridad] = useState(NINGUNO)
  const [inicio, setInicio] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [etiquetasEscritas, setEtiquetasEscritas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [facturable, setFacturable] = useState(true)

  // Se recalcula mientras se escribe: la vista previa es lo que hace confiable a una sintaxis que
  // nadie leyo en un manual.
  const leido = useMemo(
    () => interpretarAltaRapida(texto, catalogos),
    [texto, catalogos]
  )

  const nombreDe = (id: number, lista: ReadonlyArray<{ id: number }>, campo: 'full_name' | 'name'): string => {
    const fila = lista.find((f) => f.id === id) as Record<string, unknown> | undefined
    return fila === undefined ? '' : String(fila[campo])
  }

  // Las marcas se arman aca, no en la vista previa: los nombres salen de los catalogos de esta
  // pantalla y la vista previa solo pinta lo que ya viene con nombre. Aca todas son 'texto': el alta
  // rapida no llama al modelo, su gracia es ser instantanea.
  const marcas: MarcaPrevia[] = []

  if (leido.due_date !== null) {
    marcas.push({ texto: `Vence ${formatearFecha(leido.due_date)}`, origen: 'texto' })
  }
  if (leido.rel_id !== null) {
    marcas.push({ texto: nombreDe(leido.rel_id, catalogos.espacios, 'name'), origen: 'texto' })
  }
  if (leido.priority !== null) {
    marcas.push({ texto: nombreDe(leido.priority, catalogos.prioridades, 'name'), origen: 'texto' })
  }
  for (const id of leido.assignees) {
    marcas.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: 'texto' })
  }

  function limpiar (): void {
    setTexto('')
    setError(null)
    setNombre('')
    setEspacio(NINGUNO)
    setResponsable(NINGUNO)
    setPrioridad(NINGUNO)
    setInicio('')
    setVencimiento('')
    setEtiquetasEscritas('')
    setDescripcion('')
    setFacturable(true)
  }

  /**
   * Manda el alta con el cuerpo que armo el modo activo.
   *
   * @param cuerpo el cuerpo de `POST /tasks`, ya sin campos vacios
   */
  async function enviar (cuerpo: Record<string, unknown>): Promise<void> {
    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', cuerpo)

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    limpiar()
    setAbierto(false)
    router.refresh()
  }

  /**
   * Alta desde la linea.
   *
   * `sinResolver` no bloquea: si alguien escribio `@nadie`, la tarea igual se crea con ese texto en
   * el titulo. Es preferible una tarea anotada con un dato de mas que una tarea que no se anoto.
   */
  async function crearDesdeLinea (): Promise<void> {
    if (leido.name.trim() === '') {
      setError('Escribe al menos un título.')
      return
    }

    await enviar({
      name: leido.name,
      due_date: leido.due_date,
      priority: leido.priority ?? undefined,
      assignees: leido.assignees,
      rel_type: leido.rel_type,
      rel_id: leido.rel_id
    })
  }

  /**
   * Alta por campos.
   *
   * Solo el nombre es obligatorio; lo que quedo sin elegir no viaja, para que la API aplique sus
   * propios valores por defecto en vez de recibir un `null` que significa otra cosa.
   *
   * Las etiquetas viajan como nombres: la API resuelve las que existen y crea las que no. El
   * `datalist` sugiere las creadas para que la variante con typo sea la excepcion y no la regla.
   */
  async function crearPorCampos (): Promise<void> {
    if (nombre.trim() === '') {
      setError('La tarea necesita un nombre.')
      return
    }

    // La colacion de `tbltags` es `_ci`: "urgente" y "Urgente" son la misma fila para la API, asi
    // que no hace falta normalizar nada aca.
    const pedidas = etiquetasEscritas.split(',').map((t) => t.trim()).filter((t) => t !== '')

    await enviar({
      name: nombre.trim(),
      billable: facturable,
      ...(espacio === NINGUNO ? {} : { rel_type: 'project', rel_id: Number(espacio) }),
      ...(responsable === NINGUNO ? {} : { assignees: [Number(responsable)] }),
      ...(prioridad === NINGUNO ? {} : { priority: Number(prioridad) }),
      ...(inicio === '' ? {} : { start_date: inicio }),
      ...(vencimiento === '' ? {} : { due_date: vencimiento }),
      ...(descripcion.trim() === '' ? {} : { description: descripcion.trim() }),
      ...(pedidas.length === 0 ? {} : { tags: pedidas })
    })
  }

  /** Manda el alta del modo activo. */
  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    if (modo === 'linea') await crearDesdeLinea()
    else await crearPorCampos()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(estado) => {
        setAbierto(estado)
        if (!estado) limpiar()
      }}
    >
      <DisparadorDialogo asChild>
        <Boton variante="primario">Nueva tarea</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`${GLOSARIO.proceso.singular} nuevo`}
        descripcion={`Una línea o campo por campo. El ${GLOSARIO.espacio.singular.toLowerCase()} puede quedar vacío y asignarse después.`}
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
          <Segmentado
            etiqueta="Cómo escribir la tarea"
            opciones={MODOS}
            activo={modo}
            onElegir={(valor) => { setModo(valor as Modo); setError(null) }}
          />

          {modo === 'linea'
            ? (
              <>
                <Campo etiqueta="Qué hay que hacer" requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      value={texto}
                      autoFocus
                      placeholder="Grilla Colbún septiembre mañana @franz #Colbún !alta"
                      onChange={(e) => { setTexto(e.target.value) }}
                    />
                  )}
                </Campo>

                <VistaPreviaAlta titulo={leido.name} marcas={marcas} sinResolver={leido.sinResolver} />

                <p className="text-texto-sutil text-xs">
                  <code className="text-texto-tenue">@persona</code> asigna ·{' '}
                  <code className="text-texto-tenue">#{GLOSARIO.espacio.singular.toLowerCase()}</code> lo
                  vincula · <code className="text-texto-tenue">!prioridad</code> ·{' '}
                  <code className="text-texto-tenue">mañana</code>, <code className="text-texto-tenue">viernes</code>{' '}
                  o <code className="text-texto-tenue">30/9</code> ponen la entrega. Con espacios, entre comillas.
                  {' '}Si un nombre coincide con varias personas queda en el título: ahí conviene «Por campos».
                </p>
              </>
              )
            : (
              <>
                <Campo etiqueta="Nombre" requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      value={nombre}
                      autoFocus
                      placeholder="Revisar el contrato"
                      onChange={(evento) => { setNombre(evento.target.value) }}
                    />
                  )}
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta={GLOSARIO.espacio.singular}>
                    {({ id }) => (
                      <Selector value={espacio} onValueChange={setEspacio}>
                        <DisparadorSelector id={id} />
                        <ContenidoSelector>
                          <Opcion value={NINGUNO}>Sin {GLOSARIO.espacio.singular.toLowerCase()}</Opcion>
                          {catalogos.espacios.map((fila) => (
                            <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                          ))}
                        </ContenidoSelector>
                      </Selector>
                    )}
                  </Campo>

                  <Campo
                    etiqueta="Responsable"
                    ayuda={catalogos.personas.length === 0 ? 'No tienes permiso para ver el equipo.' : undefined}
                  >
                    {({ id }) => (
                      <Selector
                        value={responsable}
                        onValueChange={setResponsable}
                        disabled={catalogos.personas.length === 0}
                      >
                        <DisparadorSelector id={id} />
                        <ContenidoSelector>
                          <Opcion value={NINGUNO}>Sin responsable</Opcion>
                          {catalogos.personas.map((fila) => (
                            <Opcion key={fila.id} value={String(fila.id)}>{fila.full_name}</Opcion>
                          ))}
                        </ContenidoSelector>
                      </Selector>
                    )}
                  </Campo>
                </div>

                <Campo etiqueta="Prioridad">
                  {({ id }) => (
                    <Selector value={prioridad} onValueChange={setPrioridad}>
                      <DisparadorSelector id={id} />
                      <ContenidoSelector>
                        <Opcion value={NINGUNO}>La que trae por defecto</Opcion>
                        {catalogos.prioridades.map((fila) => (
                          <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                        ))}
                      </ContenidoSelector>
                    </Selector>
                  )}
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Fecha de inicio">
                    {(props) => (
                      <Entrada
                        {...props}
                        type="date"
                        value={inicio}
                        onChange={(evento) => { setInicio(evento.target.value) }}
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Fecha de vencimiento">
                    {(props) => (
                      <Entrada
                        {...props}
                        type="date"
                        value={vencimiento}
                        onChange={(evento) => { setVencimiento(evento.target.value) }}
                      />
                    )}
                  </Campo>
                </div>

                <Campo etiqueta="Etiquetas" ayuda="Separadas por coma. Si escribes una que no existe, se crea.">
                  {(props) => (
                    <>
                      <Entrada
                        {...props}
                        value={etiquetasEscritas}
                        placeholder="urgente, cliente-clave"
                        list={LISTA_ETIQUETAS}
                        onChange={(evento) => { setEtiquetasEscritas(evento.target.value) }}
                      />
                      {/* `datalist` es la sugerencia nativa: no valida ni obliga, y reusar la
                          etiqueta que ya existe evita fundar la variante con typo. */}
                      <datalist id={LISTA_ETIQUETAS}>
                        {etiquetas.map((e) => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </>
                  )}
                </Campo>

                <Campo etiqueta="Descripción">
                  {(props) => (
                    <AreaTexto
                      {...props}
                      value={descripcion}
                      onChange={(evento) => { setDescripcion(evento.target.value) }}
                    />
                  )}
                </Campo>

                <label className="text-texto flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={facturable}
                    onChange={(evento) => { setFacturable(evento.target.checked) }}
                  />
                  Facturable
                </label>
              </>
              )}

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton type="submit" variante="primario" cargando={enCurso}>Crear</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
