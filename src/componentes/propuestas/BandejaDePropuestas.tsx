'use client'

import { Link2, Plug } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BotonCopiar } from '@/componentes/datos/BotonCopiar'
import { AvisoEnLinea, Vacio } from '@/componentes/estado/Estados'
import { CAJA_DE_AVISO } from '@/componentes/estado/cajaDeAviso'
import { TarjetaPropuestaIA } from '@/componentes/ia/TarjetaPropuestaIA'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { aAccionIA, type Procedencia, type PropuestaExterna } from '@/dominio/propuestas'
import { cn } from '@/lib/clases'
import type { AccionIA } from '@/dominio/ia'
import type { FiltroDePropuestas } from '@/datos/propuestas'

/**
 * La bandeja: una tarjeta por propuesta, con el sistema de origen a la vista.
 *
 * La decisión la toma `TarjetaPropuestaIA`, la misma del chat: manda solo `{ decision }` a
 * `POST /ia/acciones/{id}` y pinta lo que el servidor devuelve. Acá solo se reemplaza la propuesta por
 * su versión resuelta; lo que se confirmó queda en la lista (en «Por responder» sale al recargar).
 *
 * Antes de decidir la persona ve dos cosas que la tarjeta no sabe: si lo que se propone lo va a poder
 * leer el cliente, y lo que el sistema DECLARÓ sobre el origen de la propuesta, que Ops no verifica.
 *
 * @param inicial las propuestas ya cargadas en el servidor
 * @param filtro qué filtro las trajo, para el texto de «vacío»
 * @param resaltarId la propuesta a la que apunta un enlace profundo (`/propuestas/{id}`), si hay una
 */
export function BandejaDePropuestas ({ inicial, filtro, resaltarId }: {
  inicial: PropuestaExterna[]
  filtro: FiltroDePropuestas
  resaltarId?: number
}): ReactElement {
  const [resueltas, setResueltas] = useState<Record<number, AccionIA>>({})
  const resaltada = useRef<HTMLLIElement | null>(null)

  useEffect(() => {
    resaltada.current?.scrollIntoView({ block: 'center' })
  }, [resaltarId])

  if (inicial.length === 0) {
    return (
      <Vacio
        titulo={filtro === 'pendiente' ? 'No tienes propuestas por responder' : 'Aún no hay propuestas'}
        descripcion="Cuando otro sistema de WiWO te deje algo preparado, lo verás aquí para confirmarlo o rechazarlo."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {inicial.map((propuesta) => (
        <li
          key={propuesta.id}
          id={`propuesta-${propuesta.id}`}
          ref={propuesta.id === resaltarId ? resaltada : undefined}
          aria-current={propuesta.id === resaltarId ? 'true' : undefined}
          className={cn(
            'border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4',
            propuesta.id === resaltarId && 'ring-acento ring-2'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-texto-tenue inline-flex items-center gap-1.5 text-sm">
              <Plug size={14} aria-hidden="true" />
              <strong className="text-texto font-medium">{propuesta.origin.name}</strong>
            </span>
            <span className="text-texto-sutil text-xs">
              Recibida <Fecha valor={propuesta.created_at} conHora />
            </span>
          </div>

          {propuesta.visible_to_client && (
            <AvisoEnLinea
              variante="aviso"
              className={CAJA_DE_AVISO}
              mensaje="Será visible para el cliente: lo que esta propuesta crea o cambia podrá leerlo él. Revísalo con cuidado antes de confirmar."
            />
          )}

          {propuesta.provenance !== null && <ProcedenciaDeclarada procedencia={propuesta.provenance} sistema={propuesta.origin.name} />}

          <TarjetaPropuestaIA
            accion={resueltas[propuesta.id] ?? aAccionIA(propuesta)}
            onResuelta={(accion) => { setResueltas((previas) => ({ ...previas, [propuesta.id]: accion })) }}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {propuesta.link !== null && propuesta.link.url !== '' && (
              <a
                href={propuesta.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-acento inline-flex items-center gap-1.5 text-sm underline"
              >
                <Link2 size={14} aria-hidden="true" />
                Ver en {propuesta.origin.name} ↗
              </a>
            )}
            {propuesta.url_ops !== null && (
              <BotonCopiar
                valor={propuesta.url_ops}
                etiqueta="Copiar enlace a esta propuesta"
                etiquetaCopiado="Enlace copiado"
                mensajeError="No pudimos copiar el enlace. Cópialo desde la barra de direcciones."
                variante="sutil"
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Lo que el sistema de origen dijo de dónde sacó la propuesta.
 *
 * Es texto plano a propósito y viene rotulado: Ops no lo verifica, así que no se interpreta como HTML,
 * no se vuelve enlace y no se mezcla con lo que el servidor escribió en la tarjeta de abajo.
 *
 * @param procedencia los pares que declaró el sistema
 * @param sistema el nombre del sistema de origen
 */
function ProcedenciaDeclarada ({ procedencia, sistema }: { procedencia: Procedencia, sistema: string }): ReactElement {
  return (
    <section aria-label={`Procedencia declarada por ${sistema}`} className="border-linea bg-superficie rounded-md border px-3 py-2">
      <p className="text-texto-sutil text-xs">Declarado por {sistema}, no verificado por Ops</p>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        {Object.entries(procedencia.data).map(([clave, valor]) => (
          <div key={clave} className="contents">
            <dt className="text-texto-tenue break-words">{clave}</dt>
            <dd className="text-texto break-words whitespace-pre-wrap">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
