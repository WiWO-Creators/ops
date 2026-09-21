import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota, SinDatoAun } from './piezas'
import {
  AVISO_SIN_HISTORIA,
  MOTIVO_SIN_AUDITORIA,
  leerCambiosDeCompromiso,
  type LecturaDeCambios
} from './lectura'
import type { CambiosGestion } from '@/datos/portal'

/**
 * Lo que entró fuera de lo planificado, y cuánto se movió lo que ya estaba acordado.
 *
 * === Dos mitades que no se miden igual, y por eso no se presentan juntas ===
 *
 * La primera cifra es un <strong>proxy</strong> y el bloque lo dice en pantalla, no en un
 * comentario: se cuentan las entradas del mes que no cuelgan de ningún {hito}, más las que se
 * crearon y se comprometieron dentro del mismo mes. Es una aproximación razonable de «esto no
 * estaba previsto» y no una lista de pedidos fuera de alcance.
 *
 * Las tres de abajo son dato MEDIDO, fila por fila: cada movimiento de la fecha de entrega, de la
 * prioridad y del {hito} queda registrado con su valor anterior. Por eso no comparten la marca de
 * estimado, y por eso van con dos números cada una: treinta reprogramaciones sobre treinta
 * {procesos} y treinta sobre dos son dos problemas opuestos.
 *
 * === La advertencia que no se puede omitir ===
 *
 * La auditoría empieza a registrar el día que se desplegó y NO hay backfill posible: el valor que
 * tenía una fecha antes de moverse no quedó guardado en ningún lado. Los meses anteriores van a
 * mostrar cero movimientos, y ese cero es el de una tabla que todavía no escribía. Sin esa frase en
 * pantalla, el primer informe mensual que use este bloque miente.
 */
export function Cambios ({ cambios }: { cambios: CambiosGestion }) {
  const compromiso = leerCambiosDeCompromiso(cambios)

  return (
    <Bloque titulo="Cambios y urgencias">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Cifra
            etiqueta="Entradas no planificadas"
            valor={formatearNumero(cambios.entradas_no_planificadas)}
            detalle="Aproximado"
          />

          {cambios.estimado && (
            <Nota tono="aviso">
              Este número es una <strong>estimación</strong>, no un conteo exacto: contamos lo que entró
              sin colgar de ningún hito y lo que se pidió y se comprometió dentro del mismo mes. Sirve
              para ver si el mes tuvo mucha entrada imprevista; no para discutir caso por caso.
            </Nota>
          )}
        </div>

        <CambiosDeCompromiso lectura={compromiso} />
      </div>
    </Bloque>
  )
}

/**
 * Cuánto se movió lo acordado, o por qué todavía no se sabe.
 *
 * Los tres campos se dibujan siempre juntos, también en cero, para que la pantalla no cambie de
 * forma según el mes: una fila que aparece y desaparece se lee como un dato nuevo.
 */
function CambiosDeCompromiso ({ lectura }: { lectura: LecturaDeCambios }) {
  if (lectura.clase === 'sin_registro') {
    return (
      <section aria-label="Cambios sobre lo acordado">
        <h3 className="text-texto text-sm font-semibold">Cambios sobre lo acordado</h3>

        <div className="mt-2">
          <SinDatoAun titulo="Todavía no registramos los cambios" motivo={MOTIVO_SIN_AUDITORIA} />
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Cambios sobre lo acordado">
      <h3 className="text-texto text-sm font-semibold">Cambios sobre lo acordado</h3>

      <dl className="mt-3 grid gap-5 sm:grid-cols-3">
        {lectura.filas.map((fila) => (
          <div key={fila.clave} className="flex flex-col gap-0.5">
            <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
              {fila.rotulo}
            </dt>
            <dd data-numerico className="text-texto text-2xl leading-none font-semibold tabular-nums">
              {formatearNumero(fila.cambios)}
            </dd>
            <dd className="text-texto-tenue text-xs">
              {fila.cambios === 0
                ? 'Ninguno este mes'
                : `En ${fila.procesos} ${
                    fila.procesos === 1 ? GLOSARIO.proceso.singular : GLOSARIO.proceso.plural
                  }`}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col gap-3">
        <Nota tono="aviso">{AVISO_SIN_HISTORIA}</Nota>

        <Nota>
          Contamos los movimientos de la fecha de entrega, de la prioridad y del{' '}
          {GLOSARIO.hito.singular}. El número de movimientos y el de{' '}
          {GLOSARIO.proceso.plural.toLowerCase()} que se movieron son dos cifras distintas a
          propósito: la segunda no se deduce de la primera. Este mes hubo {lectura.totalCambios}{' '}
          {lectura.totalCambios === 1 ? 'movimiento' : 'movimientos'} sobre lo acordado. No decimos
          quién los hizo: eso es bitácora interna.
        </Nota>
      </div>
    </section>
  )
}
