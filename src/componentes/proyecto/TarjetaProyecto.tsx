import Link from 'next/link'
import { resolverInsignia } from '@/componentes/datos/tabla'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

interface PropsTarjetaProyecto {
  espacio: Espacio
  /**
   * Catalogo `project_statuses` de `/lookups`, para resolver el estado a nombre y color.
   * Sin el, la tarjeta muestra el numero crudo: mejor un id visible que una tarjeta sin estado.
   */
  estados?: OpcionFiltro[]
  className?: string
}

/**
 * Tarjeta de un Proyecto en el listado.
 *
 * El enlace vive en el titulo y no en la tarjeta entera: un `div` clickeable no se alcanza con
 * teclado ni se anuncia como destino, y envolver toda la tarjeta en un `<a>` mete el estado, el
 * avance y las etiquetas dentro del nombre del enlace. El realce al pasar el mouse se aplica al
 * `article`, asi que la superficie sigue leyendose como una unidad.
 *
 * @param espacio fila tal como la devuelve `GET /projects`
 * @param estados catalogo de estados ya resuelto por el servidor
 */
export function TarjetaProyecto ({ espacio, estados, className }: PropsTarjetaProyecto) {
  const estado = resolverInsignia(espacio.status, estados)

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex h-full flex-col gap-3 border p-4',
        'ease-neo transition-[transform,box-shadow] duration-150',
        'hover:shadow-2 hover:scale-[1.01] focus-within:shadow-2 active:scale-[0.99]',
        className
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-base leading-tight font-semibold">
            <Link href={`/espacios/${espacio.id}`} className="hover:text-acento">
              {espacio.name}
            </Link>
          </h3>
          <p className={cn('truncate text-xs', espacio.client === null ? 'text-texto-sutil' : 'text-texto-tenue')}>
            {espacio.client?.company ?? 'Sin cliente'}
          </p>
        </div>

        {estado !== null && (
          <Insignia color={estado.color} tamano="chico">{estado.etiqueta}</Insignia>
        )}
      </header>

      <BarraAvance valor={espacio.progress} de={espacio.name} />

      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Dato etiqueta={`${GLOSARIO.proceso.plural} abiertas`}>
          <span data-numerico className="text-texto font-medium">
            {espacio.counts.tasks_open}
            <span className="text-texto-sutil font-normal"> de {espacio.counts.tasks}</span>
          </span>
        </Dato>

        <Dato etiqueta="Entrega">
          <Fecha valor={espacio.deadline} comoVencimiento className="text-xs" />
        </Dato>
      </dl>

      <Etiquetas etiquetas={espacio.tags} maximo={3} className="mt-auto" />
    </article>
  )
}

/** Par etiqueta/valor de la tarjeta. La etiqueta va en versalita, como en `ResumenProyecto`. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-texto-sutil truncate text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

/**
 * Barra de avance del proyecto.
 *
 * El porcentaje va escrito ademas de dibujado: una barra sola obliga a estimar a ojo, y quien no
 * distingue el relleno del fondo no se entera de nada. `progress` lo calcula el backend, asi que se
 * acota a 0-100 antes de pintarlo: un valor fuera de rango se saldria de la caja.
 *
 * @param valor avance en porcentaje, tal como llega de la API
 * @param de nombre del proyecto, para que la barra se anuncie sin depender de lo que la rodea
 */
function BarraAvance ({ valor, de }: { valor: number, de: string }) {
  const porcentaje = Number.isFinite(valor) ? Math.min(100, Math.max(0, Math.round(valor))) : 0

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-texto-sutil">Avance</span>
        <span data-numerico className="text-texto font-medium">{porcentaje}%</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Avance de ${de}`}
        className="bg-relleno-neutro rounded-control h-1.5 w-full overflow-hidden"
      >
        <div
          className="bg-acento ease-neo h-full rounded-control transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
    </div>
  )
}
