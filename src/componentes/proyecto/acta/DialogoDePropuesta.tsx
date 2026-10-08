'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { EditorRico } from '@/componentes/formularios/EditorRico'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { htmlVacio } from '@/dominio/texto-rico'
import type { EstadoLookup } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import type { ParcheDePropuesta, PropuestaDeTarea } from '@/definiciones/actas'

/**
 * La propuesta entera, para corregir lo que el modelo no pudo resolver.
 *
 * Son los mismos controles del alta de un Proceso —`SelectorPersonas` para los responsables, el
 * campo de fecha nativo para la entrega, el `Selector` para la prioridad—: lo que se está editando
 * termina siendo una Tarea, y dos formas distintas de elegir un responsable en el mismo producto es
 * lo que hace que una de las dos ofrezca una lista que la otra no.
 *
 * Solo se manda lo que cambió: la API deja el resto como estaba, y un `PATCH` completo pisaría con
 * lo que esta pantalla vio hace un minuto algo que otra persona pudo haber corregido mientras tanto.
 */
export function DialogoDePropuesta ({ propuesta, personas, errorEquipo, prioridades, onGuardar, onCerrar }: {
  propuesta: PropuestaDeTarea
  personas: StaffReferencia[]
  errorEquipo: string | null
  prioridades: EstadoLookup[]
  onGuardar: (parche: ParcheDePropuesta) => Promise<boolean>
  onCerrar: () => void
}): ReactElement {
  const [titulo, setTitulo] = useState(propuesta.titulo)
  const [descripcion, setDescripcion] = useState(propuesta.descripcion ?? '')
  // Con que se compara lo escrito: el HTML tal como el editor normaliza la descripcion original. Sin
  // esto, abrir y guardar sin tocar nada mandaria un `PATCH` por una diferencia de formato.
  const [descripcionBase, setDescripcionBase] = useState(propuesta.descripcion ?? '')
  const [vence, setVence] = useState(propuesta.vence ?? '')
  const [prioridad, setPrioridad] = useState(String(propuesta.prioridad))
  const [asignados, setAsignados] = useState(propuesta.asignados.map((persona) => persona.id))
  const [guardando, setGuardando] = useState(false)

  const limpio = titulo.trim()
  /** Un título vacío no se puede guardar: es lo único de la propuesta que la API exige. */
  const errorTitulo = limpio === '' ? 'La tarea necesita un título.' : undefined

  /** Arma el parche con lo que de verdad cambió y cierra solo si la API lo aceptó. */
  async function guardar (): Promise<void> {
    if (errorTitulo !== undefined) return

    const parche = parcheDeCambios(propuesta, descripcionBase, { titulo: limpio, descripcion, vence, prioridad, asignados })

    if (Object.keys(parche).length === 0) {
      onCerrar()

      return
    }

    setGuardando(true)
    const guardado = await onGuardar(parche)
    setGuardando(false)

    if (guardado) onCerrar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar() }}>
      <ContenidoDialogo
        titulo="Editar la tarea propuesta"
        descripcion="Se guarda sobre la propuesta. La Tarea se crea después, con «Crear tarea»."
        cerrable
      >
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Título" requerido error={errorTitulo}>
            {(props) => (
              <Entrada
                {...props}
                value={titulo}
                maxLength={600}
                onChange={(evento) => { setTitulo(evento.target.value) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Descripción" ayuda="Lo que haga falta para que se entienda sin volver al acta.">
            {(props) => (
              <EditorRico
                {...props}
                etiqueta="Descripción"
                valorInicial={propuesta.descripcion}
                onListo={(normalizado) => {
                  setDescripcionBase(normalizado)
                  setDescripcion(normalizado)
                }}
                onCambio={setDescripcion}
              />
            )}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Entrega">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  value={vence}
                  onChange={(evento) => { setVence(evento.target.value) }}
                />
              )}
            </Campo>

            <Campo etiqueta="Prioridad">
              {({ id }) => (
                <Selector value={prioridad} onValueChange={setPrioridad}>
                  <DisparadorSelector id={id} marcador="Elegir prioridad" />
                  <ContenidoSelector>
                    {prioridades.map((opcion) => (
                      <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
          </div>

          <Campo
            etiqueta="Responsables"
            error={errorEquipo ?? undefined}
            ayuda="Quien el acta nombró y el modelo no pudo resolver llega vacío."
          >
            {({ id }) => (
              <SelectorPersonas
                id={id}
                personas={personas}
                elegidas={asignados}
                onCambiar={setAsignados}
              />
            )}
          </Campo>

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" disabled={guardando} onClick={onCerrar}>Cancelar</Boton>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={errorTitulo !== undefined}
              onClick={() => { void guardar() }}
            >
              Guardar
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** Lo que el diálogo tiene escrito, con los vacíos como texto vacío igual que en los controles. */
interface CamposDePropuesta {
  titulo: string
  descripcion: string
  vence: string
  prioridad: string
  asignados: number[]
}

/**
 * Compara lo escrito con la propuesta y deja solo lo que cambió.
 *
 * @param propuesta la propuesta como la devolvió la API
 * @param descripcionBase la descripción original tal como la normaliza el editor, para no mandar un
 *   cambio por una simple diferencia de formato
 * @param campos lo que hay en el diálogo, con el título ya recortado
 * @returns el parche; vacío si no cambió nada
 */
function parcheDeCambios (propuesta: PropuestaDeTarea, descripcionBase: string, campos: CamposDePropuesta): ParcheDePropuesta {
  const { titulo, descripcion, vence, prioridad, asignados } = campos
  const mismosAsignados =
    asignados.length === propuesta.asignados.length &&
    propuesta.asignados.every((persona) => asignados.includes(persona.id))

  return {
    ...(titulo === propuesta.titulo ? {} : { titulo }),
    ...(descripcion === descripcionBase
      ? {}
      : { descripcion: htmlVacio(descripcion) ? null : descripcion, format: 'html' as const }),
    ...(vence === (propuesta.vence ?? '') ? {} : { vence: vence === '' ? null : vence }),
    ...(prioridad === String(propuesta.prioridad) ? {} : { prioridad: Number(prioridad) }),
    ...(mismosAsignados ? {} : { asignados })
  }
}
