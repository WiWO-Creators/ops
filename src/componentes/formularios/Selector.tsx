'use client'

import { useState } from 'react'
import * as Radix from '@radix-ui/react-select'
import {
  BuscadorMenu,
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual,
  SinResultadosMenu,
  UMBRAL_BUSCADOR
} from '@/componentes/superposiciones/MenuContextual'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { normalizar } from '@/dominio/salas'
import { cn } from '@/lib/clases'
import { CLASES_CONTROL } from './Entrada'

/**
 * Selector de una opcion.
 *
 * Sobre Radix y no sobre un `<select>` nativo por una razon concreta: el nativo no deja estilar sus
 * opciones ni mostrar en ellas nada que no sea texto plano, y acá hacen falta puntos de color de
 * estado y avatares. A cambio hay que reponer lo que el nativo daba gratis — teclado, tipeo para
 * buscar, cierre con `Escape` —, que es justamente lo que Radix trae.
 */
export const Selector = Radix.Root
export const GrupoOpciones = Radix.Group

/**
 * Clases del disparador de un desplegable.
 *
 * Se exportan porque no todo desplegable es un `Select`: un filtro de varios valores necesita un
 * menu con marcas, que es otra primitiva de Radix, y aun asi tiene que verse exactamente igual que
 * este. Compartir la cadena es lo que garantiza que sigan iguales cuando alguien cambie el alto.
 */
export const CLASES_DISPARADOR = cn(
  CLASES_CONTROL,
  'flex h-9 items-center justify-between gap-2 text-left text-sm'
)

/** Chevron del disparador de un desplegable. Decorativo: el nombre lo pone el disparador. */
export function ChevronSelector () {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 opacity-60">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface PropsDisparador extends React.ComponentPropsWithoutRef<typeof Radix.Trigger> {
  marcador?: string
}

export function DisparadorSelector ({ marcador, className, id, ...resto }: PropsDisparador) {
  return (
    <Radix.Trigger
      id={id}
      className={cn(
        CLASES_DISPARADOR,
        // El marcador se pinta tenue: Radix lo expone con este atributo cuando no hay valor.
        'data-[placeholder]:text-texto-sutil',
        className
      )}
      {...resto}
    >
      <Radix.Value placeholder={marcador} />
      <Radix.Icon asChild>
        <ChevronSelector />
      </Radix.Icon>
    </Radix.Trigger>
  )
}

export function ContenidoSelector ({
  className,
  children,
  ...resto
}: React.ComponentPropsWithoutRef<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        // `position="popper"` para poder desplazarlo del disparador; con el modo por defecto, el
        // panel se superpone al control y tapa lo que se acaba de elegir.
        position="popper"
        sideOffset={6}
        className={cn(
          'border-linea bg-superficie-flotante rounded-medio shadow-2 z-50 overflow-hidden border',
          'max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)]',
          // Crece desde el disparador y no desde su propio centro: Radix calcula el origen segun el
          // lado por el que finalmente entro el panel, que puede no ser el pedido si no habia lugar.
          'origin-[var(--radix-select-content-transform-origin)]',
          // `animation` y no `transition`: Radix retiene el nodo durante el cierre solo si detecta
          // una animacion CSS.
          'data-[state=open]:animate-entrar-escala data-[state=closed]:animate-salir-escala',
          className
        )}
        {...resto}
      >
        <Radix.Viewport className="p-1">{children}</Radix.Viewport>
      </Radix.Content>
    </Radix.Portal>
  )
}

