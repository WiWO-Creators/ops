'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta } from '@/datos/cliente'

/**
 * Baja, reactivación y borrado definitivo de Clientes y Equipo.
 * Clientes usa PATCH para desactivar y DELETE con confirmación escrita para borrar.
 * Equipo conserva DELETE para la baja y ?purgar=1 con transferencia para el borrado.
 */

interface PropsBajaYBorrado {
  /** Ruta del BFF del registro, sin barra inicial. Ej: `clients/12` o `staff/183`. */
  ruta: string
  /** Como se llama lo que se va a borrar, para el texto y para la confirmacion escrita. */
  nombre: string
  /** Activa el contrato de clientes: baja por PATCH y borrado con confirmación en el cuerpo. */
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
  const [confirmando, setConfirmando] = useState(false)
  const [escrito, setEscrito] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const extra = extraDeBorrado?.({ deshabilitado: enCurso })
  const confirmacion = usaPapelera ? 'ELIMINAR' : nombre.trim()
  const confirmacionCoincide = escrito.trim() === confirmacion

  /** Manda la baja, la reactivacion o el borrado. Nunca lanza: el fallo se muestra donde se pidio. */
  async function escribir (metodo: 'DELETE' | 'PATCH', sufijo: string, cuerpo?: unknown, definitivo = false): Promise<void> {
    if (enCurso || (definitivo && (!confirmacionCoincide || (extra !== undefined && extra.consulta === null)))) return
    setEnCurso(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/${ruta}${sufijo}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) })
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      setConfirmando(false)
      setEscrito('')

      if (definitivo && alBorrar !== undefined) {
        alBorrar()
        return
      }

      recargar()
    } catch {
      setFallo('No se pudo completar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <>
      {puedeEditar && (activo
        ? (
          <Boton variante="sutil" tamano={tamano} cargando={enCurso} onClick={() => { void escribir(usaPapelera ? 'PATCH' : 'DELETE', '', usaPapelera ? { active: false } : undefined) }}>
            Dar de baja
          </Boton>
          )
        : (
          <Boton variante="sutil" tamano={tamano} cargando={enCurso} onClick={() => { void escribir('PATCH', '', { active: true }) }}>
            Reactivar
          </Boton>
          ))}

      {/* Solo cuando ya esta de baja: la API lo exige y ofrecerlo antes seria ofrecer un 409. */}
      {puedeBorrar && !activo && (
        <Boton
          variante="sutil"
          tamano={tamano}
          onClick={() => { setConfirmando(true); setFallo(null); alAbrirBorrado?.() }}
        >
          Eliminar definitivamente
        </Boton>
      )}

      {fallo !== null && !confirmando && (
        <p role="alert" className="text-texto-peligro w-full text-xs">{fallo}</p>
      )}

      <Dialogo open={confirmando} onOpenChange={(abierto) => { if (!enCurso) { setConfirmando(abierto); setEscrito('') } }}>
        <ContenidoDialogo titulo="Eliminar definitivamente" descripcion={advertencia}>
          <div className="flex flex-col gap-4">
            {extra?.control}

            <Campo etiqueta={`Escribe «${confirmacion}» para confirmar`} requerido>
              {(props) => (
                <Entrada
                  {...props}
                  value={escrito}
                  autoComplete="off"
                  disabled={enCurso}
                  onChange={(evento) => { setEscrito(evento.target.value) }}
                />
              )}
            </Campo>

            {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

            <div className="flex justify-end gap-2">
              <Boton variante="sutil" disabled={enCurso} onClick={() => { setConfirmando(false); setEscrito('') }}>Cancelar</Boton>
              <Boton
                variante="peligro"
                cargando={enCurso}
                disabled={enCurso || !confirmacionCoincide || (extra !== undefined && extra.consulta === null)}
                onClick={() => {
                  void escribir('DELETE', usaPapelera ? '' : `?purgar=1${extra?.consulta ?? ''}`,
                    usaPapelera ? { confirmacion: escrito.trim() } : undefined, true)
                }}
              >
                Eliminar
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </>
  )
}
