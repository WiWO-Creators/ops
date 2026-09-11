'use client'

import { useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { estaEncendido } from '@/dominio/accesos'
import { cn } from '@/lib/clases'
import { CabeceraDePanel, DialogoConfirmar } from './piezas'
import type { CatalogoDeAccesos, InterruptorDeAccesos } from '@/datos/accesos'

interface PropsPanelInterruptores {
  catalogo: CatalogoDeAccesos
  recargar: () => void
}

/**
 * Los interruptores que deciden qué modelo de permisos rige.
 *
 * No son ajustes de comodidad: cada uno cambia, de golpe y para todo el mundo, de dónde sale el
 * acceso. Apagar las reglas por escalón deja a cada persona solo con sus casillas de Perfex; apagar
 * el alcance devuelve la lectura global a quien la tenía. Por eso **cada cambio pasa por una
 * confirmación** que dice qué se lleva por delante antes de tocarlo, y no hay guardado en lote: un
 * botón "Guardar" al pie invitaría a mover dos y confirmar una sola vez.
 *
 * La lista sale del catálogo de la API, que es también la lista blanca del `PUT`: un interruptor
 * nuevo del backend aparece acá solo, y uno que no esté en esa lista devuelve 422.
 */
export function PanelInterruptores ({ catalogo, recargar }: PropsPanelInterruptores) {
  const [confirmando, setConfirmando] = useState<InterruptorDeAccesos | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Escribe el valor contrario del interruptor que se está confirmando. */
  async function alternar (): Promise<void> {
    if (confirmando === null) return

    setEnCurso(true)
    setError(null)

    const siguiente = estaEncendido(confirmando.valor) ? '0' : '1'
    const resultado = await escribirEnBff('accesos/interruptores', 'PUT', {
      [confirmando.clave]: siguiente
    })

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setConfirmando(null)
    recargar()
  }

  const encendido = confirmando !== null && estaEncendido(confirmando.valor)

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Interruptores"
        descripcion="De dónde sale el acceso. Cada uno cambia lo que ve el equipo entero en el momento en que se toca, así que se confirman de a uno."
      />

      {catalogo.interruptores.length === 0
        ? (
          <Vacio
            titulo="No hay interruptores"
            descripcion="Esta instalación no publica ninguno. El modelo de permisos es el que esté sembrado en la base y no se puede cambiar desde acá."
          />
          )
        : (
          <ul className="flex flex-col gap-3">
            {catalogo.interruptores.map((interruptor) => (
              <li
                key={interruptor.clave}
                className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-wrap items-start justify-between gap-4 border p-4"
              >
                <div className="max-w-prose">
                  <p className="text-texto flex flex-wrap items-center gap-2 text-sm font-medium">
                    {interruptor.nombre}
                    {estaEncendido(interruptor.valor)
                      ? <Insignia tono="exito" tamano="chico">Encendido</Insignia>
                      : <Insignia tono="contorno" tamano="chico">Apagado</Insignia>}
                  </p>
                  <p className="text-texto-tenue mt-1 text-sm">{interruptor.descripcion}</p>
                  <p className="text-texto-sutil mt-1 font-mono text-xs">{interruptor.clave}</p>
                </div>

                <Interruptor
                  encendido={estaEncendido(interruptor.valor)}
                  etiqueta={interruptor.nombre}
                  deshabilitado={enCurso}
                  onPedirCambio={() => { setError(null); setConfirmando(interruptor) }}
                />
              </li>
            ))}
          </ul>
          )}

      <DialogoConfirmar
        abierto={confirmando !== null}
        titulo={`${encendido ? 'Apagar' : 'Encender'} «${confirmando?.nombre ?? ''}»`}
        descripcion={`${confirmando?.descripcion ?? ''} El cambio vale desde el momento en que se guarda y para todo el mundo, no solo para ti.`}
        etiquetaConfirmar={encendido ? 'Apagarlo' : 'Encenderlo'}
        peligroso={encendido}
        enCurso={enCurso}
        error={error}
        onConfirmar={() => { void alternar() }}
        onCerrar={() => { setConfirmando(null) }}
      />
    </div>
  )
}

/**
 * El control de dos estados.
 *
 * Es un `<button role="switch">` y no una casilla porque no propone un valor a guardar después: lo
 * que hace es pedir el cambio, y la confirmación lo ejecuta. Por eso `aria-checked` sigue mostrando
 * el estado guardado mientras el diálogo está abierto, y no el que se está por elegir.
 */
function Interruptor ({
  encendido, etiqueta, deshabilitado, onPedirCambio
}: {
  encendido: boolean
  etiqueta: string
  deshabilitado: boolean
  onPedirCambio: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={onPedirCambio}
      className={cn(
        'rounded-control relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors duration-150',
        'disabled:cursor-not-allowed',
        encendido ? 'bg-acento border-acento' : 'bg-control border-control-borde'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-control size-4 transition-transform duration-150',
          encendido ? 'bg-acento-contenido translate-x-6' : 'bg-texto-tenue translate-x-1'
        )}
      />
    </button>
  )
}
