'use client'

/**
 * El primer nivel del organigrama: una tarjeta por área, y la de "Sin área".
 *
 * Existe porque con 184 personas un solo árbol se estira hasta lo inservible. Acá entra todo de un
 * vistazo —quién dirige cada área, cuánta gente lleva y cuántos leads— y el árbol se dibuja recién
 * al entrar en una.
 *
 * === Por qué las áreas vacías van aparte y no mezcladas ===
 *
 * Porque hoy son catorce de quince. Mezcladas en la misma grilla, cada una gasta el mismo espacio y
 * el mismo peso tipográfico que la única que tiene equipo, y encontrar dónde está la gente obliga a
 * leer quince tarjetas iguales. Un área vacía no es una advertencia ni un error —una casa nueva las
 * tiene todas así— pero tampoco es por donde se entra: quedan juntas al final, compactas, y se
 * pueden plegar cuando estorban.
 *
 * === Por qué las caras y no un número más grande ===
 *
 * Porque "14" y "0" en cifras de 28px se distinguen por una forma, y catorce caras contra una
 * tarjeta vacía se distinguen sin leer. Las caras además contestan la otra mitad de la pregunta —con
 * quién hablar— antes de entrar en el área.
 *
 * El punto de color es el mismo que después lleva el borde de cada caja de su gente en el árbol y el
 * de su fila en la lista. Es la única pieza de color de la pantalla y hace un trabajo concreto:
 * reconocer un área sin leer, y ver de un golpe cuando una caja del árbol pertenece a otra.
 */
import { useState } from 'react'
import { ChevronDown, UserRound, UserRoundPlus, UsersRound } from 'lucide-react'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { colorDeArea, partirAreasPorPoblacion, personasDelArea } from '@/dominio/organigrama'
import { cn } from '@/lib/clases'
import type { ResumenDelMapa } from '@/dominio/organigrama'
import type { AreaDelOrganigrama, PersonaDelOrganigrama } from '@/datos/organigrama'

interface PropsMapa {
  areas: AreaDelOrganigrama[]
  /** Las áreas que lleva puesta quien mira: se marcan con su insignia. */
  mias: Set<number>
  /** Cuánta gente visible quedó sin área. La tarjeta se muestra aunque sea cero. */
  sinArea: number
  /** Los totales de la cabecera, ya contados. */
  resumen: ResumenDelMapa
  /** Todas las personas visibles, para sacar las caras de cada área. */
  personas: PersonaDelOrganigrama[]
  /** Nombre de cada jefatura, ya resuelto por el componente padre. */
  personasPorId: Map<number, PersonaDelOrganigrama>
  /** Si quien mira puede mover gente. Apagado, las tarjetas no ofrecen sumar a nadie. */
  puedeEditar: boolean
  onEntrar: (areaId: number | null) => void
  /** Abre el diálogo para sumar gente a esa área. */
  onPoblar: (areaId: number | null) => void
}

/**
 * Dibuja el mapa completo: la cabecera, las áreas con gente y el bloque de las vacías.
 *
 * @param props las áreas ya ordenadas y lo necesario para pintar cada tarjeta
 */
