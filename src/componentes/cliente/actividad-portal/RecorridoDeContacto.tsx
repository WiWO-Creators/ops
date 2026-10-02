'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, Layers, MousePointerClick, Monitor, Smartphone, UserRoundCheck, type LucideIcon } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { pedirRespuesta, mensajeDeRespuesta } from '@/datos/cliente'
import { formatearDuracion, formatearHora, fraseDePaso, type PasoDeSesion, type SesionDeContacto } from '@/dominio/actividad-portal'
import { formatearFecha } from '@/lib/fechas'
import { useCoreografia } from './useCoreografia'

/**
 * Quita el click en una pestaña: su paso `pestana` ya dice lo mismo ("Abrió la pestaña Gantt") y con
 * la duración, así que dejar los dos duplica cada cambio de pestaña. El click sigue contando en
 * "Botones más pulsados".
 */
function pasosVisibles (pasos: PasoDeSesion[]): PasoDeSesion[] {
  return pasos.filter((p) => !(p.tipo === 'click' && p.objetivo?.startsWith('pestana.') === true))
}

const ICONOS: Record<PasoDeSesion['tipo'], LucideIcon> = {
  vista: Eye,
  pestana: Layers,
  click: MousePointerClick
}

/**
 * Las sesiones de un contacto como una linea de tiempo vertical: cada sesion dice cuando fue, cuanto
 * duro y desde que aparato, y se abre en los pasos que dio. La mas reciente viene abierta.
 *
 * Una sesion que abrio el equipo con "Ver como cliente" lleva el nombre de quien la abrio y solo
 * aparece si se pide: el recorrido que se lee es el del cliente.
 *
 * @param contactoId el contacto que se mira
 */
export function RecorridoDeContacto ({ contactoId }: { contactoId: number }) {
  const [filas, setFilas] = useState<SesionDeContacto[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [conEquipo, setConEquipo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const raiz = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const control = new AbortController()

    async function leer (): Promise<void> {
      setCargando(true)
      setError(null)

      try {
        const respuesta = await pedirRespuesta(
          `contacts/${contactoId}/portal-activity?pagina=${pagina}${conEquipo ? '&suplantadas=1' : ''}`,
          control.signal
        )

        if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta, { metodo: 'GET', ruta: 'contacts/portal-activity' }))

        const cuerpo = await respuesta.json() as { data: SesionDeContacto[], meta: { total: number, nombres: Record<string, string> } }

        setFilas((previas) => (pagina === 1 ? cuerpo.data : [...previas, ...cuerpo.data]))
        setNombres((previos) => ({ ...previos, ...cuerpo.meta.nombres }))
        setTotal(cuerpo.meta.total)
      } catch (fallo) {
        if (!control.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el recorrido.')
      } finally {
        if (!control.signal.aborted) setCargando(false)
      }
    }

    void leer()

    return () => { control.abort() }
  }, [contactoId, pagina, conEquipo, intento])

  useCoreografia(raiz, cargando || filas.length === 0 ? null : `${contactoId}|${conEquipo ? 1 : 0}|${filas.length}`)

  function alternarEquipo (): void {
    setFilas([])
    setPagina(1)
    setConEquipo((valor) => !valor)
  }

  return (
    <div ref={raiz} className="flex flex-col gap-6">
      <label className="text-texto-tenue flex w-fit items-center gap-2 text-sm">
        <Interruptor
          encendido={conEquipo}
          etiqueta="Incluir lo que hizo el equipo con Ver como cliente"
          deshabilitado={false}
          onPulsar={alternarEquipo}
        />
        Incluir lo que hizo el equipo con «Ver como cliente»
      </label>

      {error !== null && (
        <ErrorEstado
          titulo="No se pudo leer el recorrido"
          detalle={error}
          onReintentar={() => { setIntento((n) => n + 1) }}
        />
      )}

      {cargando && filas.length === 0 && error === null && <Cargando alto="min-h-48" mensaje="Leyendo las sesiones…" />}

      {!cargando && error === null && filas.length === 0 && (
        <Vacio
          titulo="Todavía no entró al portal"
          descripcion="Cuando abra el portal, cada sesión aparece acá con lo que miró y lo que pulsó."
        />
      )}

      {filas.length > 0 && (
        <ol className="relative flex flex-col gap-8 pl-8">
          <span aria-hidden="true" data-linea className="bg-linea absolute top-2 bottom-2 left-2.5 w-px origin-top" />
          {filas.map((sesion, i) => (
            <li key={sesion.sesion} data-entrada="item" className="relative">
              <span aria-hidden="true" className="bg-acento ring-superficie absolute top-1.5 -left-[1.6rem] size-3 rounded-full ring-4" />
              <details open={i === 0} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-texto font-semibold">{formatearFecha(sesion.inicio, true)}</span>
                  <span className="text-texto-tenue text-sm tabular-nums">{formatearDuracion(sesion.segundos)}</span>
                  <span className="text-texto-tenue inline-flex items-center gap-1 text-sm">
                    {sesion.dispositivo === 'movil' ? <Smartphone size={14} aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />}
                    {sesion.dispositivo === 'movil' ? 'Celular' : 'Computador'}
                  </span>
                  {sesion.suplantado_por !== null && (
                    <span className="bg-hover text-texto-tenue rounded-chico inline-flex items-center gap-1 px-2 py-0.5 text-xs">
                      <UserRoundCheck size={12} aria-hidden="true" />
                      Ver como cliente: {sesion.suplantado_por.full_name}
                    </span>
                  )}
                </summary>
                <ul className="border-linea mt-3 flex flex-col gap-2 border-l pl-4">
                  {pasosVisibles(sesion.pasos).length === 0 && <li className="text-texto-tenue text-sm">Sin pasos registrados.</li>}
                  {pasosVisibles(sesion.pasos).map((paso, j) => {
                    const Icono = ICONOS[paso.tipo]

                    return (
                      <li key={`${sesion.sesion}-${j}`} className="flex items-baseline gap-2 text-sm">
                        <Icono size={14} aria-hidden="true" className="text-texto-sutil relative top-0.5 shrink-0" />
                        <span className="text-texto min-w-0">{fraseDePaso(paso, nombres)}</span>
                        {paso.segundos !== null && paso.segundos > 0 && (
                          <span className="text-texto-tenue shrink-0 tabular-nums">{formatearDuracion(paso.segundos)}</span>
                        )}
                        <span className="text-texto-sutil ml-auto shrink-0 tabular-nums">{formatearHora(paso.a)}</span>
                      </li>
                    )
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}

      {filas.length > 0 && filas.length < total && (
        <Boton variante="secundario" cargando={cargando} onClick={() => { setPagina((p) => p + 1) }} className="self-start">
          Ver sesiones anteriores
        </Boton>
      )}
    </div>
  )
}