export function Opcion ({
  className,
  children,
  ...resto
}: React.ComponentPropsWithoutRef<typeof Radix.Item>) {
  return (
    <Radix.Item
      className={cn(
        'rounded-chico text-texto flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm outline-none',
        'transition-colors duration-rapida data-[highlighted]:bg-hover',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...resto}
    >
      <Radix.ItemText>{children}</Radix.ItemText>
      <Radix.ItemIndicator asChild>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-acento ml-auto shrink-0">
          <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Radix.ItemIndicator>
    </Radix.Item>
  )
}

interface PropsSelectorBuscable {
  /** Valor elegido; cadena vacia cuando todavia no se eligio ninguno. */
  valor: string
  onElegir: (valor: string) => void
  opciones: OpcionFiltro[]
  /** Lo que dice el disparador mientras no hay nada elegido. */
  marcador: string
  /** Como se nombra lo que se elige, para el buscador y el aviso de "ninguno coincide". */
  nombre: string
  id?: string
  className?: string
}

/**
 * Selector de una opcion con buscador, para catalogos que no se recorren a ojo.
 *
 * Existe porque el `Select` de Radix no admite un campo de texto dentro del panel: con ciento
 * veinticinco Clientes, elegir se convierte en bajar una lista alfabetica hasta encontrar el que se
 * busca, y con la lista recortada por la API ni siquiera esta. Por eso el catalogo entero y un
 * buscador arriba, que es el mismo par que ya usan los filtros de las tablas.
 *
 * Es el gemelo de formulario del menu buscable de `ControlesTabla`: comparten `BuscadorMenu`,
 * `GrupoRadioMenu` e `ItemMenuRadio`, y se separan en lo unico que de verdad los distingue — aquel
 * tiene una fila para no filtrar y un ancho fijo de barra; este ocupa el ancho del campo y no ofrece
 * "ninguno", porque un campo requerido sin valor no es una eleccion.
 *
 * El buscador solo aparece a partir de `UMBRAL_BUSCADOR` opciones: debajo de eso la lista se lee de
 * una y un campo de texto es un paso de mas.
 *
 * @param valor valor elegido, o cadena vacia
 * @param onElegir recibe el valor de la opcion elegida
 * @param opciones catalogo completo entre el que se elige
 * @param marcador texto del disparador sin eleccion
 * @param nombre como se llama lo que se elige, en singular y minuscula
 * @param id para enlazar la etiqueta del campo con el disparador
 * @param className clases extra del disparador
 */
export function SelectorBuscable ({ valor, onElegir, opciones, marcador, nombre, id, className }: PropsSelectorBuscable) {
  const [busqueda, setBusqueda] = useState('')

  const partes = normalizar(busqueda).split(/\s+/).filter((parte) => parte !== '')
  const visibles = partes.length === 0
    ? opciones
    : opciones.filter((opcion) => {
      const etiqueta = normalizar(opcion.etiqueta)

      return partes.every((parte) => etiqueta.includes(parte))
    })

  const elegida = opciones.find((opcion) => opcion.valor === valor) ?? null

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        className={cn(CLASES_DISPARADOR, 'w-full', elegida === null && 'text-texto-sutil', className)}
      >
        <span className="truncate">{elegida?.etiqueta ?? marcador}</span>
        <ChevronSelector />
      </DisparadorMenu>

      <ContenidoMenu
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]"
      >
        {opciones.length >= UMBRAL_BUSCADOR && (
          <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder={`Buscar ${nombre}…`} />
        )}

        <GrupoRadioMenu value={valor} onValueChange={onElegir}>
          {visibles.map((opcion) => (
            <ItemMenuRadio key={opcion.valor} value={opcion.valor} disabled={opcion.deshabilitada}>
              <span className="truncate">{opcion.etiqueta}</span>
            </ItemMenuRadio>
          ))}
        </GrupoRadioMenu>

        {visibles.length === 0 && <SinResultadosMenu>Ninguno coincide.</SinResultadosMenu>}

        {/* Filtrar no mueve el foco: sin este aviso, quien usa un lector de pantalla escribe y la
            lista cambia en silencio debajo del campo. */}
        {opciones.length >= UMBRAL_BUSCADOR && (
          <p role="status" aria-live="polite" className="sr-only">
            {visibles.length === 1 ? `1 ${nombre} en la lista` : `${visibles.length} opciones en la lista`}
          </p>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
