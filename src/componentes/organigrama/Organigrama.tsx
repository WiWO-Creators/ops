'use client'

/**
 * El organigrama visual: UN solo componente, montado en `/equipo/mi-area` y en `/equipo/jerarquia`.
 *
 * Dos copias del mismo dibujo es la clase de duplicación que termina mostrando dos organigramas
 * distintos, así que acá no hay variantes por ruta: lo único que cambia entre las dos pantallas es
 * lo que la API manda, porque **la API ya recorta por quien pregunta**. La regla de visibilidad no
 * se repite en el frontend; repetirla sería una segunda copia que puede quedar desincronizada de la
 * que manda, y esconder o mostrar lo que no toca.
 *
 * Dos niveles, porque con 184 personas un solo árbol se estira hasta lo inservible: el mapa de áreas
 * y, al entrar en una tarjeta, su árbol. Volver al mapa no recarga nada: los datos ya están acá.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ArbolDelArea } from './ArbolDelArea'
import { ListaDePersonas } from './ListaDePersonas'
import { MapaDeAreas } from './MapaDeAreas'
import { PanelDePersona } from './PanelDePersona'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import {
  arbolDelArea, areasDelMapa, colorDeArea, cuantasCajas, cuantosSinArea, descendenciaDe,
  filasDeLista, personasDelArbol, resumirMapa
} from '@/dominio/organigrama'
import { guardarVista, leerVista, suscribirVista, vistaDelServidor } from '@/lib/vista-organigrama'
import type { OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import type { VistaDeOrganigrama } from '@/lib/vista-organigrama'
import type { CambioDeJefatura, Organigrama as DatosDeOrganigrama } from '@/datos/organigrama'

/**
 * Las dos caras de los mismos datos.
 *
 * Un control de dos opciones siempre a la vista y no un menú: son dos, se nombran en una palabra y
 * hay que poder ver cuál está puesta sin abrir nada.
 */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'organigrama', etiqueta: 'Organigrama', icono: 'organigrama' },
  { valor: 'lista', etiqueta: 'Lista', icono: 'tabla' }
]

/**
 * Qué se está mirando.
 *
 * `undefined` es el mapa; un número, el árbol de esa área; `null`, el árbol de quien no tiene área.
 * Tres estados y no dos booleanos porque "sin área" es un destino tan legítimo como cualquier área
 * —hoy son 31 personas— y con un booleano aparte habría dos caminos para dibujar lo mismo.
 */
type Vista = number | null | undefined

/**
 * Monta el organigrama a partir de lo que resolvió el servidor.
 *
 * @param inicial la respuesta de `GET /organigrama` para quien mira
 */
