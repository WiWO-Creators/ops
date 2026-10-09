'use client'

import { useEffect, useRef, useState } from 'react'
import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { SelectorEtiquetas } from '@/componentes/formularios/SelectorEtiquetas'
import { ETIQUETAS_DE_EJEMPLO } from './datos-de-ejemplo'

/** Cuanto dura el «guardando» simulado: lo justo para ver el orbe del boton. */
const GUARDADO_SIMULADO_MS = 1500

/**
 * Los tres estados que todo formulario atraviesa y que un control en reposo no muestra:
 * deshabilitado, invalido (`aria-invalid`) y guardando.
 */
export function SeccionEstadosDeFormulario () {
  const [guardando, setGuardando] = useState(false)
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (temporizador.current !== null) clearTimeout(temporizador.current)
  }, [])

  function simularGuardado (): void {
    setGuardando(true)
    temporizador.current = setTimeout(() => { setGuardando(false) }, GUARDADO_SIMULADO_MS)
  }

  return (
    <SeccionTaller
      titulo="Estados de formulario"
      nota="Deshabilitado baja la opacidad y corta el puntero; inválido lo marca aria-invalid —el borde es consecuencia, no la señal—; guardando deshabilita el botón para que un doble clic no mande dos peticiones."
    >
      <Muestra etiqueta="área de texto deshabilitada" className="w-full max-w-sm">
        <Campo etiqueta="Notas" className="w-full">
          {(props) => <AreaTexto disabled defaultValue="Solo lectura mientras la tarea está cerrada." {...props} />}
        </Campo>
      </Muestra>
      <Muestra etiqueta="selector deshabilitado" className="w-full max-w-sm">
        <Campo etiqueta="Prioridad" className="w-full">
          {(props) => (
            <Selector disabled defaultValue="2">
              <DisparadorSelector marcador="Elige una" id={props.id} />
              <ContenidoSelector>
                <Opcion value="1">Baja</Opcion>
                <Opcion value="2">Media</Opcion>
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>
      </Muestra>
      <Muestra etiqueta="entrada inválida" className="w-full max-w-sm">
        <Campo etiqueta="Horas" error="Tiene que ser un número mayor que cero." className="w-full">
          {(props) => <Entrada defaultValue="-2" inputMode="decimal" {...props} />}
        </Campo>
      </Muestra>
      <Muestra etiqueta="etiquetas inválidas" className="w-full max-w-sm">
        <Campo etiqueta="Etiquetas" error="Elige al menos una." className="w-full">
          {(props) => (
            <SelectorEtiquetas
              catalogo={ETIQUETAS_DE_EJEMPLO}
              elegidas={etiquetas}
              onCambiar={setEtiquetas}
              id={props.id}
              idAyuda={props['aria-describedby']}
              invalido={etiquetas.length === 0}
            />
          )}
        </Campo>
      </Muestra>
      <Muestra etiqueta="guardando">
        <div className="flex gap-2">
          <Boton variante="sutil" disabled={guardando}>Cancelar</Boton>
          <Boton variante="primario" cargando={guardando} onClick={simularGuardado}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </Muestra>
      <Muestra etiqueta="botones deshabilitados">
        <div className="flex gap-2">
          <Boton variante="primario" disabled>Primario</Boton>
          <Boton variante="secundario" disabled>Secundario</Boton>
          <Boton variante="peligro" disabled>Peligro</Boton>
        </div>
      </Muestra>
    </SeccionTaller>
  )
}
