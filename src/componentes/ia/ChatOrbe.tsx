'use client'

import type { ReactElement } from 'react'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { ASISTENTE } from '@/dominio/glosario'
import type { ActaPedida } from '@/dominio/orbe-contexto'
import { conAgente, configuracionDeOrbe, type ConfiguracionConAgente, type SujetoOrbe } from '@/dominio/orbe-sujeto'
import { ChatAgente } from './ChatAgente'
import { ConversacionConsulta } from './ConversacionConsulta'
import { useCapacidadesOrbe } from './useCapacidadesOrbe'

/**
 * El chat de Thinking Orb: elige el motor y monta su conversación.
 *
 * - Equipo con el agente encendido: `ChatAgente` (ejecuciones durables con plan y confirmación).
 * - Equipo con el agente apagado y portal: `ConversacionConsulta` (SSE; en el portal, solo lectura).
 *
 * La conversación vive en `ConversacionConsulta.tsx` (ver ahí por qué el chat no es de un Espacio) y
 * en `ChatAgente.tsx`; ambas se arman con las mismas primitivas (`MarcoConversacion`,
 * `CompositorChat`, `BurbujaPersona`, `TarjetaIA`) y publican su fase en `dominio/fase-orbe.ts`.
 *
 * @param desplazable en el orbe el alto está acotado, así que la conversación scrollea sola y el
 *   campo queda fijo abajo. Sin esto scrollea lo que lo contenga.
 * @param proyecto el Proyecto de la conversación; el nombre puede faltar (el portal lo saca de la ruta)
 * @param sujeto de quién es la sesión: decide rutas, textos y qué partes del chat existen. Por
 *   defecto el equipo. Ver `dominio/orbe-sujeto.ts`.
 */
interface PropsChatOrbe {
  desplazable?: boolean
  proyecto?: { id: number, name?: string }
  sujeto?: SujetoOrbe
  /** El acta con la que se abrió el orbe flotante; solo la usa el agente del equipo. */
  actaPedida?: ActaPedida | null
}

/** Lo que recibe el selector ya resuelto: la configuración en lugar del sujeto. */
interface PropsSelector {
  desplazable?: boolean
  proyecto?: { id: number, name?: string }
  configuracion: ConfiguracionConAgente
  actaPedida?: ActaPedida | null
}

/** Monta un hilo independiente al cambiar entre proyectos o el chat global. */
export function ChatOrbe (props: PropsChatOrbe = {}): ReactElement {
  const { sujeto, ...resto } = props
  const configuracion = configuracionDeOrbe(sujeto)
  const clave = `${configuracion.sujeto}:${resto.proyecto?.id ?? 'global'}`

  // El agente solo existe para el equipo: en el portal la capacidad del agente no se consulta siquiera.
  return conAgente(configuracion)
    ? <SelectorChatOrbe key={clave} {...resto} configuracion={configuracion} />
    : <ConversacionConsulta key={clave} {...resto} configuracion={configuracion} />
}

/** El servidor decide la activación por usuario; no se cambia de motor durante una ejecución. */
function SelectorChatOrbe ({ desplazable, proyecto, configuracion, actaPedida }: PropsSelector): ReactElement {
  const { capacidades, error, reintentar } = useCapacidadesOrbe(configuracion)

  if (error !== '') return <ErrorEstado detalle={error} onReintentar={reintentar} />
  if (capacidades === null) return <Cargando mensaje={`Cargando ${ASISTENTE}…`} />

  const proyectoConNombre = proyecto?.name === undefined ? undefined : { id: proyecto.id, name: proyecto.name }

  return capacidades.agente.habilitado
    ? <ChatAgente desplazable={desplazable} proyecto={proyectoConNombre} configuracion={configuracion} capacidades={capacidades.agente} actaPedida={actaPedida} />
    : <ConversacionConsulta desplazable={desplazable} proyecto={proyecto} configuracion={configuracion} />
}
