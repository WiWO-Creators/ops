'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'
import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { Campo } from '@/componentes/formularios/Campo'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import { SelectorClientes } from '@/componentes/formularios/SelectorClientes'
import { SelectorDePersona } from '@/componentes/formularios/SelectorDePersona'
import { SelectorEtiquetas } from '@/componentes/formularios/SelectorEtiquetas'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { SelectorEspacios } from '@/componentes/proyecto/SelectorEspacios'
import {
  CLIENTES_DE_EJEMPLO, ESPACIOS_DE_EJEMPLO, ETIQUETAS_DE_EJEMPLO, OPCIONES_BUSCABLES, OPCIONES_DE_PERSONA,
  PERSONAS_DE_EJEMPLO
} from './datos-de-ejemplo'

/**
 * Resume lo elegido en el disparador del selector buscable.
 *
 * @param elegidos las opciones elegidas, en orden de eleccion
 * @returns el texto del disparador
 */
function resumirPersonas (elegidos: { nombre: string }[]): string {
  const [primero] = elegidos
  if (primero === undefined) return 'Nadie asignado'
  return elegidos.length === 1 ? primero.nombre : `${elegidos.length} personas`
}

/**
 * Los selectores que eligen entidades relacionadas. Todos reciben el catalogo por props, asi que
 * aca van con datos de ejemplo y sin backend.
 */
export function SeccionSelectoresRelacionales () {
  const [buscables, setBuscables] = useState<number[]>([2])
  const [personas, setPersonas] = useState<number[]>([1, 3])
  const [clientes, setClientes] = useState<number[]>([])
  const [espacios, setEspacios] = useState<number[]>([21])
  const [persona, setPersona] = useState<number | null>(null)
  const [etiquetas, setEtiquetas] = useState<string[]>(['cliente'])

  return (
    <SeccionTaller
      titulo="Selectores relacionales"
      nota="Todos reciben el catálogo por props: quien los monta decide de dónde sale. Las etiquetas aceptan crear una nueva y avisan cuando se parece a una existente."
    >
      <Muestra etiqueta="buscable múltiple" className="w-full max-w-sm">
        <SelectorBuscableMultiple
          opciones={OPCIONES_BUSCABLES}
          elegidos={buscables}
          onCambiar={setBuscables}
          icono={Users}
          resumen={resumirPersonas}
          placeholder="Buscar persona"
          sinResultados="Nadie con ese nombre."
        />
      </Muestra>
      <Muestra etiqueta="personas" className="w-full max-w-sm">
        <Campo etiqueta="Asignados" className="w-full">
          {(props) => <SelectorPersonas personas={PERSONAS_DE_EJEMPLO} elegidas={personas} onCambiar={setPersonas} id={props.id} />}
        </Campo>
      </Muestra>
      <Muestra etiqueta="clientes" className="w-full max-w-sm">
        <Campo etiqueta="Clientes" className="w-full">
          {(props) => <SelectorClientes clientes={CLIENTES_DE_EJEMPLO} elegidos={clientes} onCambiar={setClientes} id={props.id} />}
        </Campo>
      </Muestra>
      <Muestra etiqueta="espacios" className="w-full max-w-sm">
        <Campo etiqueta="Proyectos" className="w-full">
          {(props) => <SelectorEspacios espacios={ESPACIOS_DE_EJEMPLO} elegidos={espacios} onCambiar={setEspacios} id={props.id} />}
        </Campo>
      </Muestra>
      <Muestra etiqueta="una persona" className="w-full max-w-sm">
        <SelectorDePersona
          opciones={OPCIONES_DE_PERSONA}
          valor={persona}
          onCambiar={setPersona}
          marcador="Elige quién hereda"
          etiqueta="Responsable"
          permitirNinguno
        />
      </Muestra>
      <Muestra etiqueta="etiquetas" className="w-full max-w-sm">
        <Campo etiqueta="Etiquetas" className="w-full">
          {(props) => <SelectorEtiquetas catalogo={ETIQUETAS_DE_EJEMPLO} elegidas={etiquetas} onCambiar={setEtiquetas} id={props.id} />}
        </Campo>
      </Muestra>
    </SeccionTaller>
  )
}
