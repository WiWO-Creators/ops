'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { urlDeTareaEnProyecto } from '@/componentes/datos/tabla'
import {
  agruparPorVeredicto,
  ETIQUETA_VEREDICTO,
  filtrarTareas,
  mensajeDeFalloIa,
  MOTIVO_IA_SCOPE,
  ORDEN_VEREDICTOS,
  textoAnalizando,
  TONO_VEREDICTO,
  type FiltroVeredicto
} from '@/dominio/scope'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoIa } from '@/dominio/ajustes'
import { rutasDeScope, type AnalisisScope, type TareaAnalizada } from '@/datos/scope'

/**
 * El analisis de las Tareas del Proyecto contra el Scope guardado.
 *
 * El boton lo puede apretar cualquiera que vea el Proyecto (el contrato no pide `edit`), pero solo
 * con un Scope guardado: sin Scope no hay contra que comparar y la API contesta 409. La espera se
 * dice con el numero de Tareas y un cronometro, porque el modelo clasifica en lotes y puede tardar
 * un minuto: un boton que gira sin decir por que parece colgado.
 *
 * El resultado se lee de a grupos —primero lo que queda fuera, que es lo que hay que conversar con
 * el cliente— y cada Tarea abre su detalle en la pestaña Tareas.
 */

interface PropsAnalisisScope {
  proyectoId: number
  analisis: AnalisisScope | null
  hayScope: boolean
  ia: EstadoIa
  onAnalizado: (analisis: AnalisisScope) => void
}

export function AnalisisDelScope ({ proyectoId, analisis, hayScope, ia, onAnalizado }: PropsAnalisisScope): ReactElement {
  const [analizando, setAnalizando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Solo corre mientras se espera: un intervalo vivo con el panel quieto es trabajo por nada.
  useEffect(() => {
    if (!analizando) return

    const inicio = Date.now()
    const reloj = window.setInterval(() => { setSegundos(Math.floor((Date.now() - inicio) / 1000)) }, 1000)

    return () => { window.clearInterval(reloj) }
  }, [analizando])

  /** Lanza el analisis y entrega el resultado al panel. */
  async function analizar (): Promise<void> {
    if (!ia.activa) {
      const motivo = MOTIVO_IA_SCOPE[ia.motivo]
      setError(`${motivo.titulo} ${motivo.ayuda}`)
      return
    }

    setAnalizando(true)
    setSegundos(0)
    setError(null)

    const resultado = await escribirEnBff<AnalisisScope>(rutasDeScope(proyectoId).analizar, 'POST')

    setAnalizando(false)

    if (!resultado.ok) {
      setError(mensajeDeFalloIa(resultado, 'analizar'))
      return
    }

    onAnalizado(resultado.datos)
  }

  return (
    <section
      aria-labelledby="titulo-analisis-scope"
      className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-4 border p-4"
    >
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="titulo-analisis-scope" className="text-texto text-base font-semibold">
            Análisis de {GLOSARIO.proceso.plural.toLowerCase()}
          </h2>
          <p className="text-texto-sutil text-xs">
            La IA revisa cada {GLOSARIO.proceso.singular.toLowerCase()} del {GLOSARIO.espacio.singular.toLowerCase()} y dice si está dentro, fuera o si es dudosa respecto del {GLOSARIO.scope.singular.toLowerCase()}.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!ia.activa && <Insignia tono="aviso" tamano="chico">{MOTIVO_IA_SCOPE[ia.motivo].chip}</Insignia>}
          <Boton
            variante="primario"
            tamano="chico"
            cargando={analizando}
            disabled={!hayScope}
            title={hayScope ? undefined : `Primero hay que guardar el ${GLOSARIO.scope.singular.toLowerCase()}.`}
            onClick={() => { void analizar() }}
          >
            {analisis === null ? 'Analizar' : 'Volver a analizar'} {GLOSARIO.scope.singular.toLowerCase()}
          </Boton>
        </div>
      </header>

      {analizando && (
        <p role="status" className="border-linea bg-superficie-hundida text-texto rounded-tarjeta border px-3 py-2 text-sm">
          {textoAnalizando(analisis?.conteo.total ?? null)} <span className="text-texto-tenue">({segundos} s — puede tardar hasta un minuto)</span>
        </p>
      )}

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      {!hayScope && analisis === null && (
        <p className="text-texto-tenue text-sm">
          Cuando el {GLOSARIO.scope.singular.toLowerCase()} esté guardado se podrá analizar.
        </p>
      )}

      {hayScope && analisis === null && !analizando && (
        <p className="text-texto-tenue text-sm">
          Todavía no se analizó este {GLOSARIO.espacio.singular.toLowerCase()}.
        </p>
      )}

      {analisis !== null && <ResultadoAnalisis proyectoId={proyectoId} analisis={analisis} />}
    </section>
  )
}

interface PropsResultado {
  proyectoId: number
  analisis: AnalisisScope
}

