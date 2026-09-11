'use client'

import { useRef, useState } from 'react'
import { Square, Timer } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { avisarCambioDeMedidor } from './medidor'
import { haceCuanto } from '@/componentes/auditoria/presentacion'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import { cargoYArea, trabajoDeLaFila } from './presentacion'
import { cn } from '@/lib/clases'
import type { FilaDeLive } from '@/datos/live'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Una persona del tablero, con lo que esta trabajando colgando de ella.
 *
 * === POR QUE LA PERSONA ES LA RAIZ ===
 *
 * La tarjeta se lee de arriba abajo en cuatro escalones: **quien** (nombre y cargo), **en que**
 * (el Espacio), **que exactamente** (la Tarea) y **cuanto** (el medidor y la jornada). Antes los dos
 * del medio compartian una sola linea —`task?.name ?? project?.name`— y esa linea mentia por
 * omision: no se podia distinguir a quien mide una Tarea dentro de un Proyecto de quien mide el
 * Proyecto entero sin haber elegido ninguna. Los dos casos se veian igual, y el segundo es
 * justamente el que hay que corregir.
 *
 * Los nombres de los dos niveles salen del glosario, en `trabajoDeLaFila()`. Aca no se escribe
 * "Proyecto" ni "Tarea" a mano.
 *
 * No dice en que pantalla esta la persona ni por donde navega — eso es `/auditoria`, y es otra
 * pregunta.
 *
 * `transcurrido` llega por prop y no se calcula aca: el tic de un segundo es UNO, del panel, y no
 * cincuenta intervalos independientes que despierten la pestaña cincuenta veces por segundo.
 *
 * === POR QUE EL NOMBRE ES UN `h3` Y NO UN `h1` (RQ-JOR-16) ===
 *
 * El requerimiento pide que el nombre se lea como un H1: que sea lo primero que se ve de la fila y
 * que domine sobre el cargo, el Proyecto, la Tarea y los tiempos. Eso es peso VISUAL, y es lo que
 * se hizo — el nombre subio a `text-base sm:text-lg`, por encima del `text-sm` de los niveles de
 * abajo y del `text-xs` del cargo.
 *
 * Lo que no se hizo es cambiar la etiqueta a `<h1>`, porque romperia la pagina:
 *
 *   - `/live` ya tiene su unico `h1` —"En vivo"—, que lo pone `<TituloModulo>`.
 *   - `<PanelEquipo>` cuelga de el con un `h2` ("El equipo, ahora").
 *   - Esta fila es un `<li>` DENTRO de ese `h2`, y hay una por persona.
 *
 * O sea que un `<h1>` aca no seria uno: serian tantos como personas en el tablero, todos al mismo
 * nivel que el titulo de la pantalla. Un lector de pantalla que navega por encabezados —la forma
 * normal de recorrer una pagina sin verla— pasaria de "En vivo" a treinta "En vivo" mas, sin
 * ninguna pista de que son las filas de una lista. El `h3` es el nivel correcto bajo ese `h2`, y
 * saltarse niveles tambien es un fallo de WCAG (1.3.1, Info y relaciones).
 *
 * La jerarquia que pedia el requerimiento —persona → Proyecto → Tarea → tiempo— se ve igual; lo que
 * no se hace es mentirle al arbol del documento para conseguirla.
 */