export function Organigrama ({ inicial }: { inicial: DatosDeOrganigrama }) {
  const [datos, setDatos] = useState(inicial)
  const [servido, setServido] = useState(inicial)
  const [vista, setVista] = useState<Vista>(undefined)
  const [elegida, setElegida] = useState<number | null>(null)
  const [arrastrada, setArrastrada] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  // El servidor vuelve a resolver la página en cada navegación y React conserva el estado del
  // componente: sin esto se quedaría con el árbol del primer montaje. Se ajusta DURANTE el render y
  // no en un efecto —que es lo que React recomienda para derivar de una prop— porque un efecto pinta
  // primero el árbol viejo y recién después el nuevo, y eso es un parpadeo visible.
  if (servido !== inicial) {
    setServido(inicial)
    setDatos(inicial)
  }

  const personasPorId = useMemo(
    () => new Map(datos.personas.map((persona) => [persona.staffid, persona])),
    [datos.personas]
  )
  const areas = useMemo(() => areasDelMapa(datos), [datos])
  const mias = useMemo(() => new Set(datos.yo.areas), [datos.yo.areas])
  const resumen = useMemo(() => resumirMapa(datos), [datos])

  const raices = useMemo(
    () => vista === undefined ? [] : arbolDelArea(datos.personas, vista),
    [datos.personas, vista]
  )

  // La lista es la otra lectura de LO MISMO: en el mapa, toda la gente visible; dentro de un área,
  // exactamente las personas que el árbol dibuja —enganches de otra área incluidos—, y no una
  // selección propia por `area_id`, que daría otra cuenta que la que se acaba de ver.
  const filas = useMemo(
    () => filasDeLista(
      vista === undefined ? datos.personas : personasDelArbol(raices), personasPorId, areas
    ),
    [datos.personas, raices, vista, personasPorId, areas]
  )

  // Quién no puede recibir a la que se arrastra: ella misma y toda su descendencia. Es lo mismo que
  // el panel saca del selector de jefes, por el mismo motivo: sería el ciclo que la API rechaza.
  const prohibidos = useMemo(() => {
    if (arrastrada === null) return new Set<number>()

    return new Set([arrastrada, ...descendenciaDe(datos.personas, arrastrada)])
  }, [arrastrada, datos.personas])

  const vigente = useRef(true)

  useEffect(() => () => { vigente.current = false }, [])

  // La preferencia no es estado de React sino de `localStorage`, así que se lee como lo que es: una
  // fuente externa. `useSyncExternalStore` es lo que deja hacerlo sin un efecto que llame a
  // `setState` —cascada de renders— y sin romper la hidratación: el servidor y el primer render del
  // cliente usan la vista por defecto, y recién después aparece la guardada.
  const modo = useSyncExternalStore(suscribirVista, leerVista, vistaDelServidor)

  /**
   * Cambia de vista y lo recuerda.
   *
   * Sólo escribe: el valor vuelve por la suscripción, que es lo que hace que dos pestañas abiertas
   * en el organigrama no terminen mostrando cosas distintas.
   */
  const elegirModo = useCallback((valor: string): void => {
    guardarVista(valor === 'lista' ? 'lista' : 'organigrama')
  }, [])

  /**
   * Escribe un cambio de una persona y deja el árbol como lo dejó la API.
   *
   * La caja se mueve antes de que conteste el servidor, porque esperar medio segundo con la caja
   * quieta se siente como que el arrastre no funcionó. Si la API rechaza —un ciclo responde 422— la
   * tarjeta vuelve a su lugar y se muestra **el mensaje que manda la API**, sin reescribirlo: es el
   * que sabe por qué no se pudo.
   *
   * Con el visto bueno se vuelve a pedir el organigrama entero, y no se parchea a mano: mover a
   * alguien cambia las cuentas de dos tarjetas del mapa, y recalcularlas en el navegador sería una
   * segunda copia de lo que cuenta la API.
   */
  const cambiar = useCallback(async (staffid: number, cambio: CambioDeJefatura): Promise<void> => {
    const antes = datos
    const persona = antes.personas.find((una) => una.staffid === staffid)

    if (persona === undefined || Object.keys(cambio).length === 0) return

    setGuardando(true)
    setError(null)
    setDatos({
      ...antes,
      personas: antes.personas.map((una) => una.staffid === staffid ? { ...una, ...cambio } : una)
    })

    const resultado = await escribirEnBff(`accesos/personas/${staffid}`, 'PUT', cambio)

    if (!vigente.current) return

    if (!resultado.ok) {
      setDatos(antes)
      setGuardando(false)
      setError(resultado.mensaje)
      setAviso(`No se pudo mover a ${persona.nombre}.`)

      return
    }

    try {
      const sobre = await pedirSobre<DatosDeOrganigrama>('organigrama', AbortSignal.timeout(15000))

      if (vigente.current) setDatos(sobre.data)
    } catch {
      // La escritura ya entró: quedarse con el árbol optimista es correcto, y avisar de un fallo de
      // lectura acá haría creer que el cambio no se guardó.
    }

    if (!vigente.current) return

    setGuardando(false)
    setElegida(null)
    setAviso(`${persona.nombre}: cambio guardado.`)
  }, [datos])

  const puedeEditar = datos.yo.puede_editar
  const persona = elegida === null ? undefined : personasPorId.get(elegida)

  /** Lo que se dibuja debajo de la cabecera, según dónde se está y con qué cara se mira. */
  let contenido

  if (vista !== undefined && raices.length === 0) {
    contenido = (
      <Vacio
        titulo="Todavía no hay nadie acá"
        descripcion={vista === null
          ? 'Toda la gente que ves tiene un área puesta.'
          : 'Nadie lleva esta área puesta. Asígnasela a alguien desde su panel.'}
      />
    )
  } else if (modo === 'lista') {
    contenido = (
      <ListaDePersonas
        // Cambiar de vista la remonta: sin esto, entrar en un área arrastraría el filtro escrito en
        // el mapa y la tabla aparecería vacía sin que nada explique por qué.
        key={String(vista)}
        filas={filas}
        elegida={elegida}
        editable={puedeEditar}
        onElegir={setElegida}
      />
    )
  } else if (vista === undefined) {
    contenido = (
      <MapaDeAreas
        areas={areas}
        mias={mias}
        sinArea={cuantosSinArea(datos)}
        resumen={resumen}
        personas={datos.personas}
        personasPorId={personasPorId}
        onEntrar={(areaId) => { setVista(areaId); setError(null) }}
      />
    )
  } else {
    contenido = (
      <ArbolDelArea
        raices={raices}
        elegida={elegida}
        editable={puedeEditar && !guardando}
        prohibidos={prohibidos}
        onElegir={setElegida}
        onSoltar={(quien, jefeId) => { void cambiar(quien, { jefe_staffid: jefeId }) }}
        onArrastrar={setArrastrada}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Una sola región para los dos avisos: los lectores de pantalla necesitan que exista vacía
          antes de tener texto, o el primer cambio no se anuncia. */}
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>

      <Cabecera
        area={vista === undefined
          ? undefined
          : {
              titulo: vista === null
                ? 'Sin área'
                : areas.find((una) => una.id === vista)?.nombre ?? 'Área',
              color: colorDeArea(vista),
              cajas: cuantasCajas(raices),
              onVolver: () => { setVista(undefined); setElegida(null); setError(null) }
            }}
        modo={modo}
        ayudaDeArrastre={vista !== undefined && modo === 'organigrama' && puedeEditar}
        onModo={elegirModo}
      />

      {/* El error vive acá arriba y no dentro del árbol: una reasignación se puede lanzar desde la
          lista del mapa, donde no hay árbol en pantalla que lo muestre. */}
      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {contenido}

      {persona !== undefined && (
        <PanelDePersona
          // Cambiar de persona reinicia el formulario por el remonte, sin un efecto que copie tres
          // campos del estado guardado al estado del panel.
          key={persona.staffid}
          persona={persona}
          personas={datos.personas}
          areas={areas}
          editable={puedeEditar}
          guardando={guardando}
          error={error}
          onCerrar={() => { setElegida(null); setError(null) }}
          onGuardar={(cambio) => { void cambiar(persona.staffid, cambio) }}
        />
      )}
    </div>
  )
}

