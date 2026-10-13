import { MAXIMO_PREGUNTA_AGENTE, UMBRAL_DETENIDA_SEGUNDOS } from './ia-ejecucion.ts'

/** Intervalo de consulta que se usa si el servidor no dice uno válido, en ms. */
export const INTERVALO_CONSULTA_DEFECTO_MS = 1500

/** Intervalo mínimo aceptado: por debajo, el servidor recibiría una ráfaga de consultas. */
const INTERVALO_CONSULTA_MINIMO_MS = 500

/** Lo que el servidor dice del agente durable para esta sesión. */
export interface CapacidadesAgente {
  habilitado: boolean
  intervalo_consulta_ms: number
  nuevas_habilitadas: boolean
  maximo_pregunta: number
  umbral_detenida_segundos: number
}

/** Lo que el servidor dice que ofrece el orbe a esta sesión. */
export interface CapacidadesOrbe {
  /** El orbe se ofrece (campo `habilitado` de la raíz; solo lo manda el portal). */
  habilitado: boolean
  agente: CapacidadesAgente
}

/** Un entero positivo si el valor lo es; si no, `null`. @param valor Dato remoto. @returns El entero o `null`. */
function enteroPositivo (valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : null
}

/**
 * Lee las capacidades del orbe sin confiar en la forma de la respuesta.
 *
 * Cualquier campo ausente o inválido cae a su valor por defecto: una respuesta vacía, un 404 ya
 * convertido en `{}` o un backend anterior dejan el agente apagado y el chat de consulta.
 *
 * @param valor El `data` de `ia/capacidades` o `portal/ia/capacidades`.
 * @returns Las capacidades, siempre completas.
 */
export function leerCapacidadesOrbe (valor: unknown): CapacidadesOrbe {
  const raiz = valor !== null && typeof valor === 'object' ? valor as Record<string, unknown> : {}
  const agente = raiz.agente !== null && typeof raiz.agente === 'object' ? raiz.agente as Record<string, unknown> : {}
  const intervalo = agente.intervalo_consulta_ms
  return {
    habilitado: raiz.habilitado === true,
    agente: {
      habilitado: agente.habilitado === true,
      intervalo_consulta_ms: typeof intervalo === 'number' && intervalo >= INTERVALO_CONSULTA_MINIMO_MS ? intervalo : INTERVALO_CONSULTA_DEFECTO_MS,
      nuevas_habilitadas: agente.nuevas_habilitadas !== false,
      maximo_pregunta: enteroPositivo(agente.maximo_pregunta) ?? MAXIMO_PREGUNTA_AGENTE,
      umbral_detenida_segundos: enteroPositivo(agente.umbral_detenida_segundos) ?? UMBRAL_DETENIDA_SEGUNDOS
    }
  }
}
