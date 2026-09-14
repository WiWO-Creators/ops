'use client'

import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { MARCAS, MODALIDADES } from '@/definiciones/actas'
import { formatearFecha } from '@/lib/fechas'
import type { ReactElement } from 'react'

/**
 * Los seis datos de cabecera del Meeting Paper.
 *
 * **Ninguno es obligatorio**: el asistente genera con el material y nada más, y tres de los seis
 * llegan rellenados desde el propio Proyecto. Por eso viven plegados bajo un resumen y no en una
 * rejilla siempre abierta: lo que la rejilla abierta comunicaba —sin quererlo— era que había seis
 * cosas que contestar antes de poder escribir el acta.
 *
 * Los `<select>` maquetados a mano se reemplazaron por el `Selector` del sistema. Radix no admite
 * `value=""` —lo reserva para limpiar la selección—, así que "Sin especificar" viaja con un valor
 * centinela que se traduce a la cadena vacía hacia afuera: el contrato con la API no cambia.
 */

/** Valor con el que Radix representa "no se dijo". Hacia afuera siempre sale como cadena vacía. */
const SIN_MODALIDAD = 'sin-especificar'

export interface DatosDeActa {
  cliente: string
  fecha: string
  lugar: string
  modalidad: string
  marca: string
  asistentes: string
}

/** Cuántos asistentes hay escritos. Uno por línea, y las líneas en blanco no cuentan. */
function contarAsistentes (asistentes: string): number {
  return asistentes.split('\n').filter((linea) => linea.trim() !== '').length
}

/**
 * La línea que se lee con el paso plegado.
 *
 * Dice lo que ya trae el asistente para que abrirlo sea una decisión y no una inspección: si el
 * resumen es correcto, el paso no se abre.
 *
 * @param valores los seis datos tal como están cargados
 * @returns el resumen en una línea, separado por puntos medios
 */
export function resumenDeDatos (valores: DatosDeActa): string {
  const fecha = formatearFecha(valores.fecha)
  const cuantos = contarAsistentes(valores.asistentes)
  const marca = MARCAS.find((opcion) => opcion.valor === valores.marca)

  return [
    valores.cliente.trim() === '' ? 'Sin cliente' : valores.cliente.trim(),
    fecha === '—' ? 'Sin fecha' : fecha,
    cuantos === 0 ? 'Sin asistentes' : `${cuantos} asistente${cuantos === 1 ? '' : 's'}`,
    marca?.etiqueta ?? 'Sin marca'
  ].join(' · ')
}

interface PropsDatos {
  valores: DatosDeActa
  /** Recibe solo lo que cambió: el estado vive en el asistente, que es quien arma el envío. */
  onCambio: (parcial: Partial<DatosDeActa>) => void
}

export function DatosDelActa ({ valores, onCambio }: PropsDatos): ReactElement {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Cliente">
        {(props) => (
          <Entrada
            {...props}
            value={valores.cliente}
            onChange={(evento) => { onCambio({ cliente: evento.target.value }) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Fecha de la reunión">
        {(props) => (
          <Entrada
            {...props}
            type="date"
            value={valores.fecha}
            onChange={(evento) => { onCambio({ fecha: evento.target.value }) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Lugar">
        {(props) => (
          <Entrada
            {...props}
            value={valores.lugar}
            onChange={(evento) => { onCambio({ lugar: evento.target.value }) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Modalidad">
        {(props) => (
          <Selector
            value={valores.modalidad === '' ? SIN_MODALIDAD : valores.modalidad}
            onValueChange={(valor) => { onCambio({ modalidad: valor === SIN_MODALIDAD ? '' : valor }) }}
          >
            <DisparadorSelector id={props.id} aria-describedby={props['aria-describedby']} />
            <ContenidoSelector>
              <Opcion value={SIN_MODALIDAD}>Sin especificar</Opcion>
              {MODALIDADES.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <Campo etiqueta="Marca" ayuda="Decide qué firma se muestra en el acta.">
        {(props) => (
          <Selector
            value={valores.marca}
            onValueChange={(valor) => { onCambio({ marca: valor }) }}
          >
            <DisparadorSelector id={props.id} aria-describedby={props['aria-describedby']} />
            <ContenidoSelector>
              {MARCAS.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <Campo etiqueta="Asistentes" ayuda="Uno por línea." className="sm:col-span-2">
        {(props) => (
          <AreaTexto
            {...props}
            rows={3}
            value={valores.asistentes}
            onChange={(evento) => { onCambio({ asistentes: evento.target.value }) }}
          />
        )}
      </Campo>
    </div>
  )
}
