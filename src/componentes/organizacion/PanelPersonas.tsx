'use client'

import { Suspense, useMemo } from 'react'
import { Download } from 'lucide-react'
import { nombreDeExportacion } from '@/componentes/datos/csv'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ESCALONES, etiquetaDeEscalon, ordenDeEscalon } from '@/dominio/escalon'
import {
  csvDePersonas, filtrarPersonas, FILTROS_DE_ROL, type FiltrosDePersonas, type SaludDeOrganizacion
} from '@/dominio/organizacion'
import { BarraDeLote } from './BarraDeLote'
import { SIN_VALOR } from './piezas'
import type { CatalogoDeAccesos, PersonaDeAccesos } from '@/datos/accesos'
import type { Columna, DefinicionRecurso, ResultadoLista } from '@/definiciones/tipos'

/** Sin filas que ordenar ni paginar: `ResultadoLista` vacío, ignorado por el modo memoria de `TablaRecurso`. */
const SIN_RESULTADO: ResultadoLista<PersonaDeAccesos> = { filas: [], paginacion: undefined }

/** Los filtros sin nada puesto. */
export const SIN_FILTROS: FiltrosDePersonas = { buscar: '', escalon: '', area: '', cargo: '', problema: '', rol: '' }

interface PropsPanelPersonas {
  catalogo: CatalogoDeAccesos
  /** El listado completo, o `null` mientras llega. */
  personas: PersonaDeAccesos[] | null
  error: string | null
  salud: SaludDeOrganizacion
  filtros: FiltrosDePersonas
  onFiltros: (filtros: FiltrosDePersonas) => void
  actorId: number
  onElegir: (persona: PersonaDeAccesos) => void
  onCambio: () => void
  onReintentar: () => void
}

/**
 * Quién es quién: el listado de personas, para leerlo, filtrarlo y cambiar a varias de una vez.
 *
 * **La tabla ya no edita en la celda.** Antes cada fila traía seis controles, y cada uno guardaba en
 * el momento de elegir, sin vuelta atrás: una tabla de 180 filas así no se lee y un clic de más cambia
 * lo que ve medio equipo. Ahora la fila se lee, el clic abre el panel de la persona —donde se edita
 * todo junto y se guarda con un botón— y las casillas permiten cambiar a varias a la vez.
 *
 * Filtra en el navegador y no en la API: el listado entero ya está en memoria —lo comparte con el
 * organigrama y la salud—, así que buscar mientras se escribe no cuesta una consulta por tecla. Los
 * filtros viven en quien monta el panel, para que los contadores de salud puedan poner uno.
 */
export function PanelPersonas (props: PropsPanelPersonas) {
  // `TablaRecurso` lee `useSearchParams`: sin este límite de Suspense falla el build.
  return (
    <Suspense fallback={<Cargando alto="min-h-56" mensaje="Cargando las personas…" />}>
      <CuerpoDePanelPersonas {...props} />
    </Suspense>
  )
}

function CuerpoDePanelPersonas ({
  catalogo, personas, error, salud, filtros, onFiltros, actorId, onElegir, onCambio, onReintentar
}: PropsPanelPersonas) {
  const filas = useMemo(
    () => personas === null ? [] : filtrarPersonas(personas, filtros, salud),
    [personas, filtros, salud]
  )

  const definicion = useMemo(() => definicionDePersonas(catalogo), [catalogo])
  const hayFiltros = Object.values(filtros).some((valor) => valor !== '')

  /** Cambia un filtro y conserva los demás. */
  function filtrar (cambio: Partial<FiltrosDePersonas>): void {
    onFiltros({ ...filtros, ...cambio })
  }

  /** Baja lo que se está viendo, con los filtros puestos, como CSV. */
  function exportar (): void {
    const texto = csvDePersonas(filas, catalogo.areas, catalogo.cargos)
    // El BOM hace que Excel lea las tildes como UTF-8 y no como Latin-1.
    const archivo = new Blob([`\uFEFF${texto}`], { type: 'text/csv;charset=utf-8' })
    const enlace = document.createElement('a')

    enlace.href = URL.createObjectURL(archivo)
    enlace.download = nombreDeExportacion('personas-organizacion', new Date())
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  if (error !== null) return <ErrorEstado detalle={error} onReintentar={onReintentar} />
  if (personas === null) return <Cargando alto="min-h-56" mensaje="Cargando las personas…" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Entrada
          type="search"
          value={filtros.buscar}
          placeholder="Buscar por nombre o correo"
          aria-label="Buscar una persona"
          className="w-64"
          onChange={(evento) => { filtrar({ buscar: evento.target.value }) }}
        />
        <Filtro
          etiqueta="Todos los escalones"
          valor={filtros.escalon}
          opciones={ESCALONES.map((uno) => ({ valor: uno.clave, etiqueta: uno.nombre }))}
          onCambiar={(valor) => { filtrar({ escalon: valor }) }}
        />
        <Filtro
          etiqueta="Todas las áreas"
          valor={filtros.area}
          opciones={catalogo.areas.map((uno) => ({ valor: String(uno.id), etiqueta: uno.nombre }))}
          onCambiar={(valor) => { filtrar({ area: valor }) }}
        />
        <Filtro
          etiqueta="Todos los cargos"
          valor={filtros.cargo}
          opciones={catalogo.cargos.map((uno) => ({ valor: String(uno.id), etiqueta: uno.nombre }))}
          onCambiar={(valor) => { filtrar({ cargo: valor }) }}
        />
        <Filtro
          etiqueta="Todos los roles"
          valor={filtros.rol}
          opciones={[...FILTROS_DE_ROL]}
          onCambiar={(valor) => { filtrar({ rol: valor }) }}
        />
        {hayFiltros && <Boton variante="sutil" onClick={() => { onFiltros(SIN_FILTROS) }}>Quitar los filtros</Boton>}

        <Boton variante="secundario" className="ms-auto" disabled={filas.length === 0} onClick={exportar}>
          <Download aria-hidden="true" className="size-4" />
          Exportar CSV
        </Boton>
      </div>

      <p className="text-texto-tenue text-sm" aria-live="polite">
        {filas.length} {filas.length === 1 ? 'persona' : 'personas'}{hayFiltros ? ' con estos filtros' : ' activas'}.
        {' '}Haz clic en una para editarla, o marca varias para cambiarlas juntas.
      </p>

      <TablaRecurso<PersonaDeAccesos>
        definicion={definicion}
        inicial={SIN_RESULTADO}
        datos={filas}
        claveFila={(persona) => persona.staffid}
        alCliquearFila={onElegir}
        seleccionMasiva={(elegidas, limpiar) => elegidas.length === 0
          ? null
          : (
            <BarraDeLote
              elegidas={elegidas}
              limpiar={limpiar}
              catalogo={catalogo}
              personas={personas}
              actorId={actorId}
              onAplicado={onCambio}
            />
            )}
      />
    </div>
  )
}

