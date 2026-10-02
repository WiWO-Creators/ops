'use client'

import { useEffect, useState } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { pedirSobre } from '@/datos/cliente'
import { CabeceraDePanel, SIN_VALOR } from './piezas'
import { ListaDeCambios } from './ListaDeCambios'
import { SelectorDePersona } from '@/componentes/formularios/SelectorDePersona'
import type { CambioDelHistorial, EntidadDelHistorial, PersonaDeAccesos } from '@/datos/accesos'

/** Cuántos cambios se piden por vez. */
const POR_PAGINA = 50

/** Los tipos de cambio que se pueden filtrar. */
const ENTIDADES: ReadonlyArray<{ valor: EntidadDelHistorial, etiqueta: string }> = [
  { valor: 'persona', etiqueta: 'Personas' },
  { valor: 'area', etiqueta: 'Áreas' },
  { valor: 'interruptor', etiqueta: 'Interruptor' }
]

interface FiltrosDelHistorial {
  entidad: EntidadDelHistorial | ''
  persona: number | null
  autor: number | null
}

interface PropsPanelHistorial {
  /** El listado completo, para elegir persona y autor por nombre. */
  personas: PersonaDeAccesos[] | null
  /** Cambia después de cada escritura de la pantalla: lo nuevo aparece sin recargar. */
  version: number
}

/**
 * Qué cambió en la organización, quién y cuándo: jefes, áreas, escalones, cargos, roles e interruptor.
 *
 * Contesta "¿quién movió a esta persona?" sin abrir la base. Los valores llegan ya redactados —el
 * nombre del área, no su id— porque se resuelven al escribir: así un área borrada sigue leyéndose.
 */
export function PanelHistorial ({ personas, version }: PropsPanelHistorial) {
  const [filtros, setFiltros] = useState<FiltrosDelHistorial>({ entidad: '', persona: null, autor: null })
  const [cambios, setCambios] = useState<CambioDelHistorial[] | null>(null)
  const [pagina, setPagina] = useState(1)
  const [paginas, setPaginas] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [pedido, setPedido] = useState({ filtros, version })

  // Filtros o datos nuevos arrancan de la primera página, sin pintar un instante la lista vieja.
  if (pedido.filtros !== filtros || pedido.version !== version) {
    setPedido({ filtros, version })
    setCambios(null)
    setPagina(1)
    setError(null)
  }

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<CambioDelHistorial[]>(`accesos/historial?${consulta(filtros, pagina)}`, control.signal)
      .then((sobre) => {
        setCambios((previos) => pagina === 1 || previos === null ? sobre.data : [...previos, ...sobre.data])
        setPaginas(sobre.meta?.pagination?.total_pages ?? 1)
      })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return
        setError(problema instanceof Error ? problema.message : 'No se pudo leer el historial.')
      })

    return () => { control.abort() }
  }, [filtros, pagina, version])

  const opciones = (personas ?? []).map((persona) => ({
    staffid: persona.staffid,
    nombre: persona.nombre,
    detalle: persona.activo ? undefined : 'De baja'
  }))

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Historial"
        descripcion="Cada cambio de jefe, área, escalón, cargo, rol o interruptor, con quién lo hizo y cuándo."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Selector
          value={filtros.entidad === '' ? SIN_VALOR : filtros.entidad}
          onValueChange={(valor) => { setFiltros({ ...filtros, entidad: valor === SIN_VALOR ? '' : valor as EntidadDelHistorial }) }}
        >
          <DisparadorSelector marcador="Todos los cambios" aria-label="Tipo de cambio" className="w-44" />
          <ContenidoSelector>
            <Opcion value={SIN_VALOR}>Todos los cambios</Opcion>
            {ENTIDADES.map((entidad) => <Opcion key={entidad.valor} value={entidad.valor}>{entidad.etiqueta}</Opcion>)}
          </ContenidoSelector>
        </Selector>
        <div className="w-56">
          <SelectorDePersona
            etiqueta="Cambios de esta persona"
            marcador="Sobre cualquier persona"
            opciones={opciones}
            valor={filtros.persona}
            onCambiar={(staffid) => { setFiltros({ ...filtros, persona: staffid }) }}
          />
        </div>
        <div className="w-56">
          <SelectorDePersona
            etiqueta="Hechos por"
            marcador="Hechos por cualquiera"
            opciones={opciones}
            valor={filtros.autor}
            onCambiar={(staffid) => { setFiltros({ ...filtros, autor: staffid }) }}
          />
        </div>
      </div>

      <ContenidoDelHistorial
        cambios={cambios}
        error={error}
        hayMas={pagina < paginas}
        onMas={() => { setPagina((previa) => previa + 1) }}
      />
    </div>
  )
}

/** La lista, o el estado que corresponda. */
function ContenidoDelHistorial ({
  cambios, error, hayMas, onMas
}: {
  cambios: CambioDelHistorial[] | null
  error: string | null
  hayMas: boolean
  onMas: () => void
}) {
  if (error !== null) return <ErrorEstado detalle={error} />
  if (cambios === null) return <Cargando alto="min-h-36" mensaje="Leyendo el historial…" />
  if (cambios.length === 0) {
    return <Vacio titulo="Sin cambios" descripcion="No hay cambios registrados con estos filtros." />
  }

  return (
    <div className="flex flex-col gap-3">
      <ListaDeCambios cambios={cambios} />
      {hayMas && <Boton variante="secundario" className="self-center" onClick={onMas}>Ver más</Boton>}
    </div>
  )
}

/** La query de `GET /accesos/historial`: solo los filtros puestos. */
function consulta (filtros: FiltrosDelHistorial, pagina: number): string {
  const parametros = new URLSearchParams({ page: String(pagina), per_page: String(POR_PAGINA) })

  if (filtros.entidad !== '') parametros.set('entidad', filtros.entidad)
  if (filtros.persona !== null) parametros.set('persona', String(filtros.persona))
  if (filtros.autor !== null) parametros.set('autor', String(filtros.autor))

  return parametros.toString()
}
