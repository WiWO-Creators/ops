'use client'

/**
 * Poblar un área: elegir varias personas de una vez y moverlas a ella.
 *
 * === Por qué de a varias y no de a una ===
 *
 * Porque el estado real de la casa son catorce áreas en cero y treinta y una personas sueltas.
 * Colocarlas con el panel de la ficha —abrir una caja, elegir el área, guardar, cerrar— son cuatro
 * pasos por persona y ciento veinte para terminar. El panel de la ficha sigue siendo el camino para
 * corregir a UNA persona, que es otra tarea; este diálogo es el de llenar un área.
 *
 * === Por qué se ve el área actual de cada persona ===
 *
 * Porque mover a alguien a un área **la saca de la suya**: no hay dos áreas por persona. Sin esa
 * columna, poblar un área nueva vacía las otras sin que nadie lo vea hasta después, y lo que parecía
 * sumar gente en realidad la movió.
 *
 * === Por qué la escritura es una por persona ===
 *
 * Porque la API escribe una persona por petición (`PUT /accesos/personas/{id}`) y no hay ruta masiva.
 * Se mandan en serie y se cuenta lo que entró: si la quinta falla, las cuatro anteriores ya están
 * guardadas y decirlo es más honesto que un "no se pudo" que haría creer que no se guardó ninguna.
 */
