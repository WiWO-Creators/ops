'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import {
  areasElegiblesComoSuperior,
  aplanarArbol,
  construirArbol,
  type NodoArea
} from '@/dominio/organigrama'
import type { AreaDelEquipo, Jerarquia, PersonaDeJerarquia } from '@/datos/recursos'

/** Largo máximo del nombre de un área, tomado de `tblareas.name`. Adelanta el 422 `length`. */
const LARGO_NOMBRE = 100

/** Cuánta gente se ofrece a la vez en una lista. Con 184 personas, la lista entera no se lee. */
const TOPE_DE_LISTA = 25

/** El valor que usa el selector para "ninguna": Radix no acepta `null` ni la cadena vacía. */
const NINGUNA = 'ninguna'

/** Qué diálogo está abierto, y sobre qué área. */
type Formulario = { modo: 'alta' } | { modo: 'edicion', nodo: NodoArea }

/** Lo que devolvió la carga: los datos, el 403 con su explicación, o un fallo recuperable. */
type Carga =
  | { estado: 'datos', jerarquia: Jerarquia }
  | { estado: 'sin-organigrama', mensaje: string }
  | { estado: 'fallo', mensaje: string }

/**
 * Organigrama de áreas: el árbol, su alta y edición, y el reparto de la gente.
 *
 * Es un componente cliente y no una pantalla de servidor porque todas las operaciones tocan el mismo
 * dato: crear un área cambia las opciones de "de qué área cuelga", y mover a alguien lo saca de una
 * lista y lo pone en otra. Con `router.refresh()` cada una de esas cosas sería una navegación y un
 * repintado completo; acá se vuelve a pedir `GET /jerarquia`, que es una sola petición.
 *
 * Y es **una sola** petición a propósito: el árbol, la gente de cada área, quién no tiene ninguna y
 * el catálogo de asignables cambian juntos, así que pedirlos por separado dejaría la pantalla
 * mostrando dos momentos distintos del mismo dato.
 */
