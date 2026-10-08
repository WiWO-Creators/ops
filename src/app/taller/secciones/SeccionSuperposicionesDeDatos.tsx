'use client'

import { useState } from 'react'
import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { Boton } from '@/componentes/formularios/Boton'
import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { TarjetaFlotantePersona } from '@/componentes/presentadores/TarjetaFlotantePersona'
import { FICHA_DE_EJEMPLO, PERSONA_DESTACADA } from './datos-de-ejemplo'

/** Lo que dura el borrado simulado, para ver el estado de espera del boton de confirmar. */
const BORRADO_SIMULADO_MS = 900

/**
 * Espera un rato sin hacer nada: el borrado del taller no borra.
 *
 * @returns una promesa que se resuelve tras `BORRADO_SIMULADO_MS`
 */
function simularBorrado (): Promise<void> {
  return new Promise((resolver) => { setTimeout(resolver, BORRADO_SIMULADO_MS) })
}

/**
 * Las superposiciones que dependen de datos: la mini-ficha de una persona y la confirmacion de un
 * borrado, en sus dos formas (un clic, o escribir el nombre para lo definitivo).
 */
export function SeccionSuperposicionesDeDatos () {
  const [confirmando, setConfirmando] = useState<'papelera' | 'definitivo' | null>(null)

  return (
    <SeccionTaller
      titulo="Superposiciones con datos"
      nota="La tarjeta de persona se abre al pasar el mouse o al recibir el foco, y pide su ficha solo la primera vez; acá llega con una ficha de ejemplo. El borrado definitivo exige escribir el nombre."
    >
      <Muestra etiqueta="tarjeta flotante de persona">
        <TarjetaFlotantePersona id={PERSONA_DESTACADA.id} nombre={PERSONA_DESTACADA.full_name} fichaInicial={FICHA_DE_EJEMPLO} />
      </Muestra>
      <Muestra etiqueta="confirmar borrado">
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={() => { setConfirmando('papelera') }}>A la papelera</Boton>
          <Boton variante="peligro" onClick={() => { setConfirmando('definitivo') }}>Eliminar para siempre</Boton>
        </div>
        <ConfirmarBorrado
          abierto={confirmando === 'papelera'}
          onCerrar={() => { setConfirmando(null) }}
          advertencia="La tarea va a la papelera y se puede restaurar durante 30 días."
          onConfirmar={simularBorrado}
        />
        <ConfirmarBorrado
          abierto={confirmando === 'definitivo'}
          onCerrar={() => { setConfirmando(null) }}
          titulo="Eliminar cliente"
          advertencia="Se borran el cliente, sus contactos y sus archivos. No tiene vuelta atrás."
          confirmacionEscrita="Acme"
          onConfirmar={simularBorrado}
        />
      </Muestra>
    </SeccionTaller>
  )
}
