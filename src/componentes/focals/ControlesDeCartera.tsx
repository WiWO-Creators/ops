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
 * navegador desde que la página se resolvió, así que esperar un envío sería lentitud regalada. El
 * texto se vuelca a la URL con una pausa y por `history.replaceState`, que tampoco pide nada.
 */
import { useId } from 'react'
import { Search, X } from 'lucide-react'
import { FOCO_EXTERIOR } from './clases-de-foco'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'
import { TRAMOS } from '@/componentes/clientes/SemaforoCliente'
import type { FiltroDeCartera, FotoDeLaCartera, OrdenDeCartera, ResumenDeCartera } from '@/dominio/cartera'
import { ORDEN_DE_TRAMOS, PALABRAS_DE_TRAMO, contarConPalabra } from '@/dominio/tramos-de-semaforo'
import { LARGO_MAXIMO_DE_BUSQUEDA } from '@/dominio/recorte-de-cartera'
import type { ControlDeRecorte } from './useRecorteDeCartera'

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
  /** Si la pantalla es la cartera entera: sólo ahí hay cuentas sin focal que buscar. */
  mostrarFocal: boolean
  /** De qué día es la foto que se está mirando; `null` si no hay ninguna cuenta. */
  foto: FotoDeLaCartera | null
  recorte: ControlDeRecorte
}

/**
 * Dibuja el resumen, el buscador y el orden.
 *
 * @param props los totales ya contados, si la cartera es la entera, la fecha de la foto y el estado
 *   de los tres controles
 */
export function ControlesDeCartera ({ resumen, visibles, mostrarFocal, foto, recorte }: PropsControles) {
  const { texto, filtro, orden, onTexto, onFiltro, onOrden, onLimpiar } = recorte
  const idOrden = useId()

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

        {ORDEN_DE_TRAMOS.map((tramo) => (
          <Ficha
            key={tramo}
            etiqueta={PALABRAS_DE_TRAMO[tramo].deCuentas}
            punto={TRAMOS[tramo].fondo}
            cuantas={resumen.porTramo[tramo]}
            puesta={filtro === tramo}
            onPulsar={() => alternar(tramo)}
          />
        ))}

        {mostrarFocal && (
          <>
            <span aria-hidden="true" className="bg-linea mx-1 hidden h-6 w-px sm:block" />

            <Ficha
              etiqueta={`Sin ${GLOSARIO.focal.singular.toLowerCase()}`}
              cuantas={resumen.sinFocal}
              puesta={filtro === 'sin_focal'}
              onPulsar={() => alternar('sin_focal')}
            />
          </>
        )}
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
            maxLength={LARGO_MAXIMO_DE_BUSQUEDA}
            aria-label={`Buscar una cuenta por nombre, por ${GLOSARIO.focal.singular.toLowerCase()} o por ${GLOSARIO.espacio.singular.toLowerCase()}`}
            placeholder="Busca una cuenta, un focal, un proyecto…"
            className="ps-9 pointer-coarse:h-11"
            onChange={(evento) => onTexto(evento.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={idOrden} className="text-texto-sutil text-xs">Ordenar por</label>
          <Selector value={orden} onValueChange={(valor) => onOrden(valor as OrdenDeCartera)}>
            <DisparadorSelector id={idOrden} className="w-48 pointer-coarse:h-11" />
            <ContenidoSelector>
              {ORDENES.map((una) => (
                <Opcion key={una.valor} value={una.valor}>{una.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        </div>

        {/* Se anuncia: quien filtra sin ver la lista necesita saber cuánto quedó, y es la única
            señal de que una letra más la dejó en cero. */}
        <p role="status" aria-live="polite" className="text-texto-sutil text-xs tabular-nums">
          {visibles === resumen.cuentas
            ? `${resumen.espacios} ${GLOSARIO.espacio.plural.toLowerCase()}, ${contarConPalabra('rojo', resumen.espaciosCriticos)}`
            : `${visibles} de ${resumen.cuentas} cuentas`}
        </p>

        {foto !== null && <FotoDelDia foto={foto} />}

        {(filtro !== 'todas' || texto !== '') && (
          <button
            type="button"
            onClick={onLimpiar}
            className={cn(
              'text-texto-tenue hover:text-texto hover:bg-hover rounded-control ease-neo',
              'duration-rapida flex h-7 items-center gap-1 px-2 text-xs transition-colors',
              'pointer-coarse:h-11 pointer-coarse:px-3',
              FOCO_EXTERIOR
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
 * vez que una cuenta cambia de tramo, y ese salto vale más que los pocos píxeles que ahorra. Se
 * apaga el fondo y el punto, no el texto: bajarle la opacidad al número lo dejaba bajo el contraste
 * mínimo justo en la ficha que dice que todo está bien.
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
  const apagada = cuantas === 0 && !puesta

  return (
    <button
      type="button"
      aria-pressed={puesta}
      onClick={onPulsar}
      className={cn(
        'rounded-tarjeta ease-neo duration-rapida flex items-center gap-2 border px-3 py-1.5',
        'transition-colors pointer-coarse:min-h-11',
        FOCO_EXTERIOR,
        puesta
          ? 'border-linea-fuerte bg-seleccionado text-texto'
          : 'border-linea bg-superficie-elevada hover:bg-hover',
        apagada && 'bg-transparent'
      )}
    >
      {punto !== undefined && (
        <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', punto, apagada && 'opacity-40')} />
      )}
      <span className="text-texto text-sm font-semibold tabular-nums">{cuantas}</span>
      <span className="text-texto-tenue text-xs">{etiqueta}</span>
    </button>
  )
}

/**
 * "Foto del 2 oct 2026", y una insignia cuando esa fecha no es la de hoy.
 *
 * El puntaje se calcula una vez al día: si la corrida no pasó, los números son de otro día y nada más
 * en la pantalla lo diría. La insignia lleva palabras y no solo color, para que se lea igual sin
 * distinguir el tono.
 */
function FotoDelDia ({ foto }: { foto: FotoDeLaCartera }) {
  return (
    <p className="text-texto-sutil flex items-center gap-1.5 text-xs">
      Foto del {formatearFecha(foto.fecha)}
      {foto.obsoleta && <Insignia tono="aviso" tamano="chico">No es de hoy</Insignia>}
    </p>
  )
}
