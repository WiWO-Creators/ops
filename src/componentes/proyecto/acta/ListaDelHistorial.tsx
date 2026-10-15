'use client'

import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Vacio } from '@/componentes/estado/Estados'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  FILTROS_DE_HISTORIAL,
  accionDeRevision,
  contarPorFiltro,
  esOrigenDelAsistente,
  etiquetaDeOrigen,
  filtrarRevisiones,
  type FiltroDeHistorial,
  type RevisionDelActa
} from '@/dominio/historial-acta'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { cn } from '@/lib/clases'

interface PropsLista {
  revisiones: readonly RevisionDelActa[]
  filtro: FiltroDeHistorial
  onFiltrar: (filtro: FiltroDeHistorial) => void
  onElegir: (revision: RevisionDelActa) => void
}

/**
 * Los cambios del Meeting Paper, del más nuevo al más viejo, con la creación al final.
 *
 * El filtro separa lo que hizo el asistente de lo que hicieron las personas; cada opción lleva su
 * conteo para que se vea cuánto hay antes de pulsarla. Cada cambio se abre con su propio botón y no
 * con toda la fila: el autor es un enlace con tarjeta, y un control dentro de otro no es válido.
 *
 * @param props las entradas de la API, el filtro elegido y qué hacer al filtrar o elegir
 * @returns el filtro y la lista, o el vacío que corresponda
 */
export function ListaDelHistorial ({ revisiones, filtro, onFiltrar, onElegir }: PropsLista): ReactElement {
  const conteo = contarPorFiltro(revisiones)
  const visibles = filtrarRevisiones(revisiones, filtro)
  const hayCambios = visibles.some((revision) => revision.kind === 'change')

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Qué cambios ver" className="flex flex-wrap gap-2">
        {FILTROS_DE_HISTORIAL.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            aria-pressed={filtro === opcion.id}
            onClick={() => { onFiltrar(opcion.id) }}
            className={cn(
              'rounded-control h-8 px-3 text-xs font-semibold transition-colors duration-rapida ease-neo',
              filtro === opcion.id
                ? 'bg-acento-suave text-acento'
                : 'text-texto-tenue hover:bg-hover hover:text-texto'
            )}
          >
            {opcion.etiqueta}
            <span className="text-texto-sutil ml-1.5 font-normal tabular-nums">{conteo[opcion.id]}</span>
          </button>
        ))}
      </div>

      {!hayCambios && (
        <Vacio
          className="py-8"
          titulo={filtro === 'todos' ? 'Todavía no hay cambios' : 'Ningún cambio de este tipo'}
          descripcion={filtro === 'todos'
            ? 'Cuando alguien corrija el Meeting Paper, o lo haga el asistente, el cambio aparecerá acá.'
            : 'Prueba con otro filtro para ver el resto de los cambios.'}
          accion={filtro === 'todos'
            ? undefined
            : <Boton variante="secundario" tamano="chico" onClick={() => { onFiltrar('todos') }}>Ver todos</Boton>}
        />
      )}

      <ol className="flex flex-col">
        {visibles.map((revision) => (
          <Fila key={`${revision.kind}-${revision.id}`} revision={revision} onElegir={onElegir} />
        ))}
      </ol>
    </div>
  )
}

/**
 * Una entrada de la lista: quién, con qué origen, cuándo y qué secciones tocó.
 *
 * @param revision la entrada
 * @param onElegir se llama al pulsar «Ver cambios»; la creación no tiene diferencias que ver
 * @returns la fila
 */
function Fila ({ revision, onElegir }: { revision: RevisionDelActa, onElegir: (revision: RevisionDelActa) => void }): ReactElement {
  const esCambio = revision.kind === 'change'
  const resumen = revision.summary !== null && revision.summary !== '' ? revision.summary : null

  return (
    <li className="border-linea flex flex-col gap-1.5 border-b py-3 first:pt-0 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        {revision.staff_id !== null && revision.staff_name !== null
          ? <EnlacePersona id={revision.staff_id} nombre={revision.staff_name} imagen={revision.staff_image} tamano="chico" className="text-sm font-medium" />
          : <span className="text-sm font-medium">Alguien del equipo</span>}
        <time
          dateTime={revision.date_added ?? undefined}
          title={formatearFecha(revision.date_added, true)}
          className="text-texto-tenue shrink-0 text-xs"
        >
          {formatearRelativo(revision.date_added)}
        </time>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-texto-tenue flex flex-wrap items-center gap-2 text-xs">
            <Insignia tono={esOrigenDelAsistente(revision.origin) ? 'acento' : 'neutro'} tamano="chico">
              {etiquetaDeOrigen(revision.origin)}
            </Insignia>
            {accionDeRevision(revision)}
          </p>
          {resumen !== null && <p className="text-texto-tenue line-clamp-2 text-xs">{resumen}</p>}
        </div>

        {esCambio && (
          <Boton variante="secundario" tamano="chico" data-revision={revision.id} onClick={() => { onElegir(revision) }} className="shrink-0">
            Ver cambios
          </Boton>
        )}
      </div>
    </li>
  )
}