/**
 * La tabla, de solo lectura: el nombre con sus insignias de rol, el puesto, de quién cuelga, el área
 * y el cargo. Todo se edita en el panel.
 */
function definicionDePersonas (catalogo: CatalogoDeAccesos): DefinicionRecurso<PersonaDeAccesos> {
  const nombreDeArea = new Map(catalogo.areas.map((area) => [area.id, area.nombre]))
  const nombreDeCargo = new Map(catalogo.cargos.map((cargo) => [cargo.id, cargo.nombre]))

  const columnas: Array<Columna<PersonaDeAccesos>> = [
    {
      clave: 'persona',
      encabezado: 'Persona',
      ordenPor: 'nombre',
      presentar: (persona) => (
        <span className="flex flex-col">
          <span className="text-texto flex flex-wrap items-center gap-1.5">
            {persona.nombre}
            {persona.is_superadmin && <Insignia tono="acento" tamano="chico">Superadmin</Insignia>}
            {persona.is_admin && !persona.is_superadmin && <Insignia tono="neutro" tamano="chico">Admin</Insignia>}
            {persona.coordinador_multiarea && <Insignia tono="contorno" tamano="chico">Multiárea</Insignia>}
            {!persona.activo && <Insignia tono="contorno" tamano="chico">De baja</Insignia>}
          </span>
          <span className="text-texto-tenue text-xs">{persona.correo}</span>
        </span>
      )
    },
    {
      clave: 'escalon',
      encabezado: 'Escalón',
      ordenPor: 'escalon',
      // Por la escalera y no por el alfabeto: "director" iría antes que "lead" y "staff".
      ordenarCon: (a, b) => ordenDeEscalon(a.escalon) - ordenDeEscalon(b.escalon),
      presentar: (persona) => etiquetaDeEscalon(persona.escalon)
    },
    {
      clave: 'jefe',
      encabezado: 'A cargo de',
      ordenPor: 'jefe_nombre',
      presentar: (persona) => persona.jefe_nombre ?? <span className="text-texto-sutil">Sin jefe directo</span>
    },
    {
      clave: 'area',
      encabezado: 'Área',
      presentar: (persona) => persona.area_id === null
        ? <span className="text-texto-sutil">Sin área</span>
        : nombreDeArea.get(persona.area_id) ?? `Área ${persona.area_id}`
    },
    {
      clave: 'cargo',
      encabezado: 'Cargo',
      presentar: (persona) => persona.cargo_id === null
        ? <span className="text-texto-sutil">—</span>
        : nombreDeCargo.get(persona.cargo_id) ?? `Cargo ${persona.cargo_id}`
    }
  ]

  return {
    ruta: 'accesos/personas',
    titulo: { singular: 'Persona', plural: 'Personas' },
    columnas,
    filtros: [],
    ordenables: ['nombre', 'escalon', 'jefe_nombre'],
    ordenPorDefecto: 'nombre',
    busqueda: false,
    includes: []
  }
}

/** Un desplegable de filtro, con "todos" arriba. */
function Filtro ({
  etiqueta, valor, opciones, onCambiar
}: {
  etiqueta: string
  valor: string
  opciones: Array<{ valor: string, etiqueta: string }>
  onCambiar: (valor: string) => void
}) {
  return (
    <Selector
      value={valor === '' ? SIN_VALOR : valor}
      onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? '' : elegido) }}
    >
      <DisparadorSelector marcador={etiqueta} aria-label={etiqueta} className="w-44" />
      <ContenidoSelector>
        <Opcion value={SIN_VALOR}>{etiqueta}</Opcion>
        {opciones.map((opcion) => <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>)}
      </ContenidoSelector>
    </Selector>
  )
}
