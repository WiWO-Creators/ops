'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus } from 'lucide-react'
import { pedirSobre } from '@/datos/cliente'
import type { Prospecto } from '@/datos/recursos'
import { coincidenciasDeEmpresa, terminoDeBusqueda } from '@/dominio/prospecto-existente'
import { cn } from '@/lib/clases'

/** Espera tras la última tecla antes de consultar, para no pedir una búsqueda por letra. */
const ESPERA_BUSQUEDA_MS = 250
/** Se pide algo más que lo que se muestra: el navegador vuelve a filtrar y ordenar. */
const POR_PAGINA = 10

type ProspectoEncontrado = Pick<Prospecto, 'id' | 'empresa' | 'licitaciones_total'>

type Respuesta = { termino: string, prospectos: ProspectoEncontrado[] } | { termino: string, mensaje: string }

interface PropsSugerencias {
  /** Lo escrito en el campo Empresa del paso Prospecto. */
  texto: string
  /** Mientras hay una escritura en vuelo no se puede elegir nada. */
  deshabilitado: boolean
  /** Se eligió un prospecto que ya existe: el flujo lo toma en vez de crear uno. */
  alUsarExistente: (prospecto: ProspectoEncontrado) => void
}

/**
 * Busca en `GET /prospectos` los que ya tienen la empresa que se está escribiendo.
 *
 * @param texto lo escrito; con vacío o un carácter no consulta
 * @returns la última respuesta que corresponde al término vigente, o `null` mientras no hay una
 */
function useProspectosParecidos (texto: string): { termino: string | null, respuesta: Respuesta | null } {
  const termino = terminoDeBusqueda(texto)
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)

  useEffect(() => {
    if (termino === null) return

    const control = new AbortController()
    const espera = window.setTimeout(() => {
      const parametros = new URLSearchParams({ q: termino, per_page: String(POR_PAGINA), fields: 'id,empresa,licitaciones_total' })
      pedirSobre<ProspectoEncontrado[]>(`prospectos?${parametros.toString()}`, control.signal)
        .then((sobre) => { setRespuesta({ termino, prospectos: Array.isArray(sobre.data) ? sobre.data : [] }) })
        .catch((fallo: unknown) => {
          if (control.signal.aborted) return
          setRespuesta({ termino, mensaje: fallo instanceof Error ? fallo.message : 'No se pudo buscar prospectos.' })
        })
    }, ESPERA_BUSQUEDA_MS)

    return () => {
      window.clearTimeout(espera)
      control.abort()
    }
  }, [termino])

  return { termino, respuesta: respuesta !== null && respuesta.termino === termino ? respuesta : null }
}

/**
 * Autocompletado de la Empresa en el alta de licitación: ofrece usar un prospecto que ya existe.
 *
 * Existe porque el alta creaba siempre un prospecto nuevo, y así se duplicaron SERNATUR y «Puerto
 * San Antonio / EPSA». La coincidencia ignora mayúsculas, acentos y espacios de borde.
 *
 * «Crear nuevo prospecto» sólo se ofrece cuando ninguna empresa es exactamente la escrita: la API
 * rechaza el duplicado con 422, así que ofrecerlo sería ofrecer un error. Elegirlo sólo cierra la
 * lista; el alta sigue por «Guardar y continuar», como siempre. Si no aparece ninguna empresa, la
 * lista queda sólo con esa opción, para que quede claro que se revisó y no hay duplicado.
 */
export function SugerenciasDeProspecto ({ texto, deshabilitado, alUsarExistente }: PropsSugerencias) {
  const { termino, respuesta } = useProspectosParecidos(texto)
  const [descartado, setDescartado] = useState<string | null>(null)

  if (termino === null || descartado === termino) return null
  if (respuesta === null) return <p role="status" className="text-texto-sutil text-sm sm:col-span-2">Buscando prospectos parecidos…</p>
  if ('mensaje' in respuesta) return <p role="status" className="text-texto-sutil text-sm sm:col-span-2">No se pudo revisar si la empresa ya existe: {respuesta.mensaje}</p>

  const { sugerencias, exacta } = coincidenciasDeEmpresa(respuesta.prospectos, texto)
  const aviso = exacta !== null ? 'Ya existe un prospecto con esa empresa.'
    : sugerencias.length > 0 ? 'Hay prospectos parecidos.' : 'No hay prospectos con esa empresa.'
  const opcion = 'rounded-control hover:bg-hover flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div role="group" aria-label="Prospectos que ya existen" className="border-linea bg-superficie rounded-medio flex flex-col gap-1 border p-2 sm:col-span-2">
      <p role="status" className="text-texto-tenue px-3 pb-1 pt-1 text-xs font-semibold">
        {aviso}
      </p>
      {sugerencias.map((prospecto) => (
        <button key={prospecto.id} type="button" disabled={deshabilitado} onClick={() => { alUsarExistente(prospecto) }}
          className={cn(opcion, prospecto.id === exacta?.id && 'bg-hover')}>
          <Building2 size={18} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
          <span className="min-w-0 flex-1 truncate">Usar prospecto existente: <strong className="font-semibold">{prospecto.empresa}</strong></span>
          {prospecto.licitaciones_total > 0 && (
            <span className="text-texto-sutil shrink-0 text-xs">
              {prospecto.licitaciones_total} {prospecto.licitaciones_total === 1 ? 'licitación' : 'licitaciones'}
            </span>
          )}
        </button>
      ))}
      {exacta === null && (
        <button type="button" disabled={deshabilitado} onClick={() => { setDescartado(termino) }} className={opcion}>
          <Plus size={18} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
          <span className="min-w-0 flex-1 truncate">Crear nuevo prospecto: <strong className="font-semibold">{texto.trim()}</strong></span>
        </button>
      )}
    </div>
  )
}
