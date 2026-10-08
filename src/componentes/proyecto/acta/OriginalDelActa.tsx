'use client'

import { useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { cuerpoDelActa } from '@/dominio/actas'
import { useRecurso } from '../carga'

/** Lo que devuelve `GET /projects/{id}/actas/{actaId}/fuente`. */
interface OriginalDeActa {
  acta_id: number
  transcription: string
  initial_html: string
  fields: Record<string, string>
  date_added: string
}

/** Qué mostrar del original. */
type Vista = 'transcripcion' | 'primera'

/**
 * La copia original de la reunión que guardó la IA: lo que se dijo, la primera versión del acta y los
 * datos del asistente. Solo la monta un superadmin; el servidor lo vuelve a exigir con un 403.
 *
 * Se pide al abrir y no al montar el detalle: es un texto largo que casi nadie necesita.
 *
 * @param ruta ruta del original (`projects/{id}/actas/{actaId}/fuente`)
 * @param marca código de la marca del acta, para mostrar la primera versión con su estilo
 */
export function OriginalDelActa ({ ruta, marca }: { ruta: string, marca: string }): ReactElement {
  const [abierto, setAbierto] = useState(false)

  return (
    <section aria-label="Original de la reunión" className="border-linea rounded-chico flex flex-col gap-3 border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Original de la reunión</h3>
          <p className="text-texto-tenue text-xs">Solo lo ven los superadministradores. La IA lo usa de respaldo sin citarlo.</p>
        </div>
        <Boton variante="secundario" tamano="chico" onClick={() => { setAbierto(!abierto) }} aria-expanded={abierto}>
          {abierto ? 'Ocultar' : 'Ver original'}
        </Boton>
      </div>

      {abierto && <ContenidoDelOriginal ruta={ruta} marca={marca} />}
    </section>
  )
}

function ContenidoDelOriginal ({ ruta, marca }: { ruta: string, marca: string }): ReactElement {
  const { estado, recargar } = useRecurso<OriginalDeActa>(ruta, 'No se pudo cargar el original.')
  const [vista, setVista] = useState<Vista>('transcripcion')

  if (estado.fase === 'cargando') return <Cargando alto="min-h-24" mensaje="Cargando el original…" />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const original = estado.datos
  const campos = Object.entries(original.fields).filter(([, valor]) => valor.trim() !== '')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Boton variante={vista === 'transcripcion' ? 'primario' : 'sutil'} tamano="chico" onClick={() => { setVista('transcripcion') }}>
          Transcripción
        </Boton>
        <Boton variante={vista === 'primera' ? 'primario' : 'sutil'} tamano="chico" onClick={() => { setVista('primera') }}>
          Primera versión
        </Boton>
      </div>

      {vista === 'transcripcion'
        ? (
          <p className="max-h-96 overflow-y-auto text-sm whitespace-pre-wrap">
            {original.transcription === '' ? 'Esta reunión no tuvo audio ni dictado.' : original.transcription}
          </p>
          )
        : (
          <ContenidoHtml
            html={cuerpoDelActa(original.initial_html)}
            titulo="Primera versión del Meeting Paper"
            marca={marca}
            alto="h-[32rem]"
          />
          )}

      {campos.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
          {campos.map(([clave, valor]) => (
            <div key={clave} className="contents">
              <dt className="text-texto-tenue capitalize">{clave.replace(/_/g, ' ')}</dt>
              <dd className="whitespace-pre-wrap">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
