'use client'

import type { ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { CAJA_DE_AVISO } from '@/componentes/estado/cajaDeAviso'
import { DECISION_HERRAMIENTAS_MCP, estadoDeDecisionRemota, type EstadoDeDecisionRemota } from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'
import { AlternablesMcp } from './AlternablesMcp'

/** Lo que se le dice a quien administra según cómo está la aprobación remota. */
const MENSAJES: Record<EstadoDeDecisionRemota, { variante: 'aviso' | 'exito', texto: string }> = {
  desactivada: {
    variante: 'aviso',
    texto: 'La decisión remota está desactivada: sin herramientas encendidas, el sistema no puede aprobar nada fuera de Ops. Toda propuesta se aprueba aquí.'
  },
  sin_clave: {
    variante: 'aviso',
    texto: 'Hay herramientas encendidas, pero falta una clave de decisión vigente: el sistema no podrá firmar aprobaciones. Registra una en «Claves públicas» con el propósito «Decisión remota».'
  },
  activa: {
    variante: 'exito',
    texto: 'La decisión remota está activa para las herramientas encendidas.'
  }
}

/**
 * Qué herramientas puede aprobar el sistema desde fuera de Ops. Por defecto, ninguna.
 *
 * Es la parte más sensible de la configuración: el riesgo se dice con todas sus letras al lado de los
 * interruptores. Rechazar una propuesta no depende de esta lista, y las propuestas visibles para el
 * cliente nunca se aprueban así.
 *
 * @param sistema el sistema leído
 * @param onGuardado recibe el sistema tal como quedó
 */
export function DecisionRemotaMcp ({ sistema, onGuardado }: { sistema: SistemaMcp, onGuardado: (s: SistemaMcp) => void }): ReactElement {
  const mensaje = MENSAJES[estadoDeDecisionRemota(sistema)]

  return (
    <div className="flex flex-col gap-3">
      <AlternablesMcp
        titulo="Qué puede aprobar desde wiwo.center"
        catalogo={DECISION_HERRAMIENTAS_MCP}
        encendidos={sistema.decision_tools}
        campo="decision_herramientas"
        integracionId={sistema.id}
        onGuardado={onGuardado}
      />
      <p className="text-texto-tenue text-xs">
        Riesgo: cada herramienta encendida permite que este sistema apruebe esas propuestas sin que la persona entre a Ops. La persona tiene que
        haberse autenticado hace poco y la propuesta no puede ser visible para el cliente. Enciende solo lo que de verdad lo necesite.
      </p>
      <AvisoEnLinea variante={mensaje.variante} mensaje={mensaje.texto} className={mensaje.variante === 'aviso' ? CAJA_DE_AVISO : 'text-sm'} />
    </div>
  )
}