/** Dónde se está parado, cuando no es el mapa. */
interface ContextoDeArea {
  titulo: string
  color: string
  cajas: number
  onVolver: () => void
}

/**
 * La cabecera del organigrama: de dónde se vino, qué se está mirando y con qué cara.
 *
 * **El conmutador va acá y en los dos niveles**, en el mismo sitio: quien prefiere la lista la
 * prefiere también dentro de un área, y un control que aparece y desaparece según la pantalla
 * obliga a buscarlo cada vez.
 *
 * La instrucción de arrastre sólo tiene sentido con el árbol delante, así que se muestra con él. Va
 * en el renglón y no en un tooltip porque es lo que se lee antes de intentar nada, y porque nombra
 * la otra vía —el clic— que es la que funciona con teclado y en un teléfono.
 */
function Cabecera (
  { area, modo, ayudaDeArrastre, onModo }: {
    area?: ContextoDeArea
    modo: VistaDeOrganigrama
    ayudaDeArrastre: boolean
    onModo: (valor: string) => void
  }
) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {area !== undefined && (
        <>
          <Boton variante="sutil" tamano="chico" onClick={area.onVolver}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Todas las áreas
          </Boton>

          <h2 className="font-titular text-texto flex min-w-0 items-center gap-2 text-[20px] font-semibold">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
            <span className="truncate">{area.titulo}</span>
          </h2>

          {/* Sólo con el árbol: la lista ya lleva su propia cuenta al lado del buscador, y dos
              números distintos de lo mismo en la misma barra es una pregunta que nadie quiere. */}
          {modo === 'organigrama' && (
            <Insignia tono="contorno" tamano="chico">
              {area.cajas} {area.cajas === 1 ? 'caja' : 'cajas'}
            </Insignia>
          )}
        </>
      )}

      <Segmentado
        etiqueta="Vista"
        opciones={VISTAS}
        activo={modo}
        onElegir={onModo}
        className="ms-auto"
      />

      {ayudaDeArrastre && (
        <p className="text-texto-sutil basis-full text-xs">
          Arrastra una caja sobre su nuevo jefe, o suéltala en el fondo para desengancharla.
          Haz clic en cualquiera para elegir jefe, escalón y área de una lista.
        </p>
      )}
    </header>
  )
}