export function MapaDeAreas (
  { areas, mias, sinArea, resumen, personas, personasPorId, puedeEditar, onEntrar, onPoblar }: PropsMapa
) {
  const { pobladas, vacias } = partirAreasPorPoblacion(areas)

  return (
    <div className="flex flex-col gap-4">
      <ResumenDelEquipo resumen={resumen} />

      {/* `role="list"` no es redundante: `display: grid` le saca a un `<ul>` la semántica de lista en
          Chromium y en Safari, y sin ella un lector de pantalla deja de anunciar cuántas áreas hay
          —que es justo lo primero que necesita quien no ve el mapa. */}
      <ul
        role="list"
        aria-label="Áreas con gente"
        className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
      >
        {pobladas.map((area) => (
          <li key={area.id}>
            <TarjetaDeArea
              area={area}
              propia={mias.has(area.id)}
              jefatura={area.jefe_staffid === null ? null : personasPorId.get(area.jefe_staffid) ?? null}
              gente={personasDelArea(personas, area.id)}
              onEntrar={() => onEntrar(area.id)}
              onPoblar={puedeEditar ? () => onPoblar(area.id) : undefined}
            />
          </li>
        ))}

        {sinArea > 0 && (
          <li>
            <TarjetaSinArea cuantos={sinArea} onEntrar={() => onEntrar(null)} />
          </li>
        )}
      </ul>

      {vacias.length > 0 && (
        <AreasVacias
          areas={vacias}
          mias={mias}
          onEntrar={onEntrar}
          onPoblar={puedeEditar ? onPoblar : undefined}
        />
      )}

      {sinArea === 0 && (
        <p className="text-texto-sutil text-xs">
          Toda la gente que ves lleva un área puesta.
        </p>
      )}
    </div>
  )
}

/**
 * Los totales de la casa, en una línea.
 *
 * Va en texto corrido y no en cuatro tarjetas con números grandes: son cuatro cifras de contexto que
 * se leen una vez al entrar, no el contenido de la pantalla. Cuatro cajas les darían el peso de lo
 * que sí hay que mirar, que son las áreas de abajo.
 *
 * Lo que falta —gente sin área, áreas sin jefatura— se dice sólo cuando existe, y en tono de aviso:
 * un "0 sin jefatura" repetido todos los días es ruido, y un "3 sin jefatura" escondido entre
 * números normales no se ve.
 */
function ResumenDelEquipo ({ resumen }: { resumen: ResumenDelMapa }) {
  return (
    <p className="text-texto-tenue flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-texto font-semibold tabular-nums">{resumen.personas}</span>
      {resumen.personas === 1 ? 'persona' : 'personas'}

      <span aria-hidden="true" className="text-texto-sutil">·</span>

      <span className="text-texto font-semibold tabular-nums">{resumen.areasConGente}</span>
      {resumen.areasConGente === 1 ? 'área con gente' : 'áreas con gente'}

      {resumen.areasVacias > 0 && (
        <>
          <span aria-hidden="true" className="text-texto-sutil">·</span>
          <span className="tabular-nums">{resumen.areasVacias} sin nadie todavía</span>
        </>
      )}

      {resumen.sinJefatura > 0 && (
        <Insignia tono="aviso" tamano="chico">
          {resumen.sinJefatura} {resumen.sinJefatura === 1 ? 'área sin jefatura' : 'áreas sin jefatura'}
        </Insignia>
      )}

      {resumen.sinArea > 0 && (
        <Insignia tono="contorno" tamano="chico">
          {resumen.sinArea} sin área
        </Insignia>
      )}
    </p>
  )
}

/**
 * Clases compartidas por las tarjetas.
 *
 * La tarjeta NO es un botón: lleva dos controles —entrar en el área y sumarle gente— y un botón
 * dentro de otro botón no es HTML válido ni lo sabe manejar ningún lector de pantalla. El que entra
 * se estira por encima de toda la caja (`AREA_ENTERA`) y el de agregar se dibuja arriba de él; lo
 * demás es texto, que es lo que en realidad era.
 */
const CAJA = 'group relative flex w-full flex-col gap-3 overflow-hidden rounded-tarjeta border p-4 ' +
  'text-left transition-colors duration-rapida ease-neo hover:bg-hover ' +
  'has-[a:focus-visible]:outline-foco has-[button:focus-visible]:outline-foco ' +
  'has-[button:focus-visible]:outline-2 has-[button:focus-visible]:outline-offset-2'

/** El botón invisible que hace clicable la tarjeta entera. */
const AREA_ENTERA = 'absolute inset-0 z-0 cursor-pointer'

