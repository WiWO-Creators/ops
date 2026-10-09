'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactElement } from 'react'
import { RefreshCw, Undo2 } from 'lucide-react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import type { AccionDeFila } from '@/componentes/datos/MenuAccionesFila'
import { useAviso } from '@/componentes/estado/useAviso'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { FUSIONES } from '@/definiciones/fusion'
import type { ResultadoLista } from '@/definiciones/tipos'
import {
  avisoDeOmitidas,
  etiquetaDeEstadoDeFusion,
  fichaDeEntidadFusionable,
  nombreDeEntidadFusionable,
  origenEstaEnPapelera,
  type FusionDelHistorial
} from '@/dominio/fusion'
import { deshacerFusion, reintentarArchivos } from './llamadas'

/** Tono de la insignia de cada estado. Un estado que el panel no conoce queda neutro. */
const TONO_DEL_ESTADO: Record<string, TonoInsignia> = {
  aplicada: 'exito',
  pendiente_archivos: 'aviso',
  revertida: 'contorno'
}

/** La fusion elegida para deshacer y como refrescar el listado cuando termina. */
interface Pendiente {
  fusion: FusionDelHistorial
  recargar: () => void
}

/**
 * El historial de fusiones, con "Deshacer" mientras el plazo no haya vencido.
 *
 * Vive del lado cliente de la frontera por la misma restriccion que las demas vistas: una
 * `DefinicionRecurso` esta llena de funciones y una funcion no cruza de un Server Component a uno
 * cliente. El destino se enlaza a su ficha; el origen no, porque esta en la Papelera y su ficha ya no
 * abre.
 *
 * @param inicial la primera pagina, resuelta en el servidor
 */
export function VistaFusiones ({ inicial }: { inicial: ResultadoLista<FusionDelHistorial> }): ReactElement {
  const aviso = useAviso()
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...FUSIONES,
    columnas: FUSIONES.columnas.map((columna) => {
      switch (columna.clave) {
        case 'fecha':
          return { ...columna, presentar: (f: FusionDelHistorial) => <Fecha valor={f.fecha} conHora /> }
        case 'entidad':
          return {
            ...columna,
            presentar: (f: FusionDelHistorial) => <Insignia tono="neutro" tamano="chico">{nombreDeEntidadFusionable(f.entidad)}</Insignia>
          }
        case 'destino':
          return {
            ...columna,
            presentar: (f: FusionDelHistorial) => (
              <Link
                href={fichaDeEntidadFusionable(f.entidad, f.destino.id)}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {f.destino.nombre}
              </Link>
            )
          }
        case 'staff':
          return {
            ...columna,
            presentar: (f: FusionDelHistorial) => f.staff === null
              ? <span className="text-texto-sutil">Sin registro</span>
              : <EnlacePersona id={f.staff.id} nombre={f.staff.full_name} tamano="chico" />
          }
        case 'estado':
          return {
            ...columna,
            presentar: (f: FusionDelHistorial) => (
              <Insignia tamano="chico" tono={TONO_DEL_ESTADO[f.estado] ?? 'neutro'}>{etiquetaDeEstadoDeFusion(f.estado)}</Insignia>
            )
          }
        default:
          return columna
      }
    })
  }), [])

  /**
   * "Deshacer fusión" mientras la API diga que se puede, y "Reintentar archivos" para la que dejo
   * archivos sin mover. Lo que no se puede, ni se ofrece.
   */
  function accionesDeFila (fusion: FusionDelHistorial, recargar: () => void): AccionDeFila[] {
    const acciones: AccionDeFila[] = []

    if (fusion.estado === 'pendiente_archivos') {
      acciones.push({
        clave: 'reintentar',
        etiqueta: 'Reintentar archivos',
        icono: RefreshCw,
        onSeleccionar: () => { void reintentar(fusion, recargar) }
      })
    }

    if (fusion.puede_revertir) {
      acciones.push({
        clave: 'deshacer',
        etiqueta: 'Deshacer fusión',
        icono: Undo2,
        onSeleccionar: () => { setPendiente({ fusion, recargar }) }
      })
    }

    return acciones
  }

  /** Vuelve a mover los archivos pendientes y avisa el resultado. Nunca lanza. */
  async function reintentar (fusion: FusionDelHistorial, recargar: () => void): Promise<void> {
    const resultado = await reintentarArchivos(fusion.id)

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)
      return
    }

    aviso.exito(`Se reintentó mover los archivos de «${fusion.origen.nombre}».`)
    recargar()
  }

  /**
   * Deshace la fusion elegida. Lanza si falla: `ConfirmarBorrado` muestra el mensaje y sigue abierto.
   * Si quedaron piezas sin devolver no es un fallo —ya se deshizo lo que se pudo—, es una advertencia.
   */
  async function deshacer (): Promise<void> {
    if (pendiente === null) return

    const { fusion, recargar } = pendiente
    const resultado = await deshacerFusion(fusion.id)

    if (!resultado.ok) throw new Error(resultado.mensaje)

    const omitidas = avisoDeOmitidas(resultado.datos?.omitidas ?? [])

    if (omitidas === null) aviso.exito(`Se deshizo la fusión: «${fusion.origen.nombre}» volvió.`)
    else aviso.advertencia(omitidas)

    recargar()
  }

  return (
    <>
      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(fusion) => fusion.id}
        accionesDeFila={accionesDeFila}
      />

      {pendiente !== null && (
        <ConfirmarBorrado
          abierto
          onCerrar={() => { setPendiente(null) }}
          tamano="chico"
          titulo="Deshacer fusión"
          advertencia={
            `«${pendiente.fusion.origen.nombre}» vuelve${origenEstaEnPapelera(pendiente.fusion.entidad) ? ' de la Papelera' : ''} ` +
            `y lo que se movió a «${pendiente.fusion.destino.nombre}» regresa a su lugar. Lo que ya cambió ` +
            'después de fusionar no se toca, y se te dice qué quedó sin devolver.'
          }
          etiquetaConfirmar="Deshacer fusión"
          onConfirmar={deshacer}
        />
      )}
    </>
  )
}
