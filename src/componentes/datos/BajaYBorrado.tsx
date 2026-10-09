'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { RotateCcw, PowerOff } from 'lucide-react'
import { ConfirmarBorrado, useConfirmarBorrado } from './ConfirmarBorrado'
import { MenuAccionesFila, type AccionDeBorrado, type AccionDeFila } from './MenuAccionesFila'
import { escribirEnBff } from './mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'

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
  /**
   * Agrupa baja, reactivacion y borrado en el menu ⋯ de `MenuAccionesFila`, como en la cabecera de
   * una ficha. Sin el, se dibujan como botones sueltos, que es lo que usa la fila de un listado.
   */
  enMenu?: boolean
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
  tamano = 'medio',
  enMenu = false
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

    const resultado = await escribirEnBff(ruta, metodo, cuerpo)

    setEnCurso(false)

    if (!resultado.ok && resultado.incierta !== true) {
      setFallo(resultado.mensaje)
      return
    }

    // Sin respuesta no se sabe si quedo: se avisa y la recarga muestra como esta de verdad.
    if (!resultado.ok) aviso.advertencia(resultado.mensaje)

    recargar()
  }

  /** Borra definitivo o manda a la papelera. Lanza si falla: `ConfirmarBorrado` muestra el mensaje. */
  async function eliminarDefinitivo (): Promise<void> {
    setEnCurso(true)

    const sufijo = usaPapelera ? '' : `?purgar=1${extra?.consulta ?? ''}`
    const resultado = await escribirEnBff(`${ruta}${sufijo}`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      if (resultado.incierta !== true) throw new Error(resultado.mensaje)

      // No se sabe si se borro: no se afirma que no, y la recarga muestra como quedo.
      aviso.advertencia(resultado.mensaje)
      recargar()

      return
    }

    aviso.exito(usaPapelera ? `«${nombre}» se envió a la papelera.` : `«${nombre}» se eliminó definitivamente.`)

    if (alBorrar !== undefined) {
      alBorrar()
      return
    }

    recargar()
  }

  const avisoDeFallo = fallo !== null && !confirmarBorrado.abierto && (
    <AvisoEnLinea variante="error" mensaje={fallo} className="w-full" />
  )

  if (enMenu) {
    const cambioDeEstado: AccionDeFila = activo
      ? { clave: 'baja', etiqueta: 'Dar de baja', icono: PowerOff, onSeleccionar: () => { void escribir(usaPapelera ? 'PATCH' : 'DELETE', usaPapelera ? { active: false } : undefined) } }
      : { clave: 'reactivar', etiqueta: 'Reactivar', icono: RotateCcw, onSeleccionar: () => { void escribir('PATCH', { active: true }) } }
    const borrado: AccionDeBorrado | undefined = puedeBorrar && !activo
      ? {
          titulo: accion,
          etiquetaConfirmar: accion,
          advertencia,
          confirmacionEscrita: usaPapelera ? undefined : confirmacion,
          contenidoExtra: extra?.control,
          deshabilitadoExtra: extra !== undefined && extra.consulta === null,
          tamano: tamano === 'chico' ? 'chico' : 'medio',
          alAbrir: () => { setFallo(null); alAbrirBorrado?.() },
          onConfirmar: eliminarDefinitivo
        }
      : undefined

    return (
      <>
        {(puedeEditar || borrado !== undefined) && (
          <MenuAccionesFila
            ariaLabel={`Más acciones de ${nombre}`}
            cargando={enCurso}
            acciones={puedeEditar ? [cambioDeEstado] : []}
            borrado={borrado}
          />
        )}
        {avisoDeFallo}
      </>
    )
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

      {avisoDeFallo}

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
