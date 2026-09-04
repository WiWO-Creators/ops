'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { guardarAjustes } from '@/datos/recursos'
import { detallesDeAjustesLegibles } from '@/dominio/ajustes'
import {
  AJUSTE_MODO_CORREO_CLIENTE, modoGuardado, modosDisponibles, type ModoCorreoCliente
} from '@/dominio/correo-cliente'
import type { Ajustes, CambiosDeAjustes } from '@/datos/recursos'

const ETIQUETA_MODO: Record<ModoCorreoCliente, string> = {
  apagado: 'Apagado',
  prueba: 'Prueba',
  real: 'Real'
}

/**
 * Qué haría cada modo cuando exista el proceso que envía.
 *
 * En condicional a propósito: hoy los tres se comportan igual —no sale nada— porque nadie vacía la
 * cola. Escribirlos en presente prometería un envío que no ocurre.
 */
const AYUDA_MODO: Record<ModoCorreoCliente, string> = {
  apagado: 'No saldría ningún correo. Es el valor con el que se mergeó el motor y el que rige hoy.',
  prueba: 'Todo iría al buzón de prueba que configura el board, nunca al contacto.',
  real: 'Cada correo iría al contacto de verdad. Es el único modo que puede alcanzar a alguien de afuera de este equipo.'
}

/** Nombre legible de la clave, para el detalle del 422: la API contesta con el nombre técnico. */
const ETIQUETA_DE_CLAVE: Record<string, string> = {
  [AJUSTE_MODO_CORREO_CLIENTE]: 'Modo del correo al cliente'
}

interface PropsModoCorreoAlCliente {
  inicial: Ajustes
}

/**
 * El interruptor del motor de correo al cliente: la opción `wiwo_correo_cliente_modo`.
 *
 * Se escribe con `PATCH /settings` y no con `escribirEnBff()`, igual que `AccesoGoogle`: ese helper
 * reduce el error a un mensaje y pierde el `details` del 422, que es lo único que dice qué clave
 * rechazó la whitelist.
 *
 * Guardar acá no manda ningún correo, ni siquiera en `real`: el interruptor gobierna un envío que
 * todavía no existe. Aun así pasar a `real` pide confirmación —el mismo gesto que el interruptor de
 * efectos externos de arriba—, porque el día que el consumidor exista este valor ya va a estar
 * puesto y nadie va a volver a mirarlo.
 */
export function ModoCorreoAlCliente ({ inicial }: PropsModoCorreoAlCliente): ReactElement {
  const [guardada, setGuardada] = useState(inicial)
  const [modo, setModo] = useState<ModoCorreoCliente | null>(() => modoGuardado(inicial))
  const [confirmarReal, setConfirmarReal] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [detallesError, setDetallesError] = useState<string[]>([])
  const [confirmado, setConfirmado] = useState(false)

  const disponibles = modosDisponibles(guardada)
  const modoActual = modoGuardado(guardada)
  const sucio = modo !== null && modo !== modoActual

  /**
   * Escribe el modo elegido, y solo si cambió.
   *
   * El `PATCH` devuelve el mismo cuerpo que el `GET`, así que el estado se relee de la respuesta en
   * vez de dar por hecho que quedó lo que se mandó.
   */
  async function guardar (): Promise<void> {
    if (modo === null || !sucio) return

    if (modo === 'real' && !confirmarReal) {
      setConfirmarReal(true)
      return
    }

    const cambios: CambiosDeAjustes = { [AJUSTE_MODO_CORREO_CLIENTE]: modo }

    setGuardando(true)
    setErrorGuardar(null)
    setDetallesError([])
    setConfirmado(false)

    const resultado = await guardarAjustes(cambios)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorGuardar(resultado.mensaje)
      setDetallesError(detallesDeAjustesLegibles(resultado.detalles, ETIQUETA_DE_CLAVE))
      return
    }

    setGuardada(resultado.ajustes)
    setModo(modoGuardado(resultado.ajustes))
    setConfirmarReal(false)
    setConfirmado(true)
  }

  if (disponibles.length === 0 || modoActual === null) {
    return (
      <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
        La API todavía no expone <code>{AJUSTE_MODO_CORREO_CLIENTE}</code> como opción editable. Hasta que el board
        la publique en <code>GET /settings</code> no hay nada que configurar desde acá; el motor queda apagado, que
        es su valor inicial.
      </p>
    )
  }

  return (
    <Seccion titulo="Modo del motor">
      <div className="flex flex-col gap-4">
        <p className="text-texto-tenue text-sm">
          Rige hoy: <span className="text-texto font-semibold">{ETIQUETA_MODO[modoActual]}</span>. Cambiarlo no manda
          ningún correo — el envío todavía no está construido.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo del correo al cliente">
          {disponibles.map((opcion) => (
            <button
              key={opcion}
              type="button"
              role="radio"
              aria-checked={modo === opcion}
              onClick={() => { setModo(opcion); setConfirmarReal(false); setConfirmado(false) }}
              className={
                'rounded-tarjeta border p-3 text-left transition-colors duration-150 ' +
                (modo === opcion
                  ? 'border-acento bg-acento-suave'
                  : 'border-control-borde bg-control hover:bg-hover')
              }
            >
              <span className="text-texto text-sm font-semibold">{ETIQUETA_MODO[opcion]}</span>
              <p className="text-texto-tenue mt-1 text-xs">{AYUDA_MODO[opcion]}</p>
            </button>
          ))}
        </div>

        {confirmarReal && (
          <p role="alert" className="text-texto-peligro text-sm">
            Este modo es el que va a mandar correo a gente ajena a este equipo en cuanto el envío exista. Toca
            «Confirmar y guardar» para dejarlo puesto.
          </p>
        )}

        {errorGuardar !== null && (
          <div role="alert" className="text-texto-peligro flex flex-col gap-1 text-sm">
            <p>{errorGuardar}</p>
            {detallesError.length > 0 && (
              <ul className="list-disc pl-5 text-xs">
                {detallesError.map((detalle) => <li key={detalle}>{detalle}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={!sucio}
            onClick={() => { void guardar() }}
          >
            {modo === 'real' && confirmarReal ? 'Confirmar y guardar' : 'Guardar'}
          </Boton>
          {!sucio && (
            <span className="text-texto-sutil text-xs">
              {confirmado ? 'Guardado' : 'Sin cambios'}
            </span>
          )}
        </div>
      </div>
    </Seccion>
  )
}
