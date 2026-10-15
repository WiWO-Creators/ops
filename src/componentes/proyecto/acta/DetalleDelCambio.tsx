'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  agruparEnTramos,
  compactarDiferencias,
  diferenciaDeVersiones,
  esOrigenDelAsistente,
  etiquetaDeOrigen,
  resumirDiferencias,
  textoDeResumen,
  type CambioDelActa
} from '@/dominio/historial-acta'
import { formatearFecha, formatearRelativo } from '@/lib/fechas'
import { useRecurso } from '../carga'
import { DiferenciasDelActa } from './DiferenciasDelActa'

interface PropsDetalleDelCambio {
  /** Ruta del acta (`projects/{id}/actas/{actaId}`). */
  ruta: string
  /** El cambio que se mira. */
  revisionId: number
  /** Quien mira puede restaurar: puede editar y no tiene el editor abierto. */
  puedeRestaurar: boolean
  restaurando: boolean
  onVolver: () => void
  /** La persona pidió restaurar el `before` de este cambio. */
  onRestaurar: () => void
}

/**
 * Un cambio del historial: quién, cuándo y qué texto se movió, con la opción de volver a antes de él.
 *
 * Trae `…/revisiones/{id}/cambio` (el antes y el después ya resueltos por la API) y compara los dos
 * HTML por bloques y palabras. Restaurar devuelve el *antes*: la versión vigente no se pierde, queda
 * como una entrada nueva del historial.
 *
 * @param props la ruta, el cambio y qué hacer al volver o restaurar
 * @returns la vista de detalle, con su propio cargando, error y vacío
 */
export function DetalleDelCambio ({
  ruta,
  revisionId,
  puedeRestaurar,
  restaurando,
  onVolver,
  onRestaurar
}: PropsDetalleDelCambio): ReactElement {
  const { estado, recargar } = useRecurso<CambioDelActa>(
    `${ruta}/revisiones/${revisionId}/cambio`,
    'No se pudo cargar el cambio.'
  )
  const raiz = useRef<HTMLDivElement>(null)

  // Al abrir el detalle el foco pasa a su primer control: el de la lista desapareció del DOM.
  useEffect(() => { raiz.current?.querySelector('button')?.focus() }, [])

  return (
    <div ref={raiz} className="flex flex-1 flex-col gap-4">
      <Boton variante="sutil" tamano="chico" onClick={onVolver} className="-ml-3 self-start">
        <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
        Todos los cambios
      </Boton>

      {estado.fase === 'cargando' && <Cargando alto="min-h-48" mensaje="Cargando el cambio…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <CambioCargado cambio={estado.datos} puedeRestaurar={puedeRestaurar} restaurando={restaurando} onRestaurar={onRestaurar} />
      )}
    </div>
  )
}

/**
 * El cambio ya cargado: su cabecera, la comparación y el pie con «Restaurar».
 *
 * Es un componente aparte para que el estado de los tramos abiertos nazca con el cambio y no se
 * arrastre de uno a otro.
 */
function CambioCargado ({
  cambio,
  puedeRestaurar,
  restaurando,
  onRestaurar
}: {
  cambio: CambioDelActa
  puedeRestaurar: boolean
  restaurando: boolean
  onRestaurar: () => void
}): ReactElement {
  const [abiertos, setAbiertos] = useState<ReadonlySet<number>>(new Set())
  const unidades = useMemo(() => diferenciaDeVersiones(cambio.before, cambio.after), [cambio.before, cambio.after])
  const resumen = useMemo(() => resumirDiferencias(unidades), [unidades])
  const tramos = useMemo(() => agruparEnTramos(compactarDiferencias(unidades, abiertos)), [unidades, abiertos])
  const sinCambios = unidades.every((unidad) => unidad.tipo === 'igual')

  /** Abre un tramo plegado; no hay camino de vuelta, igual que «ver más». */
  function abrirTramo (desde: number): void {
    setAbiertos((previos) => new Set(previos).add(desde))
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <PersonaDelCambio cambio={cambio} />
          <time dateTime={cambio.date_added ?? undefined} title={formatearFecha(cambio.date_added, true)} className="text-texto-tenue shrink-0 text-xs">
            {formatearRelativo(cambio.date_added)}
          </time>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Insignia tono={esOrigenDelAsistente(cambio.origin) ? 'acento' : 'neutro'} tamano="chico">
            {etiquetaDeOrigen(cambio.origin)}
          </Insignia>
          <p className="text-texto-tenue text-xs">{textoDeResumen(resumen)}</p>
        </div>
        {cambio.summary !== null && cambio.summary !== '' && (
          <p className="text-texto-tenue text-xs">Secciones: {cambio.summary}</p>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <p className="text-texto-sutil flex flex-wrap gap-x-4 text-xs" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="bg-superficie-peligro border-texto-peligro size-2.5 rounded-sm border" />Eliminado</span>
          <span className="inline-flex items-center gap-1.5"><span className="bg-superficie-exito border-texto-exito size-2.5 rounded-sm border" />Agregado</span>
        </p>
        {sinCambios
          ? (
            <p className="text-texto-tenue border-linea rounded-chico border border-dashed px-3 py-4 text-sm">
              El texto es el mismo. Pudo cambiar solo el formato o un dato del encabezado.
            </p>
            )
          : <DiferenciasDelActa tramos={tramos} onAbrirPlegado={abrirTramo} />}
      </div>

      {puedeRestaurar && (
        <footer className="border-linea bg-superficie-flotante sticky bottom-0 -mx-6 -mb-4 mt-auto flex flex-col gap-2 border-t px-6 py-3">
          <p className="text-texto-tenue text-xs">
            Vuelve a como estaba antes de este cambio. La versión de hoy queda en el historial.
          </p>
          <Boton variante="primario" cargando={restaurando} onClick={onRestaurar} className="self-start">
            Restaurar esta versión
          </Boton>
        </footer>
      )}
    </>
  )
}

/**
 * Quién hizo el cambio: su ficha si se sabe, o «Alguien del equipo» si la API no la trajo.
 *
 * @param cambio el cambio
 * @returns la persona con su avatar
 */
function PersonaDelCambio ({ cambio }: { cambio: CambioDelActa }): ReactElement {
  if (cambio.staff_id === null || cambio.staff_name === null) {
    return <span className="text-sm font-medium">Alguien del equipo</span>
  }

  return <EnlacePersona id={cambio.staff_id} nombre={cambio.staff_name} imagen={cambio.staff_image} tamano="chico" className="text-sm font-medium" />
}
