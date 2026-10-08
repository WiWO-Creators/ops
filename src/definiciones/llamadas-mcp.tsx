import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { etiquetaDeMetodo } from '../dominio/mcp-externo.ts'
import type { LlamadaMcp } from '../datos/accesos.ts'
import type { DefinicionRecurso } from './tipos.ts'

/** El tono de cada método: un rechazo llama la atención, una decisión remota se distingue de una llamada. */
const TONO_DE_METODO: Readonly<Record<string, TonoInsignia>> = {
  rechazo: 'peligro',
  decision: 'acento'
}

/** Un valor opcional de correlación o `—` si la llamada no lo trajo. */
function textoOGuion (valor: string | null): string {
  return valor ?? '—'
}

/**
 * Definición de las últimas llamadas de un sistema MCP (`GET /accesos/integraciones/{id}/mcp/llamadas`).
 *
 * Se usa en modo memoria: la API devuelve las últimas 50 de una vez y la pantalla filtra antes de
 * pasarlas a la tabla, por eso no declara `filtros`. `motivo`, `request_id` y `sid` quedan para
 * correlacionar con los registros del otro sistema; ninguno decide nada.
 */
export const LLAMADAS_MCP: DefinicionRecurso<LlamadaMcp> = {
  ruta: 'accesos/integraciones/llamadas',
  titulo: { singular: 'Llamada', plural: 'Llamadas' },

  columnas: [
    { clave: 'created_at', encabezado: 'Cuándo', ordenPor: 'created_at', presentar: (f) => <Fecha valor={f.created_at} conHora /> },
    {
      clave: 'staff_id',
      encabezado: 'Persona',
      presentar: (f) => f.staff_id === null ? '—' : <EnlacePersona id={f.staff_id} nombre={`Persona #${f.staff_id}`} />
    },
    {
      clave: 'method',
      encabezado: 'Método',
      ordenPor: 'method',
      presentar: (f) => <Insignia tono={TONO_DE_METODO[f.method] ?? 'neutro'}>{etiquetaDeMetodo(f.method)}</Insignia>
    },
    { clave: 'tool', encabezado: 'Herramienta', ordenPor: 'tool', presentar: (f) => f.tool === null ? '—' : <code className="font-mono">{f.tool}</code> },
    { clave: 'code', encabezado: 'Resultado', ordenPor: 'code', presentar: (f) => f.code },
    {
      clave: 'reason',
      encabezado: 'Motivo',
      ordenPor: 'reason',
      presentar: (f) => f.reason === null ? '—' : <code className="font-mono">{f.reason}</code>
    },
    { clave: 'request_id', encabezado: 'Request ID', presentar: (f) => <code className="font-mono">{textoOGuion(f.request_id)}</code> },
    { clave: 'sid', encabezado: 'Sesión (sid)', presentar: (f) => <code className="font-mono">{textoOGuion(f.sid)}</code> },
    { clave: 'ms', encabezado: 'Duración', ordenPor: 'ms', numerica: true, presentar: (f) => `${f.ms} ms` }
  ],

  filtros: [],
  ordenables: ['created_at', 'method', 'tool', 'code', 'reason', 'ms'],
  ordenPorDefecto: '-created_at',
  busqueda: false,
  includes: []
}
