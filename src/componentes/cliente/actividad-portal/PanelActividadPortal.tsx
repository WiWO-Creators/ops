'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import {
  RANGOS_DE_ACTIVIDAD,
  extremosDelRanking,
  rankingDeVistas,
  serieContinua,
  type ActividadDeCliente
} from '@/dominio/actividad-portal'
import { hoyLocal, sumarDias } from '@/lib/fechas'
import { BarrasDeVistas, Cifra, CifraDeFecha, ListaDeClicks, ProyectosMasMirados, RitmoDiario, TablaDeContactos } from './piezas'
import { useCoreografia } from './useCoreografia'

/** Filas por lado en "lo mas visto" y "lo menos visto". */
const FILAS_POR_LADO = 6

type Estado =
  | { fase: 'cargando' }
  | { fase: 'error', detalle: string }
  | { fase: 'listo', datos: ActividadDeCliente }

/**
 * Pestaña "Actividad del portal" de la ficha del Cliente: que hacen sus contactos cuando entran.
 *
 * Pide `GET /clients/{id}/portal-activity` y lo cruza con el catalogo de todo lo que el portal
 * ofrece, para que lo que NUNCA se abrio tambien aparezca. Por defecto deja afuera lo que hizo el
 * equipo con "Ver como cliente": el uso que se mide es el del cliente.
 *
 * @param clienteId el cliente que se esta mirando
 */
export function PanelActividadPortal ({ clienteId }: { clienteId: number }) {
  const [dias, setDias] = useState<number>(30)
  const [conEquipo, setConEquipo] = useState(false)
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const raiz = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const control = new AbortController()
    const hasta = hoyLocal()
    const desde = sumarDias(hasta, -(dias - 1)) ?? hasta
    const consulta = `desde=${desde}&hasta=${hasta}${conEquipo ? '&suplantadas=1' : ''}`

    pedirSobre<ActividadDeCliente>(`clients/${clienteId}/portal-activity?${consulta}`, control.signal)
      .then(({ data }) => { setEstado({ fase: 'listo', datos: data }) })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setEstado({ fase: 'error', detalle: fallo instanceof Error ? fallo.message : 'No se pudo leer la actividad.' })
      })

    return () => { control.abort() }
  }, [clienteId, dias, conEquipo, intento])

  const cambiar = useCallback((accion: () => void) => {
    setEstado((previo) => (previo.fase === 'listo' ? previo : { fase: 'cargando' }))
    accion()
  }, [])

  const datos = estado.fase === 'listo' ? estado.datos : null
  const claveDeDatos = datos === null ? null : `${datos.desde}|${datos.hasta}|${datos.kpis.sesiones}|${conEquipo ? 1 : 0}`

  useCoreografia(raiz, claveDeDatos)

  const lectura = useMemo(() => {
    if (datos === null) return null
    const ranking = rankingDeVistas(datos.vistas)
    const { mas, menos } = extremosDelRanking(ranking, FILAS_POR_LADO)

    return {
      mas,
      menos,
      maximo: Math.max(0, ...ranking.map((f) => f.visitas)),
      serie: serieContinua(datos.desde, datos.hasta, datos.por_dia)
    }
  }, [datos])

  return (
    <div ref={raiz} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Segmentado
          etiqueta="Período"
          opciones={RANGOS_DE_ACTIVIDAD.map((d) => ({ valor: String(d), etiqueta: `${d} días` }))}
          activo={String(dias)}
          onElegir={(valor) => { cambiar(() => { setDias(Number(valor)) }) }}
        />
        <label className="text-texto-tenue flex items-center gap-2 text-sm">
          <Interruptor
            encendido={conEquipo}
            etiqueta="Incluir lo que hizo el equipo con Ver como cliente"
            deshabilitado={false}
            onPulsar={() => { cambiar(() => { setConEquipo((v) => !v) }) }}
          />
          Incluir lo que hizo el equipo con «Ver como cliente»
        </label>
      </div>

      {estado.fase === 'cargando' && <Cargando alto="min-h-64" mensaje="Leyendo la actividad…" />}

      {estado.fase === 'error' && (
        <ErrorEstado
          titulo="No se pudo leer la actividad"
          detalle={estado.detalle}
          onReintentar={() => { setEstado({ fase: 'cargando' }); setIntento((n) => n + 1) }}
        />
      )}

      {datos !== null && lectura !== null && datos.kpis.sesiones === 0 && (
        <Vacio
          titulo="Sin actividad en este período"
          descripcion={`Nadie de este cliente abrió el portal en los últimos ${dias} días. Prueba con un período más largo.`}
        />
      )}

      {datos !== null && lectura !== null && datos.kpis.sesiones > 0 && (
        <div className="flex flex-col gap-10">
          {datos.truncado && (
            <p className="text-texto-tenue text-sm">
              El período tiene más actividad de la que se lee de una vez: las cifras son de lo más reciente. Acorta el período para ver todo.
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4 lg:divide-linea lg:divide-x">
            <Cifra etiqueta="Sesiones" valor={datos.kpis.sesiones} formato="entero" />
            <Cifra
              etiqueta="Contactos activos"
              valor={datos.kpis.contactos_activos}
              formato="entero"
            />
            <Cifra
              etiqueta="Tiempo en el portal"
              valor={datos.kpis.segundos_activos}
              formato="duracion"
              nota={`Mediana por sesión: ${Math.max(1, Math.round(datos.kpis.mediana_segundos / 60))} min`}
            />
            <CifraDeFecha etiqueta="Última visita" valor={datos.kpis.ultima_visita} />
          </div>

          <section className="flex flex-col gap-3" aria-label="Ritmo diario">
            <h3 className="text-texto text-base font-semibold">Ritmo diario</h3>
            <RitmoDiario serie={lectura.serie} />
          </section>

          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <BarrasDeVistas
              titulo="Lo más visto"
              descripcion="Lo que más abren, por visitas."
              filas={lectura.mas}
              maximo={lectura.maximo}
              vacio="Todavía no hay vistas registradas."
            />
            <BarrasDeVistas
              titulo="Lo menos visto"
              descripcion="Lo que casi no abren, empezando por lo que nunca abrieron."
              filas={lectura.menos}
              maximo={lectura.maximo}
              vacio="Abrieron todo lo que el portal ofrece."
            />
          </div>

          <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <ProyectosMasMirados proyectos={datos.proyectos} />
            <ListaDeClicks clicks={datos.clicks} />
          </div>

          <TablaDeContactos clienteId={clienteId} contactos={datos.contactos} />
        </div>
      )}
    </div>
  )
}