export function Organigrama () {
  const [carga, setCarga] = useState<Carga | null>(null)
  const [intento, setIntento] = useState(0)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirRespuesta('jerarquia', control.signal)
      .then(async (respuesta): Promise<Carga> => {
        // El 403 no es un fallo que se reintente: es la respuesta correcta para quien no dirige
        // ningún área. Llega con un mensaje ya redactado y se muestra tal cual.
        if (respuesta.status === 403) {
          return { estado: 'sin-organigrama', mensaje: await mensajeDeRespuesta(respuesta) }
        }

        if (!respuesta.ok) return { estado: 'fallo', mensaje: await mensajeDeRespuesta(respuesta) }

        const sobre = await respuesta.json() as { data: Jerarquia }

        return { estado: 'datos', jerarquia: sobre.data }
      })
      .then((resultado) => { setCarga(resultado) })
      .catch(() => {
        // Un aborto es el desmontaje del componente, no un fallo que haya que mostrar.
        if (control.signal.aborted) return

        setCarga({ estado: 'fallo', mensaje: 'No se pudo contactar al servidor. Revisá tu conexión.' })
      })

    return () => { control.abort() }
  }, [intento])

  /**
   * Vuelve a pedir la jerarquía. Lo llama cada escritura, porque todas cambian el mismo dato.
   *
   * Limpia el estado acá y no dentro del efecto: un `setState` sincrónico en el cuerpo de un efecto
   * encadena renders y el lint del proyecto lo rechaza. Acá además es lo correcto — el reintento
   * tiene que dejar de mostrar el error en el acto y pasar a la ventana de carga.
   */
  const recargar = useCallback(() => {
    setCarga(null)
    setIntento((numero) => numero + 1)
  }, [])

  // Memoizado aunque parezca trivial: sin esto el array literal del caso "todavía no hay datos" es
  // uno nuevo en cada render y arrastra a los dos `useMemo` de abajo a recalcular el árbol entero.
  const areas = useMemo(() => (carga?.estado === 'datos' ? carga.jerarquia.areas : []), [carga])
  const raices = useMemo(() => construirArbol(areas), [areas])
  const nodos = useMemo(() => aplanarArbol(raices), [raices])

  if (carga === null) return <Cargando alto="min-h-72" mensaje="Cargando el organigrama…" />

  if (carga.estado === 'sin-organigrama') {
    return <Vacio titulo="No hay organigrama para vos" descripcion={carga.mensaje} className="mt-6" />
  }

  if (carga.estado === 'fallo') {
    return <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} className="mt-6" />
  }

  const { jerarquia } = carga
  const nodoElegido = nodos.find((nodo) => nodo.area.id === elegida) ?? null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-texto-tenue text-sm">
          {jerarquia.es_admin ? contar(areas.length, 'área', 'áreas') : `Tu rama: ${contar(areas.length, 'área', 'áreas')}`}
          {' · '}
          {contar(raices.length, 'raíz', 'raíces')}
        </p>

        {/* Crear un área es de quien administra. Sin `es_admin` el botón no se dibuja: ofrecerlo para
            que la API conteste 403 es hacerle perder un viaje a quien lo aprieta. */}
        {jerarquia.es_admin && (
          <Boton variante="primario" onClick={() => { setFormulario({ modo: 'alta' }) }}>
            Nueva área
          </Boton>
        )}
      </div>

      <PendientesDeArea cantidad={jerarquia.sin_area.length} total={jerarquia.asignables.length} />

      {/* Una sola columna hasta 1024px: el panel de gente debajo del árbol se recorre con el pulgar,
          y dos columnas a ancho de teléfono dejarían las dos ilegibles. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        {areas.length === 0
          ? (
            <Vacio
              titulo="Todavía no hay áreas"
              descripcion="Creá la primera y después colgale las que dependan de ella. Mientras no haya ninguna, en «En vivo» cada persona se ve solo a sí misma."
              accion={jerarquia.es_admin
                ? <Boton variante="primario" onClick={() => { setFormulario({ modo: 'alta' }) }}>Crear la primera área</Boton>
                : undefined}
              className="border-linea rounded-tarjeta border"
            />
            )
          : (
            <ArbolDeAreas
              nodos={nodos}
              elegida={elegida}
              onElegir={setElegida}
              onEditar={(nodo) => { setFormulario({ modo: 'edicion', nodo }) }}
            />
            )}

        <div className="flex flex-col gap-4">
          <PanelSinArea jerarquia={jerarquia} nodo={nodoElegido} onCambio={recargar} />
          {nodoElegido !== null && (
            <PanelDelArea jerarquia={jerarquia} nodo={nodoElegido} onCambio={recargar} />
          )}
        </div>
      </div>

      {formulario !== null && (
        <FormularioDeArea
          jerarquia={jerarquia}
          nodo={formulario.modo === 'edicion' ? formulario.nodo : null}
          onCerrar={() => { setFormulario(null) }}
          onGuardado={() => { setFormulario(null); recargar() }}
        />
      )}
    </div>
  )
}

/** Un contador con su sustantivo en el número que corresponde. */
function contar (cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

/**
 * Cuánta gente falta ubicar, arriba de todo.
 *
 * Es el trabajo que la pantalla existe para permitir —hoy las 184 personas tienen el área en blanco—
 * así que el número va a la vista y no escondido en una esquina. Cuando llega a cero desaparece: un
 * aviso permanente que dice "cero" deja de leerse y se lleva puesto el siguiente.
 */
function PendientesDeArea ({ cantidad, total }: { cantidad: number, total: number }) {
  if (cantidad === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        Todo el equipo tiene área. En «En vivo», cada quien ve lo que le corresponde.
      </p>
    )
  }

  return (
    <div className="border-linea bg-superficie-aviso rounded-tarjeta flex flex-wrap items-center gap-x-3 gap-y-1 border px-4 py-3">
      <Insignia tono="aviso">{contar(cantidad, 'persona', 'personas')} sin área</Insignia>
      <p className="text-texto text-sm">
        de {total} en el equipo. Hasta que tengan una, en «En vivo» cada una se ve solo a sí misma.
      </p>
    </div>
  )
}

interface PropsArbol {
  nodos: NodoArea[]
  elegida: number | null
  onElegir: (id: number) => void
  onEditar: (nodo: NodoArea) => void
}

/**
 * El árbol, como una lista plana indentada por nivel.
 *
 * Plana y no con `<ul>` anidados a propósito: a diez niveles de profundidad el anidado real arrastra
 * márgenes que se acumulan y la última fila queda contra el borde derecho. Acá la jerarquía la dice
 * la sangría y el `aria-level`, que es lo que lee un lector de pantalla de todos modos.
 */
function ArbolDeAreas ({ nodos, elegida, onElegir, onEditar }: PropsArbol) {
  return (
    <ul role="tree" aria-label="Áreas del equipo" className="border-linea rounded-tarjeta divide-linea-suave divide-y border">
      {nodos.map((nodo) => (
        <FilaDeArea
          key={nodo.area.id}
          nodo={nodo}
          elegida={nodo.area.id === elegida}
          onElegir={onElegir}
          onEditar={onEditar}
        />
      ))}
    </ul>
  )
}

interface PropsFila {
  nodo: NodoArea
  elegida: boolean
  onElegir: (id: number) => void
  onEditar: (nodo: NodoArea) => void
}

/** Una fila del árbol: el área, quién la dirige, cuánta gente tiene y qué se le puede hacer. */
function FilaDeArea ({ nodo, elegida, onElegir, onEditar }: PropsFila) {
  const { area, nivel, alcance } = nodo
  const jefe = area.personas.find((persona) => persona.id === area.jefe_staffid)

  return (
    <li
      role="treeitem"
      aria-level={nivel + 1}
      aria-selected={elegida}
      className={elegida ? 'bg-acento-suave' : undefined}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
        // La sangría es inline porque depende del nivel, que es un dato y no una de las clases que
        // Tailwind puede generar de antemano. Se topa a seis para que el décimo nivel —si alguna vez
        // existe— no empuje el nombre fuera de la pantalla de un teléfono.
        style={{ paddingInlineStart: `calc(0.75rem + ${Math.min(nivel, 6)} * 1.25rem)` }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {nivel > 0 && <span aria-hidden="true" className="text-texto-sutil text-xs">└</span>}
            <span className="text-texto font-semibold">{area.name}</span>
          </div>

          <div className="text-texto-tenue flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <QuienDirige area={area} jefe={jefe} />

            <span>{contar(area.personas.length, 'persona', 'personas')}</span>

            {/* El alcance solo se nombra cuando difiere: en una hoja repetiría el número de al lado. */}
            {alcance > area.personas.length && (
              <span className="text-texto-sutil">ve a {alcance} con lo que cuelga</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Boton
            variante={elegida ? 'primario' : 'secundario'}
            tamano="chico"
            onClick={() => { onElegir(area.id) }}
          >
            Gente
          </Boton>

          {/* Sin `editable` no se dibuja: quien no administra ve su rama entera pero solo edita lo
              que dirige, y el botón que la API va a rechazar no tiene por qué existir. */}
          {area.editable && (
            <Boton variante="sutil" tamano="chico" onClick={() => { onEditar(nodo) }}>Editar</Boton>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * Quién dirige el área.
 *
 * El nombre sale de la gente del área, que es donde tiene que estar quien la dirige. Si no aparece
 * ahí, se dice el hecho en vez de inventar un nombre: un jefe que no pertenece al área que dirige es
 * un dato torcido que conviene ver, no esconder.
 */
function QuienDirige ({ area, jefe }: { area: AreaDelEquipo, jefe: PersonaDeJerarquia | undefined }) {
  if (area.jefe_staffid === null) return <span className="text-texto-sutil">Sin quien la dirija</span>

  if (jefe === undefined) return <span className="text-texto-sutil">La dirige alguien de otra área</span>

  return (
    <span className="flex items-center gap-1.5">
      <Avatar nombre={jefe.full_name} tamano="chico" />
      Dirige {jefe.full_name}
    </span>
  )
}

interface PropsFormulario {
  jerarquia: Jerarquia
  /** El área a editar, o `null` para un alta. */
  nodo: NodoArea | null
  onCerrar: () => void
  onGuardado: () => void
}

/**
 * Alta y edición de un área: su nombre, de qué área cuelga y quién la dirige.
 *
 * El selector de área superior no ofrece la propia ni su descendencia. Es lo mismo que la API
 * rechaza con `ciclo`, y ofrecerlo para después explicar que no se puede es hacerle perder un viaje
 * a quien completa el formulario.
 */
function FormularioDeArea ({ jerarquia, nodo, onCerrar, onGuardado }: PropsFormulario) {
  const area = nodo?.area ?? null
  const [nombre, setNombre] = useState(area?.name ?? '')
  const [superior, setSuperior] = useState(area?.area_superior_id == null ? NINGUNA : String(area.area_superior_id))
  const [jefe, setJefe] = useState(area?.jefe_staffid == null ? NINGUNA : String(area.jefe_staffid))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const elegibles = useMemo(
    () => areasElegiblesComoSuperior(jerarquia.areas, area?.id ?? null),
    [jerarquia.areas, area]
  )
  const nombreLimpio = nombre.trim()
  const errorNombre = nombreLimpio.length <= LARGO_NOMBRE
    ? undefined
    : `El nombre no puede pasar de ${LARGO_NOMBRE} caracteres.`

  /** Manda el alta (`POST`) o la edición (`PUT`, no `PATCH`) y avisa al llamador si salió bien. */
  async function guardar (): Promise<void> {
    if (nombreLimpio === '') {
      setError('Poné un nombre para el área.')

      return
    }

    if (errorNombre !== undefined) return

    const cuerpo = {
      name: nombreLimpio,
      area_superior_id: superior === NINGUNA ? null : Number(superior),
      jefe_staffid: jefe === NINGUNA ? null : Number(jefe)
    }

    setGuardando(true)
    setError(null)

    const resultado = area === null
      ? await escribirEnBff('jerarquia/areas', 'POST', cuerpo)
      : await escribirEnBff(`jerarquia/areas/${area.id}`, 'PUT', cuerpo)

    setGuardando(false)

    if (resultado.ok) {
      onGuardado()

      return
    }

    setError(resultado.mensaje)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={area === null ? 'Nueva área' : `Editar ${area.name}`}
        descripcion="De qué área cuelga decide quién la ve en «En vivo»: quien dirige un área ve a su gente y a la de todo lo que cuelga debajo."
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-4"
        >
          <Campo etiqueta="Nombre" requerido error={errorNombre}>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                maxLength={LARGO_NOMBRE}
                autoFocus
                placeholder="Analytics"
                onChange={(evento) => { setNombre(evento.target.value) }}
              />
            )}
          </Campo>

          <Campo
            etiqueta="De qué área cuelga"
            ayuda="Dejala en «Ninguna» para que sea una raíz del organigrama."
          >
            {(props) => (
              <Selector value={superior} onValueChange={setSuperior}>
                <DisparadorSelector id={props.id} marcador="Ninguna" />
                <ContenidoSelector>
                  <Opcion value={NINGUNA}>Ninguna (es una raíz)</Opcion>
                  {elegibles.map((elegible) => (
                    <Opcion key={elegible.area.id} value={String(elegible.area.id)}>
                      {' '.repeat(elegible.nivel * 2) + elegible.area.name}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo
            etiqueta="Quién la dirige"
            ayuda="Es quien va a ver en «En vivo» a la gente de esta área y a la de las que cuelgan."
          >
            {(props) => (
              <Selector value={jefe} onValueChange={setJefe}>
                <DisparadorSelector id={props.id} marcador="Nadie" />
                <ContenidoSelector>
                  <Opcion value={NINGUNA}>Nadie por ahora</Opcion>
                  {jerarquia.asignables.map((persona) => (
                    <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando}>
              {area === null ? 'Crear área' : 'Guardar'}
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Mueve a una persona con `PUT /jerarquia/personas/{id}`.
 *
 * Vive fuera de los dos paneles porque los dos hacen exactamente esto: uno manda gente hacia un área
 * y el otro la saca. `null` la deja sin área.
 *
 * @param persona a quién se mueve
 * @param areaId el área destino, o `null` para soltarla
 * @returns el mensaje del fallo, o `null` si salió bien
 */
async function moverPersona (persona: PersonaDeJerarquia, areaId: number | null): Promise<string | null> {
  const resultado = await escribirEnBff(`jerarquia/personas/${persona.id}`, 'PUT', { area_id: areaId })

  return resultado.ok ? null : `No se pudo mover a ${persona.full_name}. ${resultado.mensaje}`
}

interface PropsPanel {
  jerarquia: Jerarquia
  nodo: NodoArea | null
  onCambio: () => void
}

/**
 * Quién todavía no tiene área, y el botón para mandarlo a la elegida.
 *
 * Es el panel más importante de la pantalla y por eso va primero: hoy hay 184 personas en esta lista
 * y vaciarla es el trabajo entero. Hacerlo de a una entrando a cada ficha no termina nunca; acá se
 * elige un área en el árbol y se reparte desde una sola vista, con la búsqueda filtrando en el
 * navegador sobre la lista que ya está en memoria.
 */
function PanelSinArea ({ jerarquia, nodo, onCambio }: PropsPanel) {
  const [busqueda, setBusqueda] = useState('')
  const [moviendo, setMoviendo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const termino = busqueda.trim().toLowerCase()
  const coinciden = jerarquia.sin_area.filter(
    (persona) => termino === '' || persona.full_name.toLowerCase().includes(termino)
  )
  const destinoServido = nodo !== null && nodo.area.editable

  async function sumar (persona: PersonaDeJerarquia, areaId: number): Promise<void> {
    setMoviendo(persona.id)
    setError(null)

    const fallo = await moverPersona(persona, areaId)

    setMoviendo(null)

    if (fallo === null) onCambio()
    else setError(fallo)
  }

  if (jerarquia.sin_area.length === 0) return null

  return (
    <aside className="border-linea rounded-tarjeta flex flex-col gap-3 border p-4" aria-label="Personas sin área">
      <div>
        <h2 className="text-texto font-semibold">Sin área</h2>
        <p className="text-texto-tenue text-xs">
          {destinoServido
            ? `Sumalas a «${nodo.area.name}», que es el área elegida en el árbol.`
            : 'Elegí un área en el árbol —el botón «Gente»— para poder mandarlas ahí.'}
        </p>
      </div>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <Campo etiqueta="Buscar entre las que faltan">
        {(props) => (
          <Entrada
            {...props}
            type="search"
            value={busqueda}
            placeholder="Buscar por nombre"
            onChange={(evento) => { setBusqueda(evento.target.value) }}
          />
        )}
      </Campo>

      {coinciden.length === 0
        ? <p className="text-texto-sutil text-xs">Nadie sin área coincide con esa búsqueda.</p>
        : (
          <ul className="divide-linea-suave flex flex-col divide-y">
            {coinciden.slice(0, TOPE_DE_LISTA).map((persona) => (
              <li key={persona.id} className="flex items-center gap-2 py-2">
                <Avatar nombre={persona.full_name} tamano="chico" />
                <span className="text-texto min-w-0 flex-1 truncate text-sm">{persona.full_name}</span>

                {destinoServido && (
                  <Boton
                    variante="secundario"
                    tamano="chico"
                    cargando={moviendo === persona.id}
                    onClick={() => { void sumar(persona, nodo.area.id) }}
                  >
                    Sumar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
          )}

      {coinciden.length > TOPE_DE_LISTA && (
        <p className="text-texto-sutil text-xs">
          Se muestran {TOPE_DE_LISTA} de {coinciden.length}. Buscá por nombre para llegar a alguien en particular.
        </p>
      )}
    </aside>
  )
}

/**
 * La gente del área elegida, con la forma de sacarla o de traer a alguien de otra área.
 *
 * La lista de candidatos excluye a quien no tiene área: esa gente ya tiene su propio panel arriba,
 * que es donde está el trabajo, y repetirla acá haría dos listas con las mismas filas.
 */
function PanelDelArea ({ jerarquia, nodo, onCambio }: PropsPanel & { nodo: NodoArea }) {
  const [busqueda, setBusqueda] = useState('')
  const [moviendo, setMoviendo] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const nombrePorArea = useMemo(
    () => new Map(jerarquia.areas.map((area) => [area.id, area.name])),
    [jerarquia.areas]
  )

  /** Quién está en otra área editable, con el nombre de esa área para saber de dónde sale. */
  const deOtrasAreas = useMemo(() => jerarquia.areas
    .filter((area) => area.id !== nodo.area.id && area.editable)
    .flatMap((area) => area.personas.map((persona) => ({ persona, desde: nombrePorArea.get(area.id) ?? '' }))),
  [jerarquia.areas, nodo.area.id, nombrePorArea])

  const termino = busqueda.trim().toLowerCase()
  const candidatos = deOtrasAreas.filter(
    ({ persona }) => termino === '' || persona.full_name.toLowerCase().includes(termino)
  )

  async function mover (persona: PersonaDeJerarquia, areaId: number | null): Promise<void> {
    setMoviendo(persona.id)
    setError(null)

    const fallo = await moverPersona(persona, areaId)

    setMoviendo(null)

    if (fallo === null) onCambio()
    else setError(fallo)
  }

  return (
    <aside className="border-linea rounded-tarjeta flex flex-col gap-3 border p-4" aria-label={`Gente de ${nodo.area.name}`}>
      <div>
        <h2 className="text-texto font-semibold">{nodo.area.name}</h2>
        <p className="text-texto-tenue text-xs">
          {nodo.area.personas.length === 0 ? 'Todavía no hay nadie' : contar(nodo.area.personas.length, 'persona', 'personas')}
          {nodo.alcance > nodo.area.personas.length && ` · ${nodo.alcance} con lo que cuelga`}
        </p>
      </div>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {!nodo.area.editable && (
        <p className="text-texto-sutil text-xs">
          Esta área es de solo lectura para vos: la ves porque cuelga de tu rama, pero la maneja quien la dirige.
        </p>
      )}

      {nodo.area.personas.length > 0 && (
        <ul className="divide-linea-suave flex flex-col divide-y">
          {nodo.area.personas.map((persona) => (
            <li key={persona.id} className="flex items-center gap-2 py-2">
              <Avatar nombre={persona.full_name} tamano="chico" />
              <span className="text-texto min-w-0 flex-1 truncate text-sm">{persona.full_name}</span>

              {persona.id === nodo.area.jefe_staffid && <Insignia tono="acento" tamano="chico">Dirige</Insignia>}

              {nodo.area.editable && (
                <Boton
                  variante="sutil"
                  tamano="chico"
                  cargando={moviendo === persona.id}
                  onClick={() => { void mover(persona, null) }}
                >
                  Sacar
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      {nodo.area.editable && deOtrasAreas.length > 0 && (
        <div className="flex flex-col gap-2">
          <Campo etiqueta="Traer de otra área">
            {(props) => (
              <Entrada
                {...props}
                type="search"
                value={busqueda}
                placeholder="Buscar por nombre"
                onChange={(evento) => { setBusqueda(evento.target.value) }}
              />
            )}
          </Campo>

          {candidatos.length === 0
            ? <p className="text-texto-sutil text-xs">Nadie de otra área coincide con esa búsqueda.</p>
            : (
              <ul className="divide-linea-suave flex flex-col divide-y">
                {candidatos.slice(0, TOPE_DE_LISTA).map(({ persona, desde }) => (
                  <li key={persona.id} className="flex items-center gap-2 py-2">
                    <Avatar nombre={persona.full_name} tamano="chico" />

                    <span className="min-w-0 flex-1">
                      <span className="text-texto block truncate text-sm">{persona.full_name}</span>
                      {/* De dónde sale: traerla acá la saca de donde estaba, y eso hay que verlo
                          antes de apretar, no después. */}
                      <span className="text-texto-sutil block truncate text-xs">{desde}</span>
                    </span>

                    <Boton
                      variante="secundario"
                      tamano="chico"
                      cargando={moviendo === persona.id}
                      onClick={() => { void mover(persona, nodo.area.id) }}
                    >
                      Traer
                    </Boton>
                  </li>
                ))}
              </ul>
              )}
        </div>
      )}
    </aside>
  )
}
