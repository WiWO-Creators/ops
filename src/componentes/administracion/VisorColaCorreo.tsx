'use client'

import type { ReactElement } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { COLA_CORREO } from '@/definiciones/cola-correo'
import type { EstadoCorreo, FilaColaCorreo } from '@/datos/recursos'
import type { ResumenColaCorreo } from '@/datos/tipos'
import type { ResultadoLista } from '@/definiciones/tipos'

const TONO_RESUMEN: Record<EstadoCorreo, TonoInsignia> = {
  pending: 'neutro',
  sending: 'acento',
  sent: 'exito',
  failed: 'peligro'
}

const ETIQUETA_RESUMEN: Record<EstadoCorreo, string> = {
  pending: 'pendientes',
  sending: 'enviando',
  sent: 'enviados',
  failed: 'fallidos'
}

interface PropsVisorColaCorreo {
  inicial: ResultadoLista<FilaColaCorreo>
  resumen: ResumenColaCorreo
}

/**
 * Visor de solo lectura de `tblmail_queue` (`GET /notifications/mail-queue`).
 *
 * Es la forma de verificar el interruptor sin mandarle nada a nadie: no hay reintentar, ni borrar, ni
 * despachar. `TablaRecurso` sin `acciones` en la definición ya se comporta así.
 *
 * El resumen es de la cola entera, sin los filtros que la persona ponga en la tabla — por eso dice
 * "en total" y no cambia cuando se filtra por estado: mezclar los dos números confundiría más de lo
 * que ayuda.
 */
export function VisorColaCorreo ({ inicial, resumen }: PropsVisorColaCorreo): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto-tenue text-xs">Cola completa —</span>
        {(Object.keys(ETIQUETA_RESUMEN) as EstadoCorreo[]).map((estado) => (
          <Insignia key={estado} tono={TONO_RESUMEN[estado]} tamano="chico">
            {resumen[estado]} {ETIQUETA_RESUMEN[estado]}
          </Insignia>
        ))}
        <span className="text-texto-sutil text-xs">· {resumen.total} en total</span>
      </div>

      <TablaRecurso definicion={COLA_CORREO} inicial={inicial} claveFila={(fila) => fila.id} />
    </div>
  )
}