/** Una tarjeta de área con gente: su color, su jefatura, sus caras y sus dos cuentas. */
function TarjetaDeArea (
  { area, propia, jefatura, gente, onEntrar, onPoblar }: {
    area: AreaDelOrganigrama
    propia: boolean
    jefatura: PersonaDelOrganigrama | null
    gente: PersonaDelOrganigrama[]
    onEntrar: () => void
    onPoblar?: () => void
  }
) {
  return (
    <div className={cn(CAJA, 'border-linea bg-superficie-elevada shadow-1')}>
      <button type="button" onClick={onEntrar} className={AREA_ENTERA}>
        <span className="sr-only">Entrar en {area.nombre}</span>
      </button>

      <header className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* La firma del área. `aria-hidden` porque el color no dice nada que el nombre no diga. */}
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: colorDeArea(area.id) }}
          />
          <h3 className="font-titular text-texto truncate text-[16px] leading-tight font-semibold">
            {area.nombre}
          </h3>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          {propia && <Insignia tono="acento" tamano="chico">Mi área</Insignia>}
          {onPoblar !== undefined && <BotonDePoblar area={area.nombre} onPoblar={onPoblar} />}
        </div>
      </header>

      <p className="text-texto-tenue pointer-events-none relative z-10 -mt-1 truncate text-xs">
        {jefatura === null
          ? <span className="text-texto-aviso">Sin jefatura</span>
          : `Dirige ${jefatura.nombre}`}
      </p>

      <footer className="pointer-events-none relative z-10 flex items-center justify-between gap-3">
        <GrupoAvatares
          tamano="chico"
          maximo={5}
          personas={gente.map((persona) => ({
            id: persona.staffid,
            full_name: persona.nombre,
            profile_image_url: persona.avatar
          }))}
        />

        <span className="text-texto-tenue flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="text-texto font-semibold">{area.personas}</span>
          {area.personas === 1 ? 'persona' : 'personas'}

          {area.leads > 0 && (
            <span className="text-texto-sutil flex items-center gap-1">
              <UsersRound aria-hidden="true" className="size-3.5" />
              {area.leads}
              {/* El icono no se lee: sin esto un lector de pantalla anuncia un número suelto. */}
              <span className="sr-only">{area.leads === 1 ? 'lead' : 'leads'}</span>
            </span>
          )}
        </span>
      </footer>
    </div>
  )
}

/**
 * El botón que abre el diálogo para sumar gente a un área.
 *
 * Es un icono con nombre accesible y no un botón con texto: va dentro de la tarjeta, que ya tiene su
 * propio trabajo que hacer, y "Agregar gente" escrito en cada una de quince tarjetas convierte el
 * mapa en una pared de botones. El nombre completo viaja igual para quien no ve el icono.
 */
function BotonDePoblar ({ area, onPoblar }: { area: string, onPoblar: () => void }) {
  return (
    <button
      type="button"
      onClick={onPoblar}
      aria-label={`Agregar gente a ${area}`}
      title={`Agregar gente a ${area}`}
      className={cn(
        'text-texto-tenue hover:text-texto hover:bg-relleno-neutro rounded-control ease-neo',
        'duration-rapida relative z-20 flex size-7 shrink-0 items-center justify-center transition-colors',
        'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
      )}
    >
      <UserRoundPlus aria-hidden="true" className="size-4" />
    </button>
  )
}

/**
 * La tarjeta de quien no tiene área.
 *
 * Va con borde punteado y sin color porque la ausencia de área tiene que verse como una ausencia, no
 * como un área más. Se esconde cuando está en cero: ahí no hay nada que abrir, y la línea que lo
 * dice con palabras queda debajo del mapa.
 */
