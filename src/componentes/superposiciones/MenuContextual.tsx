'use client'

import { useEffect, useRef } from 'react'
import * as Radix from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/clases'
import { CLASES_CONTROL } from '@/componentes/formularios/Entrada'

/**
 * Menu desplegable de acciones.
 *
 * Sobre Radix por la navegacion con teclado: flechas, `Home`/`End`, busqueda por letra escrita y
 * cierre con `Escape` devolviendo el foco al disparador. Reimplementar eso a mano es donde se pierden
 * las tardes.
 */
export const MenuContextual = Radix.Root
export const DisparadorMenu = Radix.Trigger

export function SeparadorMenu () {
  return <Radix.Separator className="bg-linea my-1 h-px" />
}

export function ContenidoMenu ({
  className,
  ...resto
}: React.ComponentPropsWithoutRef<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          'border-linea bg-superficie-flotante rounded-medio shadow-2 z-50 min-w-44 border p-1',
          // Radix expone el alto disponible: el menu hace scroll en vez de salirse de la ventana.
          'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto',
          // Crece desde el disparador y no desde su propio centro: Radix calcula el origen segun el
          // lado por el que finalmente entro el menu, que puede no ser el pedido si no habia lugar.
          'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
          // `animation` y no `transition`: Radix retiene el nodo durante el cierre solo si detecta
          // una animacion CSS.
          'data-[state=open]:animate-entrar-escala data-[state=closed]:animate-salir-escala',
          className
        )}
        {...resto}
      />
    </Radix.Portal>
  )
}

/**
 * Clases de una fila del menu.
 *
 * @param peligroso accion destructiva: se pinta en el tono de peligro
 * @returns las clases de la fila
 */
function clasesDeItem (peligroso: boolean): string {
  return cn(
    'rounded-chico flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm outline-none',
    // `data-highlighted` cubre teclado y puntero a la vez: con `:hover` el elemento seleccionado
    // por flechas no se marcaria.
    'transition-colors duration-rapida data-[highlighted]:bg-hover',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    peligroso ? 'text-texto-peligro data-[highlighted]:bg-superficie-peligro' : 'text-texto'
  )
}

interface PropsItem extends React.ComponentPropsWithoutRef<typeof Radix.Item> {
  /** Accion destructiva: se pinta en el tono de peligro. */
  peligroso?: boolean
}

export function ItemMenu ({ peligroso = false, className, ...resto }: PropsItem) {
  return <Radix.Item className={cn(clasesDeItem(peligroso), className)} {...resto} />
}

type PropsItemMarcable = React.ComponentPropsWithoutRef<typeof Radix.CheckboxItem>

/**
 * Fila del menu que se marca y se desmarca, para elegir varias cosas a la vez.
 *
 * Sobre `CheckboxItem` de Radix y no sobre `ItemMenu` con un tilde dibujado: la primitiva emite
 * `role="menuitemcheckbox"` y `aria-checked`, que es lo que un lector de pantalla necesita para
 * decir si la opcion esta elegida. Un tilde suelto no dice nada.
 *
 * El menu no se cierra al marcar (`preventDefault` en `onSelect`): elegir varias opciones cerrando
 * y reabriendo el menu en cada una es exactamente lo que este control existe para evitar.
 */
export function ItemMenuMarcable ({ className, onSelect, children, ...resto }: PropsItemMarcable) {
  return (
    <Radix.CheckboxItem
      className={cn(clasesDeItem(false), className)}
      onSelect={(evento) => {
        evento.preventDefault()
        onSelect?.(evento)
      }}
      {...resto}
    >
      {/* La marca ocupa lugar siempre, tambien apagada: si apareciera al marcar, el texto de la
          fila se correria justo cuando la persona la esta mirando. */}
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <Radix.ItemIndicator asChild>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-acento">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Radix.ItemIndicator>
      </span>
      {children}
    </Radix.CheckboxItem>
  )
}

export const GrupoRadioMenu = Radix.RadioGroup

type PropsItemRadio = React.ComponentPropsWithoutRef<typeof Radix.RadioItem>

/**
 * Fila del menu que elige un valor entre varios, excluyente.
 *
 * Existe para que un filtro de un solo valor pueda vivir en el mismo menu que uno de varios: el menu
 * es la unica primitiva de Radix donde cabe un campo de busqueda, y sin esta fila habria que elegir
 * entre buscar y ser excluyente. `role="menuitemradio"` es lo que dice a un lector de pantalla que
 * elegir una apaga la anterior.
 */
