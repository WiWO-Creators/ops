'use client'

import { ClipboardList, DoorOpen, Timer } from 'lucide-react'
import { haceCuanto } from '@/componentes/auditoria/presentacion'
import { Boton } from '@/componentes/formularios/Boton'
import { EnlaceCliente } from '@/componentes/presentadores/EnlaceCliente'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { EnlaceProyecto } from '@/componentes/presentadores/EnlaceProyecto'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { EstadoDeTarea } from '@/componentes/proyecto/EstadoDeTarea'
import { formatearDuracion } from '@/componentes/proyecto/cronometro'
import type { OpcionFiltro } from '@/definiciones/tipos'
import type { FilaDeLive } from '@/datos/live'
import {
  etiquetaDeSala,
  etiquetaDeSituacion,
  fraseDePresencia,
  horaDeInicio,
  situacionDePersona,
  type SituacionDePersona
} from '@/dominio/equipo-en-vivo'
import { modalidadDeJornada } from '@/dominio/live'
import { cn } from '@/lib/clases'
import { cargoYArea } from './presentacion'

/** Cómo se pinta el sello de cada situación: reunión y medición destacan, el resto se queda quieto. */
const TONO_DE_SITUACION: Record<SituacionDePersona, TonoInsignia> = {
  en_reunion: 'acento',
  midiendo: 'exito',
  teletrabajo: 'neutro',
  en_jornada: 'neutro',
  sin_jornada: 'contorno'
}

interface PropsTarjetaPersona {
  fila: FilaDeLive
  /** Segundos desde la lectura del tablero; el tic de un segundo es uno solo, del tablero. */
  transcurrido: number
  /** La sala en que está ahora, o `null`/`undefined` si no está en ninguna o no se sabe. */
  sala?: string | null
  /** `task_statuses` de `GET /lookups`; vacío no pinta la insignia de estado. */
  estados?: OpcionFiltro[]
  /** Abre el resumen de la jornada de esta persona. */
  onVerResumen: (fila: FilaDeLive) => void
}

/**
 * Una persona del equipo, con lo que declaró estar haciendo ahora.
 *
 * Se lee de arriba abajo: quién (nombre, cargo, sello de situación), qué (reunión, o el Proyecto y
 * la Tarea que mide, con su Cliente), cuánto (el cronómetro y la jornada «desde» la hora en que
 * abrió) y dónde está en el panel. Es lo mismo que `FilaEnVivo` dice, repartido en una grilla de
 * tarjetas; ninguna de las dos inventa un dato que la otra no tenga.
 *
 * === LO QUE NO DICE ===
 *
 * Nada de lo que se hace dentro de una pantalla: ni capturas, ni teclado, ni inactividad. La sección
 * del panel sale de la ruta que la propia persona tiene abierta (`fraseDePresencia`), y de una sala
 * privada solo se dice que lo es. Ver `AvisoDeTransparencia`.
 *
 * El nombre es un `h3` por la misma razón que en `FilaEnVivo`: cuelga del `h2` del tablero, bajo el
 * único `h1` de la pantalla.
 *
 * @param fila la persona tal como llega de `GET /live`
 * @param transcurrido segundos desde que se leyó el tablero
 * @param sala la sala de Teletrabajo en que está, si está en una
 * @param estados catálogo de estados de Tarea
 * @param onVerResumen se llama al apretar «Ver resumen»
 */