import { useMemo, useState } from 'react'
import { Check, Search, UserRoundPlus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { candidatasParaArea, colorDeArea, nombreDeArea } from '@/dominio/organigrama'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { cn } from '@/lib/clases'
import type { PersonaElegible } from '@/dominio/organigrama'
import type { Escalon } from '@/dominio/escalon'
import type { AreaDelOrganigrama } from '@/datos/organigrama'

/**
 * Una candidata tal como la dibuja este diálogo.
 *
 * Se declara acá y no se importa `PersonaDelOrganigrama` porque el diálogo se monta también desde
 * Accesos, cuya gente viaja en otro tipo con los mismos campos. `avatar` es opcional justamente
 * porque ese otro tipo no lo trae: sin foto se dibujan las iniciales, que es lo que hace `Avatar`.
 */
export interface Candidata extends PersonaElegible {
  escalon?: Escalon
  /** Ausente se trata como alguien de alta: sólo se apaga la fila de quien se sabe dada de baja. */
  activo?: boolean
  avatar?: string | null
}

interface PropsAgregar {
  /** El área que se está poblando. `null` es el grupo "Sin área": mover ahí desengancha el área. */
  areaId: number | null
  /** El catálogo entero, para nombrar el área de destino y la de cada candidata. */
  areas: AreaDelOrganigrama[]
  personas: Candidata[]
  abierto: boolean
  /** `true` mientras una escritura anterior sigue en curso. */
  guardando: boolean
  onCerrar: () => void
  /**
   * Mueve a esta gente al área.
   *
   * @param staffids las personas elegidas
   * @returns cuántas entraron y el motivo del primer fallo, si lo hubo
   */
  onAgregar: (staffids: number[]) => Promise<{ guardadas: number, error: string | null }>
}

/**
 * Dibuja el diálogo con su buscador y su lista.
 *
 * @param props el área de destino y la gente entre la que elegir
 */
export function AgregarAlArea (
  { areaId, areas, personas, abierto, guardando, onCerrar, onAgregar }: PropsAgregar
) {
  const [consulta, setConsulta] = useState('')
  const [elegidas, setElegidas] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const candidatas = useMemo(
    () => candidatasParaArea(personas, areaId, consulta),
    [personas, areaId, consulta]
  )

  const destino = nombreDeArea(areas, areaId)

  /** Marca o desmarca a una persona. */
  function alternar (staffid: number): void {
    const siguiente = new Set(elegidas)

    if (siguiente.has(staffid)) siguiente.delete(staffid)
    else siguiente.add(staffid)

    setElegidas(siguiente)
  }

  /** Cierra y deja el diálogo limpio: reabrirlo con la selección anterior movería a quien no toca. */
  function cerrar (): void {
    setConsulta('')
    setElegidas(new Set())
    setError(null)
    onCerrar()
  }

  /** Manda los cambios y cierra sólo si entraron todos. */
  async function agregar (): Promise<void> {
    if (elegidas.size === 0 || guardando) return

    setError(null)

    const resultado = await onAgregar([...elegidas])

    if (resultado.error === null) {
      cerrar()

      return
    }

    // Lo que ya entró se saca de la selección: reintentar no tiene que volver a mandar lo guardado.
    setError(
      resultado.guardadas === 0
        ? resultado.error
        : `Se agregaron ${resultado.guardadas} de ${elegidas.size}. La siguiente falló: ${resultado.error}`
    )
  }

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => { if (!valor) cerrar() }}>
      <ContenidoDialogo
        cerrable
        ancho="grande"
        titulo={`Agregar gente a ${destino}`}
        descripcion={
          areaId === null
            ? 'Quien elijas deja de tener área. Su jefe y su escalón no cambian.'
            : `Quien elijas pasa a ${destino} y deja el área que tuviera. Su jefe y su escalón no cambian.`
        }
      >
        <div className="mt-4 flex flex-col gap-3">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-texto-sutil pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            />
            <Entrada
              autoFocus
              type="search"
              value={consulta}
              aria-label="Buscar una persona por nombre o correo"
              placeholder="Busca por nombre o correo…"
              className="ps-9"
              onChange={(evento) => setConsulta(evento.target.value)}
            />
          </div>

          {candidatas.length === 0
            ? (
              <p className="text-texto-tenue py-6 text-center text-sm">
                {consulta === ''
                  ? 'Toda la gente que ves ya está en esta área.'
                  : 'Nadie coincide con lo que buscas.'}
              </p>
              )
            : (
              <ul className="border-linea rounded-tarjeta max-h-80 overflow-y-auto border">
                {candidatas.map((persona) => (
                  <li key={persona.staffid} className="border-linea border-b last:border-b-0">
                    <FilaCandidata
                      persona={persona}
                      areas={areas}
                      elegida={elegidas.has(persona.staffid)}
                      onAlternar={() => { alternar(persona.staffid) }}
                    />
                  </li>
                ))}
              </ul>
              )}

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <footer className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-texto-tenue text-xs tabular-nums" role="status" aria-live="polite">
              {elegidas.size === 0
                ? `${candidatas.length} ${candidatas.length === 1 ? 'persona' : 'personas'} para elegir`
                : `${elegidas.size} ${elegidas.size === 1 ? 'elegida' : 'elegidas'}`}
            </p>

            <div className="flex items-center gap-2">
              <CerrarDialogo asChild>
                <Boton variante="sutil" disabled={guardando}>Cancelar</Boton>
              </CerrarDialogo>
              <Boton
                variante="primario"
                cargando={guardando}
                disabled={elegidas.size === 0}
                onClick={() => { void agregar() }}
              >
                <UserRoundPlus size={16} aria-hidden="true" />
                {elegidas.size <= 1 ? 'Agregar al área' : `Agregar ${elegidas.size} personas`}
              </Boton>
            </div>
          </footer>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Una candidata: su cara, su nombre, su escalón y de qué área sale.
 *
 * La fila entera es el control —un `button` de verdad, no una `div` con `onClick`— y la casilla que
 * se ve es un dibujo: una casilla real adentro del botón sería un segundo control para lo mismo, y
 * con el teclado habría que pasar dos veces por cada persona.
 */
function FilaCandidata (
  { persona, areas, elegida, onAlternar }: {
    persona: Candidata
    areas: AreaDelOrganigrama[]
    elegida: boolean
    onAlternar: () => void
  }
) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={elegida}
      onClick={onAlternar}
      className={cn(
        'ease-neo duration-rapida flex w-full items-center gap-3 px-3 py-2 text-start',
        'transition-colors hover:bg-hover',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2',
        elegida && 'bg-seleccionado',
        persona.activo === false && 'opacity-60'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
          elegida ? 'bg-acento border-acento text-acento-contenido' : 'border-linea-fuerte'
        )}
      >
        {elegida && <Check className="size-3" strokeWidth={3} />}
      </span>

      <Avatar nombre={persona.nombre} imagen={persona.avatar ?? null} tamano="chico" />

      <span className="flex min-w-0 flex-col">
        <span className="text-texto truncate text-[13px] leading-tight font-semibold">
          {persona.nombre}
        </span>
        {persona.correo !== undefined && (
          <span className="text-texto-sutil truncate text-xs">{persona.correo}</span>
        )}
      </span>

      <span className="text-texto-tenue ms-auto flex shrink-0 items-center gap-2 text-xs">
        {persona.escalon !== undefined && (
          <span className="hidden sm:inline">{etiquetaDeEscalon(persona.escalon)}</span>
        )}

        {persona.area_id === null
          ? <Insignia tono="contorno" tamano="chico">Sin área</Insignia>
          : (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colorDeArea(persona.area_id) }}
              />
              {nombreDeArea(areas, persona.area_id)}
            </span>
            )}
      </span>
    </button>
  )
}