function TarjetaSinArea ({ cuantos, onEntrar }: { cuantos: number, onEntrar: () => void }) {
  return (
    <button
      type="button"
      onClick={onEntrar}
      className={cn(CAJA, 'border-linea-fuerte bg-superficie-hundida border-dashed')}
    >
      <header className="flex items-center gap-2">
        <UserRound aria-hidden="true" className="text-texto-sutil size-4 shrink-0" />
        <h3 className="font-titular text-texto truncate text-[16px] leading-tight font-semibold">
          Sin área
        </h3>
      </header>

      <p className="text-texto-tenue -mt-1 text-xs">Gente que todavía no lleva ninguna puesta</p>

      <footer className="flex items-center justify-between gap-3">
        <span className="text-texto-tenue text-xs tabular-nums">
          <span className="text-texto font-semibold">{cuantos}</span>{' '}
          {cuantos === 1 ? 'persona' : 'personas'}
        </span>
      </footer>
    </button>
  )
}

/**
 * Las áreas que todavía no tienen a nadie.
 *
 * Se pueden abrir igual —el árbol de un área vacía dice que está vacía y ofrece asignarle gente—,
 * así que son botones y no etiquetas muertas. Lo que cambia es el tamaño: una fila de píldoras en
 * vez de quince tarjetas, porque lo único que hay que saber de cada una es su nombre.
 *
 * Arranca abierto: esconder catorce áreas detrás de un resumen plegado haría creer que no existen,
 * y la primera pregunta de quien entra a poblar la casa es justamente cuáles faltan.
 */
function AreasVacias (
  { areas, mias, onEntrar, onPoblar }: {
    areas: AreaDelOrganigrama[]
    mias: Set<number>
    onEntrar: (areaId: number) => void
    onPoblar?: (areaId: number) => void
  }
) {
  const [abierto, setAbierto] = useState(true)

  return (
    <section className="border-linea rounded-tarjeta border border-dashed p-3">
      <button
        type="button"
        onClick={() => { setAbierto(!abierto) }}
        aria-expanded={abierto}
        className={cn(
          'text-texto-tenue hover:text-texto flex w-full items-center gap-2 text-xs',
          'rounded-control ease-neo duration-rapida transition-colors',
          'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('ease-neo duration-rapida size-3.5 transition-transform', !abierto && '-rotate-90')}
        />
        <span className="font-medium">
          {areas.length} {areas.length === 1 ? 'área sin gente' : 'áreas sin gente'}
        </span>
        <span className="text-texto-sutil">· nadie las lleva puestas todavía</span>
      </button>

      {abierto && (
        <ul role="list" className="mt-3 flex list-none flex-wrap gap-2 p-0">
          {areas.map((area) => (
            <li key={area.id}>
              {/* Dos controles en una píldora: entrar a ver el área, y sumarle gente. Van como dos
                  botones hermanos y no anidados, que no es HTML válido. */}
              <span
                className={cn(
                  'border-linea bg-superficie-elevada rounded-control ease-neo duration-rapida',
                  'flex items-center overflow-hidden border text-xs transition-colors'
                )}
              >
                <button
                  type="button"
                  onClick={() => onEntrar(area.id)}
                  className={cn(
                    'text-texto-tenue hover:text-texto hover:bg-hover flex items-center gap-2 px-2.5 py-1.5',
                    'ease-neo duration-rapida transition-colors',
                    'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2'
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full opacity-60"
                    style={{ backgroundColor: colorDeArea(area.id) }}
                  />
                  {area.nombre}
                  {mias.has(area.id) && (
                    <Insignia tono="acento" tamano="chico">Mi área</Insignia>
                  )}
                </button>

                {onPoblar !== undefined && (
                  <button
                    type="button"
                    onClick={() => onPoblar(area.id)}
                    aria-label={`Agregar gente a ${area.nombre}`}
                    title={`Agregar gente a ${area.nombre}`}
                    className={cn(
                      'border-linea text-texto-sutil hover:text-texto hover:bg-relleno-neutro',
                      'ease-neo duration-rapida flex h-7 w-7 shrink-0 items-center justify-center',
                      'border-s transition-colors',
                      'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2'
                    )}
                  >
                    <UserRoundPlus aria-hidden="true" className="size-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
