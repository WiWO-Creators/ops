'use client'

import { Eraser } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactElement } from 'react'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { PARAMETRO_TAREA, urlConParametro } from '@/componentes/datos/tabla'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { EVENTO_TAREAS_CAMBIADAS } from '@/datos/refresco-lista'
import type { Yo } from '@/datos/tipos'
import { rutaDeCopias, situacionDeCopia, textosDeMotivos, type CopiaDeRegla } from '@/dominio/copias-recurrencia'
import { formatearFecha } from '@/lib/fechas'
import { LimpiezaDeCopias, type ReglaALimpiar } from './LimpiezaDeCopias'

/**
 * Si quien mira es administrador. Si quien monta el componente ya lo sabe, lo pasa y no se pide
 * nada; si no —la ficha de una Tarea no lo sabe—, se pregunta una vez a `/me`. Mientras no llega,
 * vale `false`: esconder un boton un instante es mejor que mostrarlo a quien la API va a rechazar.
 *
 * @param conocido lo que ya se sabe, o undefined
 */
export function useEsAdministrador (conocido?: boolean): boolean {
  const [pedido, setPedido] = useState(false)

  useEffect(() => {
    if (conocido !== undefined) return
    let vigente = true
    void leerDelBff<Yo>('me').then((resultado) => {
      if (vigente && resultado.ok) setPedido(resultado.datos.is_admin || resultado.datos.is_superadmin)
    })

    return () => { vigente = false }
  }, [conocido])

  return conocido ?? pedido
}

/**
 * El historial de copias de una recurrencia: cada Tarea que genero, si alguien la uso y por que.
 *
 * Es la constancia que faltaba: hasta aca la regla decia "3 copias" y no cuales. Cada copia enlaza a
 * su ficha (el mismo `?tarea=` de los listados). Un administrador puede abrir desde aca la limpieza
 * de las que nadie toco.
 *
 * @param regla la regla, o null con el dialogo cerrado
 * @param esAdmin si se sabe; si no, se pregunta a `/me`
 * @param onCerrar se llama al cerrar
 */
export function HistorialDeCopias ({ regla, esAdmin, onCerrar }: {
  regla: ReglaALimpiar | null
  esAdmin?: boolean
  onCerrar: () => void
}): ReactElement {
  const administra = useEsAdministrador(esAdmin)
  const [aLimpiar, setALimpiar] = useState<ReglaALimpiar | null>(null)

  return (
    <>
      <Dialogo open={regla !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
        {regla !== null && (
          <ContenidoDialogo titulo="Copias generadas" descripcion={regla.name} ancho="grande" cerrable>
            <ListaDeCopias key={regla.id} regla={regla} onAbrirTarea={onCerrar} />
            {administra && (
              <div className="border-linea mt-4 flex justify-end border-t pt-4">
                <Boton variante="secundario" tamano="chico" onClick={() => { setALimpiar(regla) }}>
                  <Eraser size={14} aria-hidden="true" />
                  Limpiar copias sin uso
                </Boton>
              </div>
            )}
          </ContenidoDialogo>
        )}
      </Dialogo>
      <LimpiezaDeCopias regla={aLimpiar} onCerrar={() => { setALimpiar(null) }} />
    </>
  )
}

type Carga = { fase: 'cargando' } | { fase: 'error', mensaje: string } | { fase: 'lista', copias: CopiaDeRegla[] }

/**
 * La lista, que se vuelve a pedir con `ops:tareas-cambiadas`: tras una limpieza las copias pasan a
 * "En papelera" sin cerrar el dialogo.
 */
function ListaDeCopias ({ regla, onAbrirTarea }: { regla: ReglaALimpiar, onAbrirTarea: () => void }): ReactElement {
  const params = useSearchParams()
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    void leerDelBff<CopiaDeRegla[]>(rutaDeCopias(regla.id)).then((resultado) => {
      if (!vigente) return
      setCarga(resultado.ok ? { fase: 'lista', copias: resultado.datos } : { fase: 'error', mensaje: resultado.mensaje })
    })

    return () => { vigente = false }
  }, [regla.id, intento])

  useEffect(() => {
    const recargar = (): void => { setIntento((n) => n + 1) }
    window.addEventListener(EVENTO_TAREAS_CAMBIADAS, recargar)

    return () => { window.removeEventListener(EVENTO_TAREAS_CAMBIADAS, recargar) }
  }, [])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-32" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={() => { setIntento((n) => n + 1) }} />
  if (carga.copias.length === 0) return <p className="text-texto-tenue text-sm">Esta recurrencia todavía no generó ninguna copia.</p>

  const sinMovimiento = carga.copias.filter((copia) => !copia.deleted && copia.evaluable && !copia.touched).length

  return (
    <div className="flex flex-col gap-3">
      <p className="text-texto-tenue text-sm">
        {carga.copias.length === 1 ? '1 copia' : `${carga.copias.length} copias`}, de la más nueva a la más vieja.
        {sinMovimiento > 0 && ` ${sinMovimiento} sin movimiento.`}
      </p>
      <ul aria-label="Copias" className="border-linea divide-linea rounded-tarjeta flex flex-col divide-y border">
        {carga.copias.map((copia) => {
          const situacion = situacionDeCopia(copia)
          const motivos = textosDeMotivos(copia.touched_reasons)

          return (
            <li key={copia.id} className="grid grid-cols-1 items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 flex-col gap-0.5">
                {copia.deleted
                  ? <span className="text-texto-tenue truncate text-sm">{copia.name}</span>
                  : (
                    <Link
                      href={urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TAREA, String(copia.id))}
                      scroll={false}
                      onClick={onAbrirTarea}
                      className="text-texto hover:text-acento truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {copia.name}
                    </Link>
                    )}
                <span className="text-texto-sutil text-xs">
                  {copia.start_date === null ? `Creada el ${formatearFecha(copia.created_at)}` : `Del ${formatearFecha(copia.start_date)}`}
                  {copia.due_date !== null && ` · vence el ${formatearFecha(copia.due_date)}`}
                  {motivos.length > 0 && ` · ${motivos.join(', ')}`}
                </span>
              </div>
              <Insignia tono={situacion.tono} className="justify-self-start sm:justify-self-end">{situacion.etiqueta}</Insignia>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
