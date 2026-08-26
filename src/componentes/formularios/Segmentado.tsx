'use client'

import { useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { Columns3, LayoutGrid, Table2 } from 'lucide-react'
import { cn } from '@/lib/clases'

/**
 * Vocabulario de iconos del control.
 *
 * Las opciones piden el icono por NOMBRE y no pasando el componente. Dos razones: `/procesos` y
 * `/procesos/tablero` son componentes de servidor, y React no deja mandar una funcion —un icono de
 * lucide lo es— a un componente de cliente; y asi "tabla" se dibuja igual en las siete pantallas,
 * que es justamente lo que este componente vino a arreglar.
 */
const ICONOS = {
  tabla: Table2,
  tablero: Columns3,
  tarjetas: LayoutGrid
} as const

/**
 * Una alternativa del control.
 *
 * `href` convierte la opcion en enlace: se usa cuando las alternativas son RUTAS distintas y no dos
 * lecturas de la misma pantalla. Un enlace se puede abrir en otra pestaña y el navegador lo sabe
 * precargar; un boton que llama a `router.push` pierde las dos cosas.
 */
export interface OpcionSegmentada {
  /** Valor con el que se compara `activo`; tambien es la clave de React. */
  valor: string
  /** Texto visible. Es el nombre accesible de la opcion: nunca se oculta. */
  etiqueta: string
  /** Icono de apoyo, por nombre. Decorativo: el nombre accesible siempre lo pone la etiqueta. */
  icono?: keyof typeof ICONOS
  /** Destino, cuando la opcion navega en vez de reescribir la vista actual. */
  href?: string
}

/**
 * Medidas de cada tamaño.
 *
 * Los altos estan elegidos para que el control, sumando el borde y 1px de canaleta arriba y abajo,
 * termine midiendo exactamente lo mismo que el `Boton` de al lado: 32px en `chico` (como
 * `Boton tamano="chico"`) y 36px en `medio` (como `Boton tamano="medio"`). Sin eso, una barra que
 * mezcla los dos controles queda con los bordes desalineados.
 */
const TAMANOS = {
  chico: { opcion: 'h-7 gap-1.5 px-2.5 text-xs', icono: 16 },
  medio: { opcion: 'h-8 gap-2 px-3 text-sm', icono: 18 }
} as const

/** Teclas que mueven el foco dentro del grupo, con el salto que aplica cada una. */
const SALTOS: Record<string, number | 'primero' | 'ultimo'> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'primero',
  End: 'ultimo'
}

interface PropsSegmentado {
  /** Nombre del grupo. Siempre es el `aria-label`; con `etiquetaVisible` tambien se dibuja. */
  etiqueta: string
  /** Las alternativas, en el orden en que se muestran. */
  opciones: readonly OpcionSegmentada[]
  /** Valor elegido. Cuando no coincide con ninguno no se marca ninguno. */
  activo: string | null
  /** Que hacer al elegir. No hace falta cuando todas las opciones son enlaces. */
  onElegir?: (valor: string) => void
  tamano?: keyof typeof TAMANOS
  /** Dibuja la etiqueta a la izquierda del grupo. */
  etiquetaVisible?: boolean
  className?: string
}

/**
 * Control segmentado: una sola eleccion entre pocas alternativas, siempre a la vista.
 *
 * Es el unico control de cambio de vista del producto —tabla, tablero, tarjetas, escala, periodo—.
 * Antes habia cinco copias con tres estilos de "activo" distintos, asi que la misma accion se veia
 * diferente en cada pantalla.
 *
 * **Botones y no pestañas**: `role="tablist"` promete paneles hermanos que se intercambian; aca las
 * opciones son formas de leer LOS MISMOS datos, y varias reescriben la URL o navegan. Por eso el
 * grupo es `role="group"` con `aria-pressed` en cada boton, que es lo que el lector de pantalla
 * necesita para decir cual esta puesta.
 *
 * **Las flechas mueven el foco pero no eligen** (patron de barra de herramientas, no de radiogroup).
 * Elegir dispara una navegacion —`router.replace` o una peticion al BFF—, asi que recorrer las cuatro
 * escalas del Gantt con la flecha lanzaria cuatro recargas antes de llegar a la que se queria. Se
 * confirma con Enter o Espacio, que es lo que un boton hace de por si.
 *
 * @param etiqueta nombre accesible del grupo
 * @param opciones alternativas en orden de lectura
 * @param activo valor puesto, o `null` si ninguno
 * @param onElegir se llama con el valor de la opcion pulsada
 * @param tamano `chico` para barras densas, `medio` para encabezados
 * @param etiquetaVisible dibuja `etiqueta` a la izquierda
 * @returns el grupo de opciones
 */