export function TarjetaPersona ({ fila, transcurrido, sala, estados = [], onVerResumen }: PropsTarjetaPersona) {
  const { staff, jornada, medidor, presencia } = fila
  const salaActual = sala ?? null
  const situacion = situacionDePersona(fila, salaActual)
  const titulo = cargoYArea(staff)
  const desde = horaDeInicio(jornada?.started_at)
  const frase = fraseDePresencia(presencia)
  const ubicacion = presencia === null
    ? 'Sin señales'
    : [frase === null ? null : frase.charAt(0).toUpperCase() + frase.slice(1), haceCuanto(presencia.seconds_ago)]
        .filter((parte) => parte !== null)
        .join(' · ')
  const destacada = situacion === 'midiendo' || situacion === 'en_reunion'

  return (
    <li
      data-entrada="item"
      className={cn(
        'rounded-tarjeta flex min-w-0 flex-col gap-3 border p-3',
        destacada ? 'border-acento-suave bg-superficie-elevada' : 'border-linea bg-superficie-hundida'
      )}
    >
      <div className="flex items-start gap-3">
        <EnlacePersona id={staff.id} nombre={staff.name} imagen={staff.avatar} tamano="grande" mostrarNombre={false} />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-texto text-base leading-tight font-semibold break-words [overflow-wrap:anywhere]">
            {staff.name}
          </h3>
          {titulo !== null && (
            <p className="text-texto-sutil truncate text-xs" title={titulo}>{titulo}</p>
          )}
        </div>

        <Insignia tono={TONO_DE_SITUACION[situacion]} tamano="chico" className="shrink-0">
          {etiquetaDeSituacion(situacion)}
        </Insignia>
      </div>

      <div className="border-linea-suave flex min-h-14 flex-col gap-1.5 border-l-2 pl-3">
        {salaActual !== null && (
          <p className="text-texto flex items-center gap-2 text-sm font-medium">
            <DoorOpen size={14} strokeWidth={2} aria-hidden="true" className="text-acento shrink-0" />
            En {etiquetaDeSala(salaActual)}
          </p>
        )}

        {medidor !== null && (
          <>
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              {medidor.project !== null
                ? <EnlaceProyecto id={medidor.project.id} nombre={medidor.project.name} className="text-texto" />
                : <Insignia tono="aviso" tamano="chico">Sin proyecto</Insignia>}
              {medidor.client !== undefined && medidor.client !== null && (
                <EnlaceCliente id={medidor.client.id} nombre={medidor.client.name} className="text-texto-sutil text-xs" />
              )}
            </p>

            <p className="text-texto-tenue flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <ClipboardList size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
              <span className="break-words [overflow-wrap:anywhere]">{medidor.task?.name ?? 'Sin tarea'}</span>
              {medidor.task?.status !== undefined && medidor.task.status !== null && (
                <EstadoDeTarea status={medidor.task.status} catalogo={estados} />
              )}
            </p>
          </>
        )}

        {medidor === null && salaActual === null && (
          <p className="text-texto-tenue text-sm">
            {jornada === null ? 'Sin jornada abierta' : 'Con jornada, sin medir'}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div data-numerico className="text-texto flex items-center gap-3 font-mono text-sm font-semibold tabular-nums">
          {medidor !== null && (
            <span className="flex items-center gap-1.5">
              <Timer size={14} strokeWidth={2} aria-hidden="true" className="text-acento" />
              {formatearDuracion(medidor.seconds + transcurrido)}
            </span>
          )}
          {jornada !== null && (
            <span className="text-texto-sutil text-xs font-normal">
              Jornada {formatearDuracion(jornada.seconds + transcurrido)}
              {desde !== null && ` · desde ${desde}`}
              {/* Con el sello ya dicho «Teletrabajo» no se repite; con «Midiendo» o «En reunión» el
                  sello es otro y la modalidad se lee aquí. */}
              {modalidadDeJornada(jornada) === 'teletrabajo' && situacion !== 'teletrabajo' && ' · Teletrabajo'}
            </span>
          )}
        </div>

        {jornada !== null && (
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Ver el resumen de la jornada de ${staff.name}`}
            onClick={() => { onVerResumen(fila) }}
          >
            Ver resumen
          </Boton>
        )}
      </div>

      <p className="text-texto-sutil truncate text-xs" title={ubicacion}>{ubicacion}</p>
    </li>
  )
}
