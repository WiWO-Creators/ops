import Link from 'next/link'
import { resolverInsignia } from '@/componentes/datos/tabla'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { ImagenEntidad } from '@/componentes/presentadores/ImagenEntidad'
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
 * Se lee en tres zonas, de arriba abajo: **quien es** (marca, nombre y cliente, con el estado a la
 * derecha), **como va** (la barra de avance) y **cuando y con que** (entregas, procesos y etiquetas).
 * El pie va anclado con `mt-auto` y separado por una linea: asi la division cae a la misma altura en
 * todas las tarjetas de una fila, aunque una tenga etiquetas y la otra no. Sin ese ancla, cada
 * tarjeta reparte el sobrante donde le toca y la fila queda con los datos a distinta altura.
 *
 * El enlace sigue siendo el del titulo, pero se estira sobre toda la tarjeta con un `::after`
 * posicionado: asi se puede entrar clickeando cualquier parte sin envolver la tarjeta en un `<a>`
 * —eso meteria el estado, el avance y las etiquetas dentro del nombre del enlace— ni usar un `div`
 * clickeable, que no se alcanza con teclado ni se anuncia como destino.
 *
 * @param espacio fila tal como la devuelve `GET /projects`
 * @param estados catalogo de estados ya resuelto por el servidor
 */
export function TarjetaProyecto ({ espacio, estados, className }: PropsTarjetaProyecto) {
  const estado = resolverInsignia(espacio.status, estados)

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 relative flex h-full flex-col gap-3 border p-4',
        'ease-neo transition-[transform,box-shadow,border-color] duration-150',
        // Se levanta en vez de agrandarse: escalar reescala tambien el texto, y una grilla entera de
        // nombres que se reencuadran al pasar el puntero se lee como un temblor. El desplazamiento es
        // `transform`, que es lo que pide el guardrail de rendimiento.
        'hover:shadow-2 hover:border-linea-fuerte hover:-translate-y-0.5',
        'focus-within:shadow-2 focus-within:border-linea-fuerte',
        className
      )}
    >
      <header className="flex items-start gap-3">
        <ImagenEntidad
          nombre={espacio.name}
          imagenPropia={espacio.image_url}
          imagenEfectiva={espacio.image_url ?? espacio.client?.image_url}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* El recorte del nombre va en un `span` interno y no en el `h3` ni en el `Link`: un
              `overflow-hidden` entre la tarjeta y el `::after` que la cubre lo recortaria a el
              tambien, y el clic dejaria de alcanzar toda la superficie. */}
          <h3 className="min-w-0 text-base leading-tight font-semibold">
            <Link
              href={`/proyectos/${espacio.id}`}
              className="hover:text-acento block after:absolute after:inset-0 after:content-['']"
            >
              <span className="block truncate">{espacio.name}</span>
            </Link>
          </h3>
          <p className={cn('truncate text-xs', espacio.client === null ? 'text-texto-sutil' : 'text-texto-tenue')}>
            {espacio.client?.company ?? 'Sin cliente'}
          </p>
        </div>

        {/* `shrink-0`: el estado es lo primero que se busca al barrer la grilla, asi que se recorta el
            nombre antes que la insignia. */}
        {estado !== null && (
          <Insignia color={estado.color} tamano="chico" className="shrink-0">{estado.etiqueta}</Insignia>
        )}
      </header>

      <BarraAvance valor={espacio.progress} de={espacio.name} />

      <footer className="border-linea mt-auto flex flex-col gap-2 border-t pt-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <Dato etiqueta={`${GLOSARIO.proceso.plural} abiertas`}>
            <span data-numerico className="text-texto text-sm font-semibold tabular-nums">
              {espacio.counts.tasks_open}
            </span>
            <span className="text-texto-sutil text-xs"> de {espacio.counts.tasks}</span>
          </Dato>

          <Dato etiqueta="Entrega">
            <Fecha valor={espacio.deadline} comoVencimiento className="text-sm font-medium" />
          </Dato>
        </dl>

        <Etiquetas etiquetas={espacio.tags} maximo={3} />
      </footer>
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
 * Rotulo, barra y cifra van en una sola linea: apilarlos gastaba dos renglones en un dato que es uno
 * solo, y con el ancho de la cifra fijo las barras de una fila arrancan y terminan a la misma altura.
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
    <div className="flex items-center gap-2.5">
      <span className="text-texto-sutil shrink-0 text-xs">Avance</span>

      <div
        role="progressbar"
        aria-valuenow={porcentaje}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Avance de ${de}`}
        className="bg-relleno-neutro rounded-control h-1.5 min-w-0 flex-1 overflow-hidden"
      >
        <div
          className="bg-acento ease-neo h-full rounded-control transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>

      {/* Ancho fijo y `tabular-nums`: sin los dos, "7%" y "100%" corren el final de la barra y las
          cifras bailan al refrescar. */}
      <span data-numerico className="text-texto w-9 shrink-0 text-right text-sm font-semibold tabular-nums">
        {porcentaje}%
      </span>
    </div>
  )
}