export function Segmentado ({
  etiqueta,
  opciones,
  activo,
  onElegir,
  tamano = 'chico',
  etiquetaVisible = false,
  className
}: PropsSegmentado): ReactElement {
  const medidas = TAMANOS[tamano]
  const refs = useRef<Array<HTMLElement | null>>([])

  // Con `activo` fuera de la lista ninguna opcion tendria `tabIndex=0` y el grupo entero quedaria
  // fuera del recorrido del tabulador. En ese caso el punto de entrada es la primera.
  const indiceActivo = opciones.findIndex((opcion) => opcion.valor === activo)
  const indiceEnfocable = indiceActivo === -1 ? 0 : indiceActivo

  /** Mueve el foco a la opcion que pide la tecla, dando la vuelta en los extremos. */
  function alPulsarTecla (evento: React.KeyboardEvent, indice: number): void {
    // Un `<a>` no se activa con Espacio: hace scroll de la pagina. Como en el mismo control conviven
    // opciones que son boton y opciones que son enlace, sin esto la misma tecla haria dos cosas
    // distintas segun cual toque, que es exactamente lo que este componente vino a evitar.
    if (evento.key === ' ' && evento.currentTarget instanceof HTMLAnchorElement) {
      evento.preventDefault()
      evento.currentTarget.click()

      return
    }

    const salto = SALTOS[evento.key]

    if (salto === undefined) return

    evento.preventDefault()

    const destino = salto === 'primero'
      ? 0
      : salto === 'ultimo'
        ? opciones.length - 1
        : (indice + salto + opciones.length) % opciones.length

    refs.current[destino]?.focus()
  }

  const grupo = (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn(
        'border-linea bg-superficie-hundida rounded-control inline-flex w-fit items-center gap-0.5 border p-px',
        // Con `etiquetaVisible` el que participa del layout es el envoltorio, asi que `className` va
        // alla: puesto aca, un `ml-auto` de quien llama quedaria muerto.
        !etiquetaVisible && className
      )}
    >
      {opciones.map((opcion, indice) => {
        const puesta = opcion.valor === activo
        const Icono = opcion.icono === undefined ? undefined : ICONOS[opcion.icono]
        const clases = cn(
          'rounded-control ease-neo inline-flex shrink-0 items-center justify-center font-semibold',
          // La misma lista acotada que `Boton`: color y `transform`, nunca `box-shadow` ni `filter`.
          // Animar la sombra en un control que aparece en cada barra del panel cuesta repintados que
          // nadie ve. Sin `transform` en la lista, el hundido al pulsar salta en vez de acompañar.
          'transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
          // La firma de foco de Neo son dos capas: el `outline` y un halo que vive en `box-shadow`
          // (`globals.css`, `:focus-visible`). `shadow-1` es una utilidad y le gana a la capa base,
          // asi que la opcion PUESTA —que es justo la que lleva `tabIndex=0` y la primera que recibe
          // el Tab— se quedaba sin halo. Repuesto como variante, que si le gana a `shadow-1`.
          'focus-visible:shadow-[0_0_0_7px_var(--foco-halo)]',
          medidas.opcion,
          puesta
            // `flotante` y no `elevada`: en oscuro `elevada` es el mismo color que la tarjeta que
            // suele estar debajo, asi que la opcion puesta desaparecia en el fondo y solo la
            // distinguia el color del texto. `flotante` es un escalon mas alto de la rampa y queda
            // por encima tanto de la canaleta como de la tarjeta, en los dos temas.
            ? 'bg-superficie-flotante text-texto shadow-1'
            : 'text-texto-tenue hover:bg-hover hover:text-texto'
        )
        const contenido = (
          <>
            {Icono !== undefined && (
              <Icono size={medidas.icono} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            )}
            {opcion.etiqueta}
          </>
        )

        // Enlace: `aria-current` y no `aria-pressed`. Un enlace no es un interruptor, y el lector de
        // pantalla anuncia "pagina actual", que es exactamente lo que pasa al elegirlo.
        if (opcion.href !== undefined) {
          return (
            <Link
              key={opcion.valor}
              ref={(nodo) => { refs.current[indice] = nodo }}
              href={opcion.href}
              aria-current={puesta ? 'page' : undefined}
              tabIndex={indice === indiceEnfocable ? 0 : -1}
              onKeyDown={(evento) => { alPulsarTecla(evento, indice) }}
              className={clases}
            >
              {contenido}
            </Link>
          )
        }

        return (
          <button
            key={opcion.valor}
            ref={(nodo) => { refs.current[indice] = nodo }}
            type="button"
            aria-pressed={puesta}
            tabIndex={indice === indiceEnfocable ? 0 : -1}
            onClick={() => { onElegir?.(opcion.valor) }}
            onKeyDown={(evento) => { alPulsarTecla(evento, indice) }}
            className={clases}
          >
            {contenido}
          </button>
        )
      })}
    </div>
  )

  if (!etiquetaVisible) return grupo

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* `aria-hidden`: el nombre del grupo ya lo da el `aria-label`. Sin esto el lector de pantalla
          lee "Escala" dos veces, una como texto suelto y otra como nombre del grupo. */}
      <span aria-hidden="true" className="text-texto-sutil text-xs font-medium">{etiqueta}</span>
      {grupo}
    </div>
  )
}
