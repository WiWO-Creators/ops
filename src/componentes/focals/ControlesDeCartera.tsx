'use client'

/**
 * La cabecera de Focals: cuánto arde la cartera, y cómo recortarla.
 *
 * === Por qué el resumen y el filtro son la misma pieza ===
 *
 * Porque el recuento y el filtro contestan la misma pregunta con un paso de diferencia: "hay seis
 * cuentas en rojo" e "quiero ver esas seis". Separarlos serían dos barras apiladas —una que informa
 * y otra que actúa— diciendo las mismas cuatro palabras. Acá la ficha dice el número y, al pulsarla,
 * deja en pantalla exactamente lo que ese número cuenta.
 *
 * === Por qué "sin focal" está entre los tramos ===
 *
 * Porque es el otro problema de la pantalla y no se ve en el semáforo: una cuenta al día de la que
 * nadie responde no tiene a quién reclamarle cuando deje de estarlo. Va al final y separada, porque
 * no es un tramo: es una cuenta a la que le falta un dato.
 *
 * El buscador filtra a cada tecla y sin pedirle nada al servidor: la cartera entera ya está en el
 * navegador desde que la página se resolvió, así que esperar un envío sería lentitud regalada.
 */
import { Search, X } from 'lucide-react'
import { Entrada } from '@/componentes/formularios/Entrada'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type { FiltroDeCartera, OrdenDeCartera, ResumenDeCartera } from '@/dominio/cartera'
import type { SemaforoCliente } from '@/datos/recursos'

/**
 * Las fichas de tramo, en orden de urgencia.
 *
 * Rojo primero y no el orden alfabético ni el del tipo: la pantalla existe para encontrar lo que
 * está mal, y lo primero que se lee tiene que ser eso.
 */
const TRAMOS: readonly { valor: SemaforoCliente, etiqueta: string, punto: string }[] = [
  { valor: 'rojo', etiqueta: 'Críticas', punto: 'bg-texto-peligro' },
  { valor: 'amarillo', etiqueta: 'En atención', punto: 'bg-texto-aviso' },
  { valor: 'verde', etiqueta: 'Al día', punto: 'bg-texto-exito' },
  { valor: 'sin_datos', etiqueta: 'Sin datos', punto: 'bg-linea-fuerte' }
]

/** Los tres criterios de orden, con el nombre que tienen en la pantalla. */
const ORDENES: readonly { valor: OrdenDeCartera, etiqueta: string }[] = [
  { valor: 'peor', etiqueta: 'Peor primero' },
  { valor: 'criticos', etiqueta: `Más ${GLOSARIO.espacio.plural.toLowerCase()} críticos` },
  { valor: 'nombre', etiqueta: 'Por nombre' }
]

interface PropsControles {
  resumen: ResumenDeCartera
  /** Cuántas cuentas quedaron después de filtrar, para decirlo cuando no son todas. */
  visibles: number
  texto: string
  filtro: FiltroDeCartera
  orden: OrdenDeCartera
  onTexto: (texto: string) => void
  onFiltro: (filtro: FiltroDeCartera) => void
  onOrden: (orden: OrdenDeCartera) => void
}

/**
 * Dibuja el resumen, el buscador y el orden.
 *
 * @param props los totales ya contados y el estado de los tres controles
 */
