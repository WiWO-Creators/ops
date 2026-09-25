'use client'

import { useId, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { CLASES_CONTROL } from '@/componentes/formularios/Entrada'
import {
  agregarEtiqueta, esMismaEtiqueta, LARGO_MAXIMO_ETIQUETA, sugerenciasDeEtiqueta
} from '@/dominio/etiquetas'
import { cn } from '@/lib/clases'

interface PropsSelectorEtiquetas {
  /** Nombres de las etiquetas que ya existen (`lookups.tags`). */
  catalogo: readonly string[]
  /** Nombres puestos. Los que no están en el catálogo se crean al guardar. */
  elegidas: readonly string[]
  onCambiar: (nombres: string[]) => void
  id?: string
  /** Id del texto de ayuda del campo, para `aria-describedby`. */
  idAyuda?: string
  invalido?: boolean
}

/** Una fila de la lista: una etiqueta existente o la que se crearía. */
interface Opcion {
  clave: string
  nombre: string
  tipo: 'existente' | 'parecida' | 'nueva'
}

/**
 * Pone etiquetas escribiéndolas: elige una existente, o crea la que no está.
 *
 * Reemplaza al menú con marcas más un campo "Etiqueta nueva" con su botón "Agregar", que eran dos
 * controles para una sola idea y no avisaban de nada: quien escribía "licitacion" creaba una tercera
 * variante sin ver que ya existían "Licitación" y "licitaciones". Acá, mientras se escribe, aparecen
 * debajo las que la contienen y las que se le parecen (errores de tipeo), y la última fila ofrece
 * crearla tal cual. La lógica de qué ofrecer vive en `dominio/etiquetas.ts`.
 *
 * `Enter` elige la fila activa: la que coincide exacto o empieza igual, y si no hay, la de crear.
 * Con el campo vacío solo elige si se llegó a la fila con las flechas.
 * Una parecida nunca queda activa por sí sola: es una pregunta ("¿era esta?"), no una corrección.
 * `Backspace` con el campo vacío saca la última, `Escape` cierra la lista, y la coma también suma.
 *
 * Es un combobox del patrón ARIA y no un menú de Radix: el foco se queda en el campo mientras las
 * flechas recorren la lista (`aria-activedescendant`), que es lo que un menú no permite.
 */
export function SelectorEtiquetas ({ catalogo, elegidas, onCambiar, id, idAyuda, invalido = false }: PropsSelectorEtiquetas) {
  const [texto, setTexto] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [activa, setActiva] = useState(0)
  // Con el campo vacio la lista muestra el catalogo, y `Enter` solo elige si se llego a una fila con
  // las flechas: si no, un `Enter` distraido pondria la primera etiqueta del abecedario.
  const [recorrida, setRecorrida] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const idLista = useId()

  const { coincidencias, parecidas, nueva } = sugerenciasDeEtiqueta(catalogo, texto, elegidas)
  const opciones: Opcion[] = [
    ...coincidencias.map((nombre) => ({ clave: `e-${nombre}`, nombre, tipo: 'existente' as const })),
    ...parecidas.map((nombre) => ({ clave: `p-${nombre}`, nombre, tipo: 'parecida' as const })),
    ...(nueva === null ? [] : [{ clave: 'nueva', nombre: nueva, tipo: 'nueva' as const }])
  ]
  const indiceActivo = Math.min(activa, opciones.length - 1)
  // Sin texto y sin flechas no hay fila activa: resaltarla diria que `Enter` la elige, y no la elige.
  const hayActiva = texto.trim() !== '' || recorrida
  const visible = abierta && opciones.length > 0
  const primeraParecida = opciones.findIndex((opcion) => opcion.tipo === 'parecida')

  /**
   * La fila que queda activa al escribir: la existente que empieza igual, o si no la de crear.
   *
   * Las coincidencias que solo contienen el texto en el medio no se eligen solas: "ion" no es
   * "Licitación", y `Enter` la pondría sin que nadie la haya pedido.
   */
  function activaPorDefecto (escrito: string): number {
    const siguientes = sugerenciasDeEtiqueta(catalogo, escrito, elegidas)
    const empiezaIgual = siguientes.coincidencias.findIndex((nombre) => (
      esMismaEtiqueta(nombre.slice(0, escrito.trim().length), escrito)
    ))

    if (escrito.trim() === '' || empiezaIgual !== -1) return Math.max(empiezaIgual, 0)
    if (siguientes.nueva !== null) return siguientes.coincidencias.length + siguientes.parecidas.length

    return 0
  }

  function elegir (nombre: string): void {
    onCambiar(agregarEtiqueta(elegidas, nombre, catalogo))
    setTexto('')
    setActiva(0)
    setRecorrida(false)
    campo.current?.focus()
  }

  function quitar (nombre: string): void {
    onCambiar(elegidas.filter((elegida) => elegida !== nombre))
    campo.current?.focus()
  }

  function alEscribir (valor: string): void {
    // La coma separa: pegar "Codelco, Minería" pone las dos.
    if (valor.includes(',')) {
      const partes = valor.split(',')
      const resto = partes.pop() ?? ''
      onCambiar(partes.reduce((lista, parte) => agregarEtiqueta(lista, parte, catalogo), [...elegidas]))
      setTexto(resto)
      setActiva(activaPorDefecto(resto))
      setAbierta(true)

      return
    }

    setTexto(valor)
    setActiva(activaPorDefecto(valor))
    setRecorrida(false)
    setAbierta(true)
  }

  function alTeclear (evento: React.KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (!visible) {
        setAbierta(true)

        return
      }
      const paso = evento.key === 'ArrowDown' ? 1 : -1
      setActiva((indiceActivo + paso + opciones.length) % opciones.length)
      setRecorrida(true)

      return
    }

    if (evento.key === 'Enter') {
      // Nunca manda el formulario: en este campo `Enter` significa "poner esta etiqueta".
      evento.preventDefault()
      const opcion = opciones[indiceActivo]
      // Lo escrito ya estaba puesto: no hay nada que agregar, pero el texto no puede quedar ahi
      // pegado a lo proximo que se escriba.
      if (texto.trim() !== '' && elegidas.some((elegida) => esMismaEtiqueta(elegida, texto))) {
        setTexto('')

        return
      }
      if (visible && opcion !== undefined && hayActiva) elegir(opcion.nombre)

      return
    }

    if (evento.key === 'Escape' && visible) {
      // Cierra la lista y no el diálogo que contiene al formulario.
      evento.preventDefault()
      evento.stopPropagation()
      setAbierta(false)

      return
    }

    const ultima = elegidas.at(-1)
    if (evento.key === 'Backspace' && texto === '' && ultima !== undefined) quitar(ultima)
  }

  return (
    <div className="relative">
      <div
        className={cn(
          CLASES_CONTROL,
          'flex min-h-9 cursor-text flex-wrap items-center gap-1.5 px-1.5 py-1',
          'focus-within:border-acento',
          // El anillo de foco de Neo va en la caja entera y no en el campo de adentro, que es angosto
          // y queda entre las etiquetas: con teclado se tiene que ver qué control tiene el foco.
          'outline-offset-2 has-[input:focus-visible]:[outline:3px_solid_var(--foco)] has-[input:focus-visible]:[box-shadow:0_0_0_7px_var(--foco-halo)]',
          invalido && 'border-relleno-peligro'
        )}
        onClick={() => campo.current?.focus()}
      >
        {elegidas.map((nombre) => {
          const esNueva = !catalogo.some((existente) => esMismaEtiqueta(existente, nombre))

          return (
            <span
              key={nombre}
              className="bg-relleno-neutro text-relleno-neutro-contenido rounded-chico flex max-w-full items-center gap-1 py-0.5 pl-2 pr-1 text-xs"
            >
              <span className="truncate">{nombre}</span>
              {esNueva && <span className="text-texto-tenue">(nueva)</span>}
              <button
                type="button"
                onClick={(evento) => { evento.stopPropagation(); quitar(nombre) }}
                aria-label={`Quitar la etiqueta ${nombre}`}
                className="rounded-chico hover:bg-hover flex size-4 shrink-0 items-center justify-center opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          )
        })}

        <input
          ref={campo}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={visible}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={visible && hayActiva ? `${idLista}-${indiceActivo}` : undefined}
          aria-describedby={idAyuda}
          aria-invalid={invalido || undefined}
          autoComplete="off"
          maxLength={LARGO_MAXIMO_ETIQUETA}
          value={texto}
          placeholder={elegidas.length === 0 ? 'Escribe una etiqueta' : ''}
          className="placeholder:text-texto-sutil text-texto h-7 min-w-24 flex-1 bg-transparent px-1.5 text-sm outline-none focus-visible:shadow-none focus-visible:outline-none"
          onChange={(evento) => alEscribir(evento.target.value)}
          onKeyDown={alTeclear}
          onFocus={() => { setAbierta(true); setActiva(activaPorDefecto(texto)) }}
          onBlur={() => setAbierta(false)}
        />
      </div>

      {visible && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Etiquetas sugeridas"
          // `mousedown` se frena para que el clic no le robe el foco al campo antes de elegir.
          onMouseDown={(evento) => evento.preventDefault()}
          className={cn(
            'border-linea bg-superficie-flotante rounded-medio shadow-2 absolute inset-x-0 top-full z-20 mt-1.5 border p-1',
            'animate-entrar-escala max-h-64 origin-top overflow-y-auto'
          )}
        >
          {opciones.map((opcion, indice) => (
            <li key={opcion.clave} role="presentation">
              {indice === primeraParecida && (
                <p className="text-texto-tenue px-2.5 pb-1 pt-2 text-xs" aria-hidden="true">¿Quisiste decir…?</p>
              )}
              {opcion.tipo === 'nueva' && indice > 0 && <div className="bg-linea my-1 h-px" aria-hidden="true" />}
              <div
                id={`${idLista}-${indice}`}
                role="option"
                aria-selected={hayActiva && indice === indiceActivo}
                onMouseEnter={() => { setActiva(indice); setRecorrida(true) }}
                onClick={() => elegir(opcion.nombre)}
                className={cn(
                  'rounded-chico text-texto flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm',
                  'duration-rapida transition-colors',
                  hayActiva && indice === indiceActivo && 'bg-hover'
                )}
              >
                {opcion.tipo === 'nueva'
                  ? (
                    <>
                      <Plus size={14} aria-hidden="true" className="text-acento shrink-0" />
                      <span className="truncate">
                        Crear <span className="font-medium">«{opcion.nombre}»</span>
                      </span>
                    </>
                    )
                  : <span className="truncate">{opcion.nombre}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
