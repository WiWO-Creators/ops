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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ArbolDelArea } from './ArbolDelArea'
import { MapaDeAreas } from './MapaDeAreas'
import { PanelDePersona } from './PanelDePersona'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import {
  arbolDelArea, areasDelMapa, colorDeArea, cuantasCajas, cuantosSinArea, descendenciaDe
} from '@/dominio/organigrama'
import type { CambioDeJefatura, Organigrama as DatosDeOrganigrama } from '@/datos/organigrama'

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

  const raices = useMemo(
    () => vista === undefined ? [] : arbolDelArea(datos.personas, vista),
    [datos.personas, vista]
  )

  // Quién no puede recibir a la que se arrastra: ella misma y toda su descendencia. Es lo mismo que
  // el panel saca del selector de jefes, por el mismo motivo: sería el ciclo que la API rechaza.
  const prohibidos = useMemo(() => {
    if (arrastrada === null) return new Set<number>()

    return new Set([arrastrada, ...descendenciaDe(datos.personas, arrastrada)])
  }, [arrastrada, datos.personas])

  const vigente = useRef(true)

  useEffect(() => () => { vigente.current = false }, [])

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

  return (
    <div className="flex flex-col gap-4">
      {/* Una sola región para los dos avisos: los lectores de pantalla necesitan que exista vacía
          antes de tener texto, o el primer cambio no se anuncia. */}
      <p role="status" aria-live="polite" className="sr-only">{aviso}</p>

      {vista === undefined
        ? (
          <MapaDeAreas
            areas={areas}
            mias={mias}
            sinArea={cuantosSinArea(datos)}
            personasPorId={personasPorId}
            onEntrar={(areaId) => { setVista(areaId); setError(null) }}
          />
          )
        : (
          <>
            <BarraDelArea
              titulo={vista === null ? 'Sin área' : areas.find((una) => una.id === vista)?.nombre ?? 'Área'}
              color={colorDeArea(vista)}
              cajas={cuantasCajas(raices)}
              puedeEditar={puedeEditar}
              onVolver={() => { setVista(undefined); setElegida(null); setError(null) }}
            />

            {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

            {raices.length === 0
              ? (
                <Vacio
                  titulo="Todavía no hay nadie acá"
                  descripcion={vista === null
                    ? 'Toda la gente que ves tiene un área puesta.'
                    : 'Nadie lleva esta área puesta. Asignásela a alguien desde su panel.'}
                />
                )
              : (
                <ArbolDelArea
                  raices={raices}
                  elegida={elegida}
                  editable={puedeEditar && !guardando}
                  prohibidos={prohibidos}
                  onElegir={setElegida}
                  onSoltar={(quien, jefeId) => { void cambiar(quien, { jefe_staffid: jefeId }) }}
                  onArrastrar={setArrastrada}
                />
                )}
          </>
          )}

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

/**
 * La cabecera del árbol: de dónde se vino, qué área es y cómo se mueve la gente.
 *
 * La instrucción de arrastre va acá y no en un tooltip porque es lo que se lee antes de intentar
 * nada, y porque nombra en el mismo renglón la otra vía: el clic, que es la que funciona con teclado
 * y en un teléfono.
 */
function BarraDelArea (
  { titulo, color, cajas, puedeEditar, onVolver }: {
    titulo: string
    color: string
    cajas: number
    puedeEditar: boolean
    onVolver: () => void
  }
) {
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Boton variante="sutil" tamano="chico" onClick={onVolver}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Todas las áreas
      </Boton>

      <h2 className="font-titular text-texto flex min-w-0 items-center gap-2 text-[20px] font-semibold">
        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{titulo}</span>
      </h2>

      <Insignia tono="contorno" tamano="chico">{cajas} {cajas === 1 ? 'caja' : 'cajas'}</Insignia>

      {puedeEditar && (
        <p className="text-texto-sutil basis-full text-xs sm:basis-auto sm:ms-auto sm:text-end">
          Arrastra una caja sobre su nuevo jefe, o suéltala en el fondo para desengancharla.
          Hacé clic en cualquiera para elegir jefe, escalón y área de una lista.
        </p>
      )}
    </header>
  )
}
