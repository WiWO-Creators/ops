'use client'

import { useState, type ReactElement } from 'react'
import { Entrada } from '@/componentes/formularios/Entrada'
import type { Campo } from '@/componentes/formularios/Campo'
import { aFechaDelContrato, aFechaLocal, enmascararFechaLocal } from '@/lib/fechas'

/** Los identificadores que `Campo` le cablea a su control. */
type PropsDeCampo = Parameters<Parameters<typeof Campo>[0]['children']>[0]

/**
 * Campo de fecha que se lee y se escribe como se lee y se escribe acá: `31/12/2026`.
 *
 * === POR QUE NO ES UN `<input type="date">` ===
 *
 * Porque ese control ignora el `lang="es"` del documento y ordena dia, mes y año segun el idioma del
 * SISTEMA OPERATIVO. En un equipo en ingles —la mitad de los notebooks del equipo— el mismo
 * formulario pide MM/DD/AAAA, y quien escribe 03/09 pensando en el 3 de septiembre guarda el 9 de
 * marzo. No hay atributo, CSS ni `lang` que lo cambie: es decision del navegador y no se expone.
 *
 * === POR QUE NO ES UN CALENDARIO PROPIO ===
 *
 * Porque el problema es el formato, no el calendario. Un date picker son cientos de lineas, foco,
 * teclado, zonas horarias y accesibilidad a mano, para resolver algo que un input de texto con
 * mascara resuelve entero. Lo que se pierde es el almanaque desplegable; lo que se gana es que la
 * fecha guardada sea la que la persona quiso.
 *
 * === QUE VIAJA HACIA ARRIBA ===
 *
 * El valor del formulario sigue siendo `YYYY-MM-DD`, sin excepcion: la traduccion muere acá y ni
 * `validarFormulario` ni `cuerpoDelFormulario` se enteran. Mientras la fecha esta a medio escribir
 * sube el texto crudo, que no pasa el formato y hace que el formulario lo señale al guardar: es
 * preferible a subir vacio, que perderia en silencio lo tipeado.
 */
export function EntradaFecha (
  { props, valor, alCambiar }: {
    props: PropsDeCampo
    valor: string
    alCambiar: (valor: string) => void
  }
): ReactElement {
  const [texto, setTexto] = useState(() => aFechaLocal(valor))

  // El valor puede cambiar desde afuera —el dialogo se reabre y se vuelve a sembrar—, y entonces lo
  // escrito ya no corresponde. Se resincroniza en el render y no en un efecto por el mismo motivo que
  // la siembra de `FormularioRecurso`: el campo tiene que aparecer con el dato, no aparecer vacio y
  // llenarse en un segundo render.
  const [valorPrevio, setValorPrevio] = useState(valor)
  if (valor !== valorPrevio) {
    setValorPrevio(valor)
    setTexto(aFechaLocal(valor))
  }

  return (
    <Entrada
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      value={texto}
      onChange={(evento) => {
        const escrito = enmascararFechaLocal(evento.target.value)

        setTexto(escrito)
        alCambiar(aFechaDelContrato(escrito) ?? escrito)
      }}
    />
  )
}
