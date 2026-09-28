'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { ConfirmarBorrado, useConfirmarBorrado } from './ConfirmarBorrado'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'
import { mensajeDeRespuesta } from '@/datos/cliente'

/**
 * Baja, reactivación y borrado de Clientes y Equipo.
 * Clientes usa PATCH para desactivar y DELETE sin cuerpo para mandarlo a la papelera: lo definitivo
 * solo ocurre desde `/papelera`, así que acá no se pide palabra escrita.
 * Equipo conserva DELETE para la baja y ?purgar=1 con transferencia para el borrado.
 *
 * El dialogo de borrado definitivo es la primitiva comun `ConfirmarBorrado`: mismo trato que el resto
 * de las confirmaciones de borrado, con el selector de heredero de Equipo como `contenidoExtra`.
 */

interface PropsBajaYBorrado {
  /** Ruta del BFF del registro, sin barra inicial. Ej: `clients/12` o `staff/183`. */
  ruta: string
  /** Como se llama lo que se va a borrar, para el texto y para la confirmacion escrita. */
  nombre: string
  /** Activa el contrato de clientes: baja por PATCH y borrado a la papelera, sin confirmación escrita. */
  usaPapelera?: boolean
  activo: boolean
  puedeEditar: boolean
  puedeBorrar: boolean
  /** Que se lleva el borrado por delante, dicho antes y no despues. */
  advertencia: string
  /**
   * Controles extra del dialogo de borrado, y lo que agregan a la consulta.
   *
   * Existe por el equipo: `?purgar=1` necesita ademas `transferir_a`. Devolver `null` deja el boton
   * de confirmar apagado, que es lo que corresponde mientras falte elegir a quien hereda el trabajo.
   */
  extraDeBorrado?: (props: { deshabilitado: boolean }) => { control: ReactNode, consulta: string | null }
  /** Se llama al abrir la confirmacion, para que `extraDeBorrado` pueda traer lo que necesite. */
  alAbrirBorrado?: () => void
  /** Se llama despues de cada escritura, para volver a pedir el registro. */
  recargar: () => void
  /**
   * Que hacer despues del borrado definitivo. Por defecto, lo mismo que `recargar`.
   *
   * Existe porque la ficha de un cliente se borra a si misma: recargar dejaria a la persona mirando
   * el detalle de algo que ya no existe. Un listado, en cambio, con recargar alcanza.
   */
  alBorrar?: () => void
  tamano?: 'chico' | 'medio'
}

export function BajaYBorrado ({
  ruta,
  nombre,
  usaPapelera = false,
  activo,
  puedeEditar,
  puedeBorrar,
  advertencia,
  extraDeBorrado,
  alAbrirBorrado,
  recargar,
  alBorrar,
  tamano = 'medio'
}: PropsBajaYBorrado): ReactElement {
  const confirmarBorrado = useConfirmarBorrado()
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const aviso = useAviso()

  const extra = extraDeBorrado?.({ deshabilitado: enCurso })
  const confirmacion = nombre.trim()
  const accion = usaPapelera ? 'Enviar a la papelera' : 'Eliminar definitivamente'

  /** Da de baja o reactiva. Nunca lanza: el fallo se muestra junto al boton que lo disparo. */
  async function escribir (metodo: 'DELETE' | 'PATCH', cuerpo?: unknown): Promise<void> {
    if (enCurso) return
    setEnCurso(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) })
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      recargar()
    } catch {
      setFallo('No se pudo completar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  /** Borra definitivo o manda a la papelera. Lanza si falla: `ConfirmarBorrado` muestra el mensaje. */
  async function eliminarDefinitivo (): Promise<void> {
    setEnCurso(true)

    try {
      const sufijo = usaPapelera ? '' : `?purgar=1${extra?.consulta ?? ''}`
      const respuesta = await fetch(`/api/bff/${ruta}${sufijo}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' }
      })

      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

      aviso.exito(usaPapelera ? `«${nombre}» se envió a la papelera.` : `«${nombre}» se eliminó definitivamente.`)

      if (alBorrar !== undefined) {
        alBorrar()
        return
      }

      recargar()
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <>
      {puedeEditar && (activo
        ? (
          <Boton variante="sutil" tamano={tamano} cargando={enCurso} onClick={() => { void escribir(usaPapelera ? 'PATCH' : 'DELETE', usaPapelera ? { active: false } : undefined) }}>
            Dar de baja
          </Boton>
          )
        : (
          <Boton variante="sutil" tamano={tamano} cargando={enCurso} onClick={() => { void escribir('PATCH', { active: true }) }}>
            Reactivar
          </Boton>
          ))}

      {/* Solo cuando ya esta de baja: la API lo exige y ofrecerlo antes seria ofrecer un 409. */}
      {puedeBorrar && !activo && (
        <Boton
          variante="sutil"
          tamano={tamano}
          onClick={() => { confirmarBorrado.abrir(); setFallo(null); alAbrirBorrado?.() }}
        >
          {accion}
        </Boton>
      )}

      {fallo !== null && !confirmarBorrado.abierto && (
        <p role="alert" className="text-texto-peligro w-full text-xs">{fallo}</p>
      )}

      <ConfirmarBorrado
        abierto={confirmarBorrado.abierto}
        onCerrar={confirmarBorrado.cerrar}
        titulo={accion}
        advertencia={advertencia}
        confirmacionEscrita={usaPapelera ? undefined : confirmacion}
        etiquetaConfirmar={accion}
        contenidoExtra={extra?.control}
        deshabilitadoExtra={extra !== undefined && extra.consulta === null}
        tamano={tamano === 'chico' ? 'chico' : 'medio'}
        onConfirmar={eliminarDefinitivo}
      />
    </>
  )
}
