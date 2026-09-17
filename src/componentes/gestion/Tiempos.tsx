import { Bloque } from '@/app/portal/(dentro)/detalle'
import { Cifra, MedianaOConteo, Nota } from './piezas'
import {
  SIN_DATO,
  formatearDias,
  formatearPorcentaje,
  leerMediana
} from '@/dominio/gestion'
import type { DeudaDeAprobacion, TiemposGestion } from '@/datos/portal'

/**
 * Cuánto tarda cada lado. Los dos juntos y en la misma pantalla.
 *
 * Separarlos sería la decisión más cómoda y la menos útil: el tiempo de respuesta del cliente sólo
 * se puede leer al lado del tiempo de entrega del equipo, y la deuda de aprobación —los días que el
 * trabajo pasó esperando al propio cliente— es la cifra que explica buena parte de los plazos del
 * bloque anterior.
 *
 * Las dos entregas del equipo van por separado y contadas aparte porque son dos poblaciones
 * distintas: las que pasaron por aprobación se miden hasta la primera solicitud, y las que no
 * requerían aprobación hasta que se terminaron. Mezclarlas haría que el número dependiera de cuántas
 * de cada clase tuvo el mes.
 *
 * Cada mediana pasa por `leerMediana()`: con menos de tres casos se muestra el conteo y se dice por
 * qué, en vez de proyectar una mediana de dos como si fuera el pulso del mes.
 */
export function Tiempos (
  { tiempos, deuda }: { tiempos: TiemposGestion, deuda: DeudaDeAprobacion }
) {
  return (
    <Bloque titulo="Tiempos de respuesta">
      <div className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <section aria-label="De su lado" className="border-acento flex flex-col gap-4 border-l-2 pl-4">
            <h3 className="text-texto text-sm font-semibold">De su lado</h3>

            <MedianaOConteo
              etiqueta="Responder una aprobación"
              lectura={leerMediana(tiempos.respuesta_cliente)}
              que="aprobaciones resueltas"
            />

            <DeudaDeAprobacionCifra deuda={deuda} />
          </section>

          <section aria-label="De nuestro lado" className="flex flex-col gap-4">
            <h3 className="text-texto text-sm font-semibold">De nuestro lado</h3>

            <MedianaOConteo
              etiqueta="Hasta pedir su aprobación"
              lectura={leerMediana(tiempos.entrega_equipo)}
              que="entregas con aprobación"
            />

            <MedianaOConteo
              etiqueta="Hasta terminar, sin aprobación"
              lectura={leerMediana(tiempos.entrega_equipo_sin_aprobacion)}
              que="entregas sin aprobación"
            />

            <MedianaOConteo
              etiqueta="Punta a punta"
              lectura={leerMediana(tiempos.punta_a_punta)}
              que="cierres"
            />
          </section>
        </div>

        <Nota tono="aviso">
          El tiempo de respuesta se cuenta desde el <strong>último</strong> pedido de aprobación: si
          el equipo insistió, el reloj arrancó de nuevo. El sesgo corre a favor de ustedes —el tiempo
          se ve más corto de lo que fue— y se publica igual, porque corregirlo exige un dato que ya no
          existe.
        </Nota>
      </div>
    </Bloque>
  )
}

/**
 * Los días que el trabajo pasó esperando al propio cliente.
 *
 * `null` con `n = 0` es un mes en el que nada esperó, y se escribe así: un 0 suelto acá se leería
 * como «respondieron al instante», que no es lo mismo que «no hubo nada que responder».
 */
function DeudaDeAprobacionCifra ({ deuda }: { deuda: DeudaDeAprobacion }) {
  if (deuda.n === 0 || deuda.dias === null) {
    return (
      <Cifra
        etiqueta="Espera acumulada"
        valor={SIN_DATO}
        detalle="Nada quedó esperando de su lado este mes"
      />
    )
  }

  return (
    <Cifra
      etiqueta="Espera acumulada"
      valor={formatearDias(deuda.dias)}
      tono="aviso"
      detalle={
        `Repartidos en ${deuda.n} · ${formatearPorcentaje(deuda.porcentaje_del_mes)} `
        + 'del tiempo que tuvieron disponible'
      }
    />
  )
}
