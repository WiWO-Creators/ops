import { Bloque } from '@/app/portal/(dentro)/detalle'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, FilaDeProceso, Nota } from './piezas'
import {
  SIN_DATO,
  formatearDias,
  formatearPorcentaje,
  tonoDePorcentaje
} from '@/dominio/gestion'
import type { PlazosGestion, VencidaGestion } from '@/datos/portal'

/**
 * Qué se cumplió y qué no, contra la fecha de entrega.
 *
 * Es el segundo bloque porque es la otra mitad de la pregunta del cliente, y la que más se presta a
 * leerse mal: `porcentaje_en_plazo` llega en `null` cuando el mes no tuvo nada comprometido, y un 0%
 * ahí diría «no cumplimos nada» sobre un mes en el que no había nada que cumplir. Por eso el `null`
 * sale como guion y con su frase, nunca como un cero y nunca en rojo.
 *
 * El cumplimiento se mide contra la fecha de entrega y no contra ningún compromiso interno: es una
 * resta entre dos fechas que el cliente ya tiene en pantalla.
 */
export function Plazos (
  { plazos, vencidas }: { plazos: PlazosGestion, vencidas: VencidaGestion[] }
) {
  const sinCompromisos = plazos.comprometidas === 0

  return (
    <Bloque titulo="Cumplimiento de plazos">
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2 sm:col-span-1">
            <Cifra
              etiqueta="Entregado en plazo"
              valor={formatearPorcentaje(plazos.porcentaje_en_plazo)}
              tono={tonoDePorcentaje(plazos.porcentaje_en_plazo)}
              detalle={
                sinCompromisos
                  ? 'Todavía no hay datos'
                  : `${plazos.en_plazo} de ${plazos.comprometidas} con entrega en el mes`
              }
            />
            {plazos.porcentaje_en_plazo !== null && (
              <BarraProgreso porcentaje={plazos.porcentaje_en_plazo} />
            )}
          </div>

          <Cifra
            etiqueta="Vencidas al cierre"
            valor={formatearNumero(plazos.vencidas_al_cierre)}
            tono={plazos.vencidas_al_cierre > 0 ? 'peligro' : 'exito'}
            detalle="Seguían abiertas y pasadas de fecha"
          />

          <Cifra
            etiqueta="Atraso típico"
            valor={
              plazos.atraso_dias.n === 0
                ? SIN_DATO
                : formatearDias(plazos.atraso_dias.mediana)
            }
            detalle={
              plazos.atraso_dias.n === 0
                ? 'Nada se atrasó este mes'
                : `Mediana de ${plazos.atraso_dias.n} · ${formatearDias(plazos.atraso_dias.suma)} en total`
            }
          />
        </div>

        {sinCompromisos && (
          <Nota tono="aviso">
            Este mes no había nada con fecha de entrega comprometida, así que no hay porcentaje de
            cumplimiento que calcular. No es 0%: es que no había denominador.
          </Nota>
        )}

        <Nota>
          Algo comprometido que todavía está abierto no cumplió, aunque la fecha no haya llegado: no
          se entregó. Y el atraso de lo que sigue abierto se cuenta hasta el cierre del
          mes, no hasta que cierre: un atraso que todavía corre es un atraso.
        </Nota>

        {vencidas.length > 0 && (
          <section aria-label="Vencidas al cierre">
            <h3 className="text-texto text-sm font-semibold">
              Las vencidas, una por una
              <span className="text-texto-sutil ml-2 font-normal tabular-nums">{vencidas.length}</span>
            </h3>
            <ul className="mt-2">
              {vencidas.map((proceso) => (
                <FilaDeProceso
                  key={proceso.id}
                  proceso={proceso}
                  destaque={String(proceso.dias_de_atraso)}
                  rotuloDelDestaque={proceso.dias_de_atraso === 1 ? 'día de atraso' : 'días de atraso'}
                  tono="peligro"
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Bloque>
  )
}
