/**
 * El primer nivel del organigrama: una tarjeta por área, y la de "Sin área".
 *
 * Existe porque con 184 personas un solo árbol se estira hasta lo inservible. Acá entra todo de un
 * vistazo —quién dirige cada área, cuánta gente lleva y cuántos leads— y el árbol se dibuja recién
 * al entrar en una.
 *
 * La tarjeta lleva arriba la barra del color del área, el mismo que después tendrá el borde de cada
 * caja de su gente en el árbol. Es la única pieza de color de la pantalla y hace un trabajo concreto:
 * reconocer un área sin leer, y ver de un golpe cuando una caja del árbol pertenece a otra.
 */
import { UserRound, UsersRound } from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { colorDeArea } from '@/dominio/organigrama'
import { cn } from '@/lib/clases'
import type { AreaDelOrganigrama, PersonaDelOrganigrama } from '@/datos/organigrama'

interface PropsMapa {
  areas: AreaDelOrganigrama[]
  /** Las áreas que lleva puesta quien mira: van primero y se marcan. */
  mias: Set<number>
  /** Cuánta gente visible quedó sin área. La tarjeta se muestra aunque sea cero. */
  sinArea: number
  /** Nombre de cada jefatura, ya resuelto por el componente padre. */
  personasPorId: Map<number, PersonaDelOrganigrama>
  onEntrar: (areaId: number | null) => void
}

/**
 * Dibuja el mapa completo.
 *
 * @param props las áreas ya ordenadas y lo necesario para pintar cada tarjeta
 */
export function MapaDeAreas ({ areas, mias, sinArea, personasPorId, onEntrar }: PropsMapa) {
  return (
    // `role="list"` no es redundante: `display: grid` le saca a un `<ul>` la semántica de lista en
    // Chromium y en Safari, y sin ella un lector de pantalla deja de anunciar cuántas áreas hay —que
    // es justo lo primero que necesita quien no ve el mapa.
    <ul
      role="list"
      aria-label="Áreas del equipo"
      className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
    >
      {areas.map((area) => (
        <li key={area.id}>
          <TarjetaDeArea
            area={area}
            propia={mias.has(area.id)}
            jefatura={area.jefe_staffid === null ? null : personasPorId.get(area.jefe_staffid) ?? null}
            onEntrar={() => onEntrar(area.id)}
          />
        </li>
      ))}

      <li>
        <TarjetaSinArea cuantos={sinArea} onEntrar={() => onEntrar(null)} />
      </li>
    </ul>
  )
}

/** Clases compartidas por las dos tarjetas, para que se comporten igual al pasar y al enfocar. */
const CAJA = 'group relative flex w-full flex-col gap-3 overflow-hidden rounded-tarjeta border p-4 ' +
  'text-left transition-colors duration-rapida ease-neo hover:bg-hover ' +
  'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'

/** Una tarjeta de área: su color, su jefatura y sus dos cuentas. */
function TarjetaDeArea (
  { area, propia, jefatura, onEntrar }: {
    area: AreaDelOrganigrama
    propia: boolean
    jefatura: PersonaDelOrganigrama | null
    onEntrar: () => void
  }
) {
  return (
    <button
      type="button"
      onClick={onEntrar}
      className={cn(CAJA, 'border-linea bg-superficie-elevada shadow-1')}
    >
      {/* La firma del área. `aria-hidden` porque el color no dice nada que el nombre no diga. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: colorDeArea(area.id) }}
      />

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-titular text-texto truncate text-[16px] leading-tight font-semibold">
            {area.nombre}
          </h3>
          <p className="text-texto-tenue mt-1 truncate text-xs">
            {jefatura === null ? 'Sin jefatura' : `Dirige ${jefatura.nombre}`}
          </p>
        </div>

        {propia && <Insignia tono="acento" tamano="chico">Mi área</Insignia>}
      </header>

      <footer className="flex items-end justify-between gap-3">
        <Cuenta valor={area.personas} etiqueta={area.personas === 1 ? 'persona' : 'personas'} />

        <span className="text-texto-tenue flex items-center gap-1.5 pb-1 text-xs tabular-nums">
          <UsersRound aria-hidden="true" className="size-3.5" />
          {area.leads} {area.leads === 1 ? 'lead' : 'leads'}
        </span>
      </footer>
    </button>
  )
}

/**
 * La tarjeta de quien no tiene área.
 *
 * No se esconde ni cuando está en cero: hoy son 31 personas y esconderlas sería esconder el
 * problema. Va con borde punteado y sin color porque la ausencia de área tiene que verse como una
 * ausencia, no como un área más.
 */
function TarjetaSinArea ({ cuantos, onEntrar }: { cuantos: number, onEntrar: () => void }) {
  return (
    <button
      type="button"
      onClick={onEntrar}
      className={cn(CAJA, 'border-linea-fuerte bg-superficie-hundida border-dashed')}
    >
      <header className="flex items-start gap-2">
        <UserRound aria-hidden="true" className="text-texto-sutil mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-titular text-texto truncate text-[16px] leading-tight font-semibold">
            Sin área
          </h3>
          <p className="text-texto-tenue mt-1 text-xs">Gente que todavía no lleva ninguna puesta</p>
        </div>
      </header>

      <footer className="flex items-end justify-between gap-3">
        <Cuenta valor={cuantos} etiqueta={cuantos === 1 ? 'persona' : 'personas'} />
      </footer>
    </button>
  )
}

/** Una cuenta con su etiqueta debajo: el número manda, la palabra explica. */
function Cuenta ({ valor, etiqueta }: { valor: number, etiqueta: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-texto text-[28px] leading-none font-semibold tabular-nums">{valor}</span>
      <span className="text-texto-sutil mt-1 text-xs">{etiqueta}</span>
    </span>
  )
}