export function FilaEnVivo ({ fila, transcurrido, puedeDetener, estados = [] }: {
  fila: FilaDeLive
  transcurrido: number
  puedeDetener: boolean
  /**
   * `task_statuses` de `GET /lookups`, para decir en que estado esta la Tarea que se mide.
   *
   * Vacio —el valor por defecto— no pinta la insignia: sin catalogo no hay con que traducir el id, y
   * de eso se encarga `<EstadoDeTarea>`.
   */
  estados?: OpcionFiltro[]
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [detenido, setDetenido] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enviando = useRef(false)
  const { staff, jornada, medidor, presencia } = fila
  const trabajo = trabajoDeLaFila(fila)
  const titulo = cargoYArea(staff)

  /** Cierra este cronómetro por ID y avisa a los controles para que consulten el estado actualizado. */
  async function detener (): Promise<void> {
    if (medidor === null || enviando.current) return

    enviando.current = true
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`live/timers/${medidor.id}`, 'DELETE')
    enviando.current = false
    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setDetenido(true)
    setConfirmando(false)
    avisarCambioDeMedidor()
  }

  return (
    <li
      className={cn(
        'rounded-tarjeta flex flex-col gap-3 border p-3',
        // Quien mide es la fila que se vino a mirar: se despega del lienzo. El resto se hunde, que es
        // el mismo escalon que ya separa una tarjeta de su fondo en el resto del panel.
        medidor !== null && !detenido
          ? 'border-acento-suave bg-superficie-elevada'
          : 'border-linea bg-superficie-hundida'
      )}
    >
      {/* Nivel 1: la persona y su titulo. Nivel 4 a la derecha: los dos tiempos. */}
      <div className="flex items-start gap-3">
        <Avatar nombre={staff.name} imagen={staff.avatar} tamano="grande" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* RQ-JOR-16: el nombre manda visualmente, pero sigue siendo un `h3`. Ver el docblock. */}
          <h3 className="text-texto text-base leading-tight font-semibold break-words sm:text-lg [overflow-wrap:anywhere]">
            {staff.name}
          </h3>
          {titulo !== null && (
            <p className="text-texto-sutil truncate text-xs" title={titulo}>{titulo}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          {medidor !== null && (
            <span
              data-numerico
              className="text-texto flex items-center gap-1.5 font-mono text-sm font-semibold"
            >
              <Timer size={14} strokeWidth={2} aria-hidden="true" className="text-acento" />
              {detenido ? 'Detenido' : formatearDuracion(medidor.seconds + transcurrido)}
            </span>
          )}

          {/* La jornada es el encuadre del medidor, asi que acompaña siempre: un medidor de diez
              minutos dentro de una jornada de ocho horas no dice lo mismo que dentro de una de diez. */}
          <span data-numerico className="text-texto-sutil text-xs">
            {jornada === null
              ? 'Sin jornada'
              : `Jornada ${formatearDuracion(jornada.seconds + transcurrido)}`}
          </span>
        </div>
      </div>

      {/* Niveles 2 y 3: en que esta trabajando. Cuelgan de la persona —de ahi la sangria y la linea
          de la izquierda— y en movil arrancan al borde, donde 52px de sangria serian una columna
          entera del ancho de pantalla. */}
      {trabajo.midiendo
        ? (
          <dl className="border-linea-suave flex flex-col gap-1.5 border-l-2 pl-3 sm:ml-[3.25rem]">
            {trabajo.niveles.map((nivel) => (
              <div key={nivel.etiqueta} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <dt className="text-texto-sutil w-20 shrink-0 text-xs font-medium tracking-[0.08em] uppercase">
                  {nivel.etiqueta}
                </dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
                  {nivel.pendiente
                    ? <Insignia tono={nivel.tono} tamano="chico">{nivel.valor}</Insignia>
                    : (
                      <span className="text-texto text-sm font-medium break-words [overflow-wrap:anywhere]">
                        {nivel.valor}
                      </span>
                      )}

                  {/* El estado va pegado al nombre de la Tarea y no en un nivel propio: es un rasgo
                      de ese nivel, no un cuarto escalon de la lectura.

                      Se exige el `status` presente y no solo la Tarea: la API lo manda desde
                      `RecursoJornadas::medidoresCorriendo()`, pero contra un backend anterior llega
                      `undefined`, y ahi "Sin estado" en cada fila mentiria sobre un dato que nadie
                      dejo vacio. Tambien llega `null` cuando la Tarea esta en la papelera. */}
                  {nivel.etiqueta === GLOSARIO.proceso.singular
                    && medidor?.task?.status !== undefined && medidor.task.status !== null && (
                    <EstadoDeTarea status={medidor.task.status} catalogo={estados} />
                  )}
                </dd>
              </div>
            ))}
          </dl>
          )
        : (
          <p className="text-texto-tenue border-linea-suave border-l-2 pl-3 text-sm sm:ml-[3.25rem]">
            {trabajo.motivo}
          </p>
          )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Los segundos de antigüedad los calcula el servidor: ver `haceCuanto()`. */}
        <span className="text-texto-sutil text-xs">
          {presencia === null ? 'Sin señales' : haceCuanto(presencia.seconds_ago)}
        </span>

        {medidor !== null && puedeDetener && !detenido && !confirmando && (
          <Boton
            tamano="chico"
            variante="sutil"
            className="min-h-11 shrink-0"
            aria-label={`Detener cronómetro de ${staff.name}`}
            onClick={() => { setConfirmando(true) }}
          >
            <Square size={14} aria-hidden="true" />
            Detener
          </Boton>
        )}
      </div>

      {confirmando && (
        <div className="border-linea-suave flex flex-wrap items-center gap-2 border-t pt-3">
          <p className="text-texto-tenue basis-full text-sm text-pretty">
            ¿Detener el cronómetro de {staff.name}? Se guardará el tiempo hasta ahora. La jornada seguirá abierta.
          </p>
          <Boton tamano="chico" className="min-h-11" cargando={enCurso} onClick={() => { void detener() }}>
            Confirmar detención
          </Boton>
          <Boton tamano="chico" className="min-h-11" variante="sutil" disabled={enCurso} onClick={() => { setConfirmando(false); setError(null) }}>
            Cancelar
          </Boton>
          {error !== null && <p role="alert" className="text-texto-peligro basis-full text-sm">{error}</p>}
        </div>
      )}
    </li>
  )
}