export function ControlesDeCartera (
  { resumen, visibles, texto, filtro, orden, onTexto, onFiltro, onOrden }: PropsControles
) {
  /** Pulsar la ficha que ya está puesta la saca: es la forma de volver a ver todo sin buscar un botón. */
  function alternar (valor: FiltroDeCartera): void {
    onFiltro(filtro === valor ? 'todas' : valor)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Ficha
          etiqueta="Todas"
          cuantas={resumen.cuentas}
          puesta={filtro === 'todas'}
          onPulsar={() => onFiltro('todas')}
        />

        {TRAMOS.map((tramo) => (
          <Ficha
            key={tramo.valor}
            etiqueta={tramo.etiqueta}
            punto={tramo.punto}
            cuantas={resumen.porTramo[tramo.valor]}
            puesta={filtro === tramo.valor}
            onPulsar={() => alternar(tramo.valor)}
          />
        ))}

        <span aria-hidden="true" className="bg-linea mx-1 hidden h-6 w-px sm:block" />

        <Ficha
          etiqueta={`Sin ${GLOSARIO.focal.singular.toLowerCase()}`}
          cuantas={resumen.sinFocal}
          puesta={filtro === 'sin_focal'}
          onPulsar={() => alternar('sin_focal')}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="text-texto-sutil pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          />
          <Entrada
            type="search"
            value={texto}
            aria-label={`Buscar una cuenta por nombre, por ${GLOSARIO.focal.singular.toLowerCase()} o por ${GLOSARIO.espacio.singular.toLowerCase()}`}
            placeholder="Busca una cuenta, un focal, un proyecto…"
            className="ps-9"
            onChange={(evento) => onTexto(evento.target.value)}
          />
        </div>

        <label className="text-texto-sutil flex items-center gap-2 text-xs">
          Ordenar por
          <select
            value={orden}
            onChange={(evento) => onOrden(evento.target.value as OrdenDeCartera)}
            className={cn(
              'border-linea bg-superficie-elevada text-texto rounded-control h-9 border px-2 text-sm',
              'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
            )}
          >
            {ORDENES.map((una) => (
              <option key={una.valor} value={una.valor}>{una.etiqueta}</option>
            ))}
          </select>
        </label>

        {/* Se anuncia: quien filtra sin ver la lista necesita saber cuánto quedó, y es la única
            señal de que una letra más la dejó en cero. */}
        <p role="status" aria-live="polite" className="text-texto-sutil text-xs tabular-nums">
          {visibles === resumen.cuentas
            ? `${resumen.espacios} ${GLOSARIO.espacio.plural.toLowerCase()}, ${resumen.espaciosCriticos} en rojo`
            : `${visibles} de ${resumen.cuentas} cuentas`}
        </p>

        {(filtro !== 'todas' || texto !== '') && (
          <button
            type="button"
            onClick={() => { onFiltro('todas'); onTexto('') }}
            className={cn(
              'text-texto-tenue hover:text-texto hover:bg-hover rounded-control ease-neo',
              'duration-rapida flex h-7 items-center gap-1 px-2 text-xs transition-colors',
              'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
            )}
          >
            <X aria-hidden="true" className="size-3.5" />
            Quitar el recorte
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Una ficha del resumen: el número manda, la palabra explica, y se puede pulsar.
 *
 * El número va antes que la etiqueta porque es lo que se compara entre fichas de un vistazo; leerlo
 * después del texto obliga a saltar de renglón cuatro veces para armar la misma foto.
 *
 * Una ficha en cero se dibuja apagada y sigue pulsable: esconderla movería las demás de lugar cada
 * vez que una cuenta cambia de tramo, y ese salto vale más que los pocos píxeles que ahorra.
 */
function Ficha (
  { etiqueta, cuantas, puesta, punto, onPulsar }: {
    etiqueta: string
    cuantas: number
    puesta: boolean
    punto?: string
    onPulsar: () => void
  }
) {
  return (
    <button
      type="button"
      aria-pressed={puesta}
      onClick={onPulsar}
      className={cn(
        'rounded-tarjeta ease-neo duration-rapida flex items-center gap-2 border px-3 py-1.5',
        'transition-colors focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2',
        puesta
          ? 'border-linea-fuerte bg-seleccionado text-texto'
          : 'border-linea bg-superficie-elevada hover:bg-hover',
        cuantas === 0 && !puesta && 'opacity-55'
      )}
    >
      {punto !== undefined && (
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', punto)} />
      )}
      <span className="text-texto text-sm font-semibold tabular-nums">{cuantas}</span>
      <span className="text-texto-tenue text-xs">{etiqueta}</span>
    </button>
  )
}
