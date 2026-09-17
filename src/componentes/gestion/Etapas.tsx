import { Bloque } from '@/app/portal/(dentro)/detalle'
import { Cifra, MedianaOConteo, Nota, SinDatoAun } from './piezas'
import {
  advertenciaDeUnidades,
  formatearDias,
  leerMediana,
  motivoSinEtapas
} from '@/dominio/gestion'
import type { EtapasGestion } from '@/datos/portal'

/**
 * Cuánto dura cada etapa del trabajo, y cómo se compara con el tiempo acordado.
 *
 * Es el bloque que más fácil se convertiría en una mentira, y por dos motivos distintos:
 *
 *   1. Hoy el historial de cambios de estado está vacío en producción, así que los días por etapa no
 *      se pueden calcular. Cuatro ceros ahí se leerían «el equipo no tarda nada en ninguna etapa».
 *      Con `medicion = "sin_datos"` el bloque NO se dibuja con ceros ni se esconde: se dibuja con su
 *      motivo escrito.
 *   2. El tiempo acordado está en días HÁBILES y las etapas en días CORRIDOS. Restarlos sin decirlo
 *      inventa dos días de diferencia por cada semana que dure el ciclo. Lo único comparable contra
 *      el acuerdo es el ciclo completo, que por eso va al lado y no escondido entre los cubos.
 *
 * El tiempo acordado viaja una sola vez, al nivel del bloque, porque es del ciclo completo: no
 * existe un acuerdo por etapa, y colgarle uno a cada cubo sería inventar cuatro compromisos que
 * nadie firmó.
 */
export function Etapas ({ etapas }: { etapas: EtapasGestion }) {
  const motivo = motivoSinEtapas(etapas.medicion)
  const advertencia = advertenciaDeUnidades(etapas.compromiso_dias_habiles)

  return (
    <Bloque titulo="Tiempos por etapa">
      {motivo !== null
        ? (
          <SinDatoAun titulo="Todavía no registramos el tiempo por etapa" motivo={motivo} />
          )
        : (
          <div className="flex flex-col gap-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <MedianaOConteo
                etiqueta="Ciclo completo"
                lectura={leerMediana(etapas.ciclo)}
                que="ciclos completos"
              />

              <Cifra
                etiqueta="Tiempo acordado"
                valor={formatearDias(etapas.compromiso_dias)}
                detalle={
                  etapas.compromiso_dias === null
                    ? 'Todavía no hay un tiempo acordado cargado'
                    : 'Días hábiles, del ciclo completo'
                }
              />
            </div>

            <section aria-label="Días por etapa">
              <h3 className="text-texto text-sm font-semibold">Días por etapa</h3>
              <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {etapas.cubos.map((cubo) => (
                  <MedianaOConteo
                    key={cubo.cubo}
                    etiqueta={cubo.rotulo}
                    lectura={leerMediana(cubo)}
                    que={`pasos por ${cubo.rotulo.toLowerCase()}`}
                  />
                ))}
              </div>
            </section>

            {advertencia !== null && <Nota tono="aviso">{advertencia}</Nota>}
          </div>
          )}
    </Bloque>
  )
}
