'use client'

import { Search } from 'lucide-react'
import { Suspense, useEffect, useMemo, useState, type ReactElement } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { useParametroEnUrl } from '@/componentes/datos/useFiltrosEnUrl'
import { leerDelBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea, Cargando, Vacio } from '@/componentes/estado/Estados'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { LLAMADAS_MCP } from '@/definiciones/llamadas-mcp'
import type { ResultadoLista } from '@/definiciones/tipos'
import { FILTROS_DE_METODO, filtrarLlamadas, leerLlamadas } from '@/dominio/mcp-externo'
import type { LlamadaMcp } from '@/datos/accesos'

/** Sin filas que paginar: el modo memoria ignora `inicial`. */
const SIN_RESULTADO: ResultadoLista<LlamadaMcp> = { filas: [], paginacion: undefined }

/**
 * Las últimas 50 llamadas de un sistema: qué herramienta, a nombre de quién y cómo terminó.
 *
 * Es lo que responde «¿qué hizo Metriq ayer?». Los rechazos (401, 403, 429) y las decisiones remotas
 * quedan en la misma lista, con su motivo, su `request_id` y su `sid` para cruzarlos con los registros
 * del otro sistema. De los argumentos la API solo guarda una huella, así que acá no hay contenido.
 */
export function LlamadasMcp ({ integracionId }: { integracionId: number }): ReactElement {
  const [llamadas, setLlamadas] = useState<LlamadaMcp[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true

    void leerDelBff<unknown>(`accesos/integraciones/${integracionId}/mcp/llamadas`).then((resultado) => {
      if (!vigente) return

      if (resultado.ok) setLlamadas(leerLlamadas(resultado.datos))
      else setError(resultado.mensaje)
    })

    return () => { vigente = false }
  }, [integracionId])

  if (error !== null) return <AvisoEnLinea variante="error" mensaje={error} />
  if (llamadas === null) return <Cargando />
  if (llamadas.length === 0) return <Vacio titulo="Sin llamadas" descripcion="Cuando el sistema use Ops, sus llamadas aparecerán aquí." />

  return (
    <div className="border-linea border-t pt-4">
      {/* `TablaRecurso` y los filtros leen `useSearchParams`: sin este límite fallaría el build. */}
      <Suspense fallback={<Cargando />}>
        <ListaDeLlamadas llamadas={llamadas} prefijo={`mcp${integracionId}_`} />
      </Suspense>
    </div>
  )
}

/**
 * Los filtros y la tabla. Viven en la URL con el prefijo de la integración, porque varias filas de
 * Integraciones pueden tener abiertas sus llamadas a la vez.
 */
function ListaDeLlamadas ({ llamadas, prefijo }: { llamadas: LlamadaMcp[], prefijo: string }): ReactElement {
  const parametroMetodo = useParametroEnUrl('metodo', prefijo)
  const parametroBusqueda = useParametroEnUrl('buscar', prefijo)

  const metodo = FILTROS_DE_METODO.some((f) => f.valor === parametroMetodo.valor) ? String(parametroMetodo.valor) : 'todas'
  const busqueda = parametroBusqueda.valor ?? ''
  const visibles = useMemo(() => filtrarLlamadas(llamadas, metodo, busqueda), [llamadas, metodo, busqueda])

  function elegirMetodo (valor: string): void {
    if (valor === 'todas') parametroMetodo.quitar()
    else parametroMetodo.escribir(valor)
  }

  function escribirBusqueda (valor: string): void {
    if (valor === '') parametroBusqueda.quitar()
    else parametroBusqueda.escribir(valor)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado etiqueta="Filtrar por método" opciones={FILTROS_DE_METODO} activo={metodo} onElegir={elegirMetodo} />
        <div className="relative w-full sm:w-64">
          <Search aria-hidden="true" className="text-texto-sutil pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
          <Entrada
            type="search"
            value={busqueda}
            aria-label="Buscar por herramienta, motivo, request ID o sesión"
            placeholder="Herramienta, motivo, ID…"
            className="ps-9"
            onChange={(e) => { escribirBusqueda(e.target.value) }}
          />
        </div>
        <p role="status" aria-live="polite" className="text-texto-sutil text-xs tabular-nums">
          {visibles.length === llamadas.length ? `${llamadas.length} llamadas` : `${visibles.length} de ${llamadas.length} llamadas`}
        </p>
      </div>

      {visibles.length === 0
        ? <Vacio titulo="Nada coincide" descripcion="Prueba con otro método o con otro texto." />
        : (
          <TablaRecurso<LlamadaMcp>
            definicion={LLAMADAS_MCP}
            inicial={SIN_RESULTADO}
            datos={visibles}
            prefijoUrl={prefijo}
            claveFila={(fila) => fila.id}
          />
          )}
    </div>
  )
}