/** Conteos, resumen y la lista de Tareas filtrable. */
function ResultadoAnalisis ({ proyectoId, analisis }: PropsResultado): ReactElement {
  const [filtro, setFiltro] = useState<FiltroVeredicto>('todas')
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(
    () => filtrarTareas(analisis.tareas, filtro, busqueda),
    [analisis.tareas, filtro, busqueda]
  )
  const grupos = useMemo(() => agruparPorVeredicto(visibles), [visibles])
  const { conteo } = analisis

  const opciones = [
    { valor: 'todas', etiqueta: `Todas (${conteo.total})` },
    ...ORDEN_VEREDICTOS.map((veredicto) => ({ valor: veredicto, etiqueta: `${ETIQUETA_VEREDICTO[veredicto]} (${conteo[veredicto]})` }))
  ]

  return (
    <div className="flex flex-col gap-4">
      {analisis.scope_desactualizado && (
        <p role="status" className="border-linea bg-superficie-aviso text-texto-aviso rounded-tarjeta border px-3 py-2 text-sm">
          El {GLOSARIO.scope.singular.toLowerCase()} cambió después de este análisis: los veredictos pueden no valer. Vuelve a analizar.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Conteo rotulo={GLOSARIO.proceso.plural} valor={conteo.total} />
        {ORDEN_VEREDICTOS.map((veredicto) => (
          <Conteo key={veredicto} rotulo={ETIQUETA_VEREDICTO[veredicto]} valor={conteo[veredicto]} tono={TONO_VEREDICTO[veredicto]} />
        ))}
      </dl>

      {analisis.resumen.trim() !== '' && <p className="text-texto text-sm leading-relaxed whitespace-pre-line">{analisis.resumen}</p>}

      <p className="text-texto-sutil text-xs">
        Analizado el <Fecha valor={analisis.creado_en} conHora />
        {analisis.creado_por !== null && <> por {analisis.creado_por.nombre}</>}.
      </p>

      {conteo.total === 0
        ? <p className="text-texto-tenue text-sm">Este {GLOSARIO.espacio.singular.toLowerCase()} no tenía {GLOSARIO.proceso.plural.toLowerCase()} que analizar.</p>
        : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Segmentado
                etiqueta="Filtrar por veredicto"
                tamano="chico"
                opciones={opciones}
                activo={filtro}
                onElegir={(valor) => { setFiltro(valor as FiltroVeredicto) }}
              />
              <Entrada
                type="search"
                value={busqueda}
                aria-label={`Buscar en las ${GLOSARIO.proceso.plural.toLowerCase()} analizadas`}
                placeholder="Buscar…"
                className="h-8 max-w-60"
                onChange={(evento) => { setBusqueda(evento.target.value) }}
              />
            </div>

            {grupos.length === 0 && <p className="text-texto-tenue text-sm">Nada coincide con ese filtro.</p>}

            {grupos.map((grupo) => (
              <section key={grupo.veredicto} aria-label={ETIQUETA_VEREDICTO[grupo.veredicto]} className="flex flex-col gap-2">
                <h3 className="text-texto flex items-center gap-2 text-sm font-semibold">
                  <Insignia tono={TONO_VEREDICTO[grupo.veredicto]} tamano="chico">{ETIQUETA_VEREDICTO[grupo.veredicto]}</Insignia>
                  <span className="text-texto-sutil text-xs font-normal">{grupo.tareas.length}</span>
                </h3>
                <ul className="border-linea rounded-tarjeta divide-linea flex flex-col divide-y border">
                  {grupo.tareas.map((tarea) => <FilaTarea key={tarea.task_id} proyectoId={proyectoId} tarea={tarea} />)}
                </ul>
              </section>
            ))}
          </>
          )}
    </div>
  )
}

/** El color del numero de cada tono: el de las dos que importan se lee de lejos. */
const TINTA_DEL_CONTEO = {
  peligro: 'text-texto-peligro',
  aviso: 'text-texto-aviso',
  exito: 'text-texto-exito'
} as const

/** Un numero del resumen del analisis. */
function Conteo ({ rotulo, valor, tono }: { rotulo: string, valor: number, tono?: keyof typeof TINTA_DEL_CONTEO }): ReactElement {
  const tinta = tono === undefined || valor === 0 ? 'text-texto' : TINTA_DEL_CONTEO[tono]

  return (
    <div className="border-linea rounded-tarjeta flex flex-col gap-1 border px-3 py-2">
      <dt className="text-texto-tenue text-xs">{rotulo}</dt>
      <dd className={`${tinta} text-xl font-semibold tabular-nums`}>{valor}</dd>
    </div>
  )
}

/** Una Tarea analizada: enlace a su detalle, motivo y el item del Scope en que se apoya. */
function FilaTarea ({ proyectoId, tarea }: { proyectoId: number, tarea: TareaAnalizada }): ReactElement {
  const enlace = urlDeTareaEnProyecto(tarea.task_id, proyectoId)

  return (
    <li className="flex flex-col gap-1 px-3 py-2">
      {enlace === null
        ? <span className="text-texto text-sm font-medium">{tarea.nombre}</span>
        : (
          <Link href={enlace} className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline">
            {tarea.nombre}
          </Link>
          )}
      {tarea.motivo.trim() !== '' && <p className="text-texto-tenue text-sm">{tarea.motivo}</p>}
      {tarea.referencia !== null && tarea.referencia.trim() !== '' && (
        <p className="text-texto-sutil text-xs">Según el {GLOSARIO.scope.singular.toLowerCase()}: «{tarea.referencia}»</p>
      )}
    </li>
  )
}