export function ItemMenuRadio ({ className, children, ...resto }: PropsItemRadio) {
  return (
    <Radix.RadioItem className={cn(clasesDeItem(false), className)} {...resto}>
      {/* La marca ocupa lugar siempre, igual que en la fila marcable: si apareciera al elegir, el
          texto se correria justo cuando la persona lo esta mirando. */}
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <Radix.ItemIndicator asChild>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-acento">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Radix.ItemIndicator>
      </span>
      {children}
    </Radix.RadioItem>
  )
}

/** Teclas que el menu necesita recibir aunque el foco este dentro del buscador. */
const TECLAS_DEL_MENU = ['ArrowUp', 'Home', 'End', 'Escape', 'Tab']

/** La primera fila elegible del menu que contiene al campo, o `null` si la busqueda no dejo ninguna. */
function primeraFila (campo: HTMLInputElement | null): HTMLElement | null {
  return campo?.closest('[role="menu"]')?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])') ?? null
}

interface PropsBuscadorMenu {
  valor: string
  onCambiar: (valor: string) => void
  placeholder?: string
}

/**
 * Campo de busqueda dentro de un menu, para listas que no se recorren a ojo.
 *
 * Un catalogo de doscientos Espacios no se elige mirando: se escribe. El menu de Radix trae busqueda
 * por letra tecleada, pero salta a la primera coincidencia por prefijo y no filtra — con nombres que
 * empiezan igual es inservible.
 *
 * Dos detalles sostienen esto y no son adorno:
 * - El foco se pide en un `setTimeout` y no con `autoFocus`: cuando el menu se abre con el teclado,
 *   Radix enfoca su primer item durante el efecto del montaje y se lleva puesto cualquier foco
 *   pedido antes. El tiempo cero corre despues de esos efectos, asi que el campo gana.
 * - Las teclas que no navegan se quedan en el campo (`stopPropagation`): sin eso, escribir "pro"
 *   dispara la busqueda por letra del menu y el foco se va del campo en la primera tecla.
 *
 * `ArrowDown` y `Enter` se atienden aca a mano: la navegacion con flechas de Radix vive en los items
 * y no en el panel, asi que desde un campo de texto —que no es un item— no pasa nada. La flecha baja
 * a la primera fila y `Enter` la elige, que es lo que se espera despues de escribir dos letras.
 */
export function BuscadorMenu ({ valor, onCambiar, placeholder = 'Buscar…' }: PropsBuscadorMenu) {
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Radix enfoca su primer item al abrir y lo hace en su propio ciclo, que no siempre termina
    // antes que este efecto: un unico intento se pierde a veces. Se insiste unos milisegundos y se
    // corta apenas el campo tiene el foco, para no pelearselo a quien ya esta apuntando a una fila.
    let intentos = 6
    const id = setInterval(() => {
      if (campo.current === null || document.activeElement === campo.current || intentos <= 0) {
        clearInterval(id)

        return
      }

      intentos -= 1
      campo.current.focus()
    }, 25)

    return () => { clearInterval(id) }
  }, [])

  return (
    // Pegado arriba: la lista hace scroll debajo y el campo sigue a la vista mientras se recorre.
    <div className="bg-superficie-flotante sticky top-0 z-10 p-1">
      <input
        ref={campo}
        type="text"
        value={valor}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(evento) => { onCambiar(evento.target.value) }}
        onKeyDown={(evento) => {
          if (evento.key === 'ArrowDown' || evento.key === 'Enter') {
            const fila = primeraFila(campo.current)

            if (fila === null) return

            evento.preventDefault()
            // Radix resuelve su propio `Enter` llamando al `click` del item, asi que esto elige la
            // fila por el mismo camino que un puntero.
            if (evento.key === 'Enter') fila.click()
            else fila.focus()

            return
          }

          if (!TECLAS_DEL_MENU.includes(evento.key)) evento.stopPropagation()
        }}
        className={cn(CLASES_CONTROL, 'h-8 text-sm')}
      />
    </div>
  )
}

/** Fila de aviso cuando la busqueda no deja ninguna opcion: el menu vacio parece roto. */
export function SinResultadosMenu ({ children = 'Sin coincidencias' }: { children?: React.ReactNode }) {
  return <p className="text-texto-sutil px-2.5 py-1.5 text-sm">{children}</p>
}
