import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { GLOSARIO } from '@/dominio/glosario'
import { diasHasta } from '@/lib/fechas'
import { ANCHO_SOBRIO_EM, cupoDeFichas, planDeOla } from '@/dominio/solari'
import type { PlanDeOla } from '@/dominio/solari'
import type { ProyectoEnPantalla } from '@/datos/pantalla-area'
import {
  CabeceraDeEscena, CeldaQueAlterna, CUERPO_COLUMNA, CUERPO_PRINCIPAL, FichaDeTablero, Nada,
  RELLENO_DE_FILA, Rotulo, RotulosDeColumna
} from './piezas'

/** La rejilla de columnas de esta escena. Su reparto vive en `pantalla.css`. */
const COLUMNAS = 'pantalla-columnas-espacios'

/**
 * Cuanto pesa cada columna en la ola, en el orden del DOM.
 *
 * La barra de avance no entra: no es texto y no tiene fichas que voltear.
 */
const PESOS = [6, 2, 1, 1, 1] as const

/**
 * Cuantos caracteres caben en cada columna. Los anchos son los de `.pantalla-columnas-espacios`.
 *
 * La columna que alterna es la mas apretada de toda la pantalla —8vmin— y el texto mas largo que le
 * toca es "en 12 días". Va sobria: el porcentaje entra entero y la cuenta de dias se corta como ya se
 * cortaba antes, que es el precio de tener el dato en vertical, donde la fecha no existe. Las tres
 * columnas de conteos y la fecha si llevan ficha entera, porque son digitos y el ancho fijo les sale
 * gratis; ver `ANCHO_DE_FICHA_EM` en el dominio.
 */
const CUPO = {
  nombre: cupoDeFichas(55, 3, ANCHO_SOBRIO_EM),
  /** Sobria y no ficha: alterna con "en 12 días", que son palabras y no caben en ancho fijo. */
  avance: cupoDeFichas(8, 2.7, ANCHO_SOBRIO_EM),
  abiertas: cupoDeFichas(17, 2.7),
  atrasadas: cupoDeFichas(21, 2.7),
  entrega: cupoDeFichas(16, 2.7)
}

/**
 * Los Proyectos donde el area tiene trabajo abierto.
 *
 * El area no cuelga de los Proyectos por ningun lado: la relacion se deriva de las Tareas. Por eso la
 * escena contesta "dónde está trabajando el área", que es la pregunta de una pared, y no "qué
 * Proyectos le pertenecen", que no existe en el modelo.
 *
 * El avance es un porcentaje y **nunca un importe**: acá no hay ni presupuesto ni facturacion, por
 * decision del producto y por construccion del backend, que no consulta ninguna tabla de dinero.
 *
 * === LO QUE GANO AL VOLVERSE TABLA ===
 *
 * Era una rejilla de tarjetas de ~218 px: entraban seis. Ahora es una fila por Proyecto y entran mas
 * del doble, con una columna nueva que antes viajaba en el paquete y no se dibujaba en ningun sitio:
 * la fecha de entrega. Las atrasadas tienen columna propia en vez de ser un fragmento de frase al
 * final de un parrafo, que es lo que permite recorrerlas de arriba abajo sin leer.
 *
 * La barra de avance sobrevivio acá —y no en la escena de Tareas— porque hay una sola por fila y
 * sobra ancho: una columna de barras de 22vmin junto al numero se lee como un grafico, que es
 * exactamente lo que se quiere de "cómo va cada Proyecto".
 *
 * === QUE ALTERNA ===
 *
 * La columna del porcentaje dice el avance y, cada `PERIODO_DE_DATO_MS`, cuanto falta para la entrega.
 * Se eligio esa columna y no la de la fecha porque **la fecha no existe en vertical** —se cae con la
 * barra por falta de ancho—, y ahi el "faltan 3 días" es la unica forma de que la pared diga cuando
 * vence algo. Ademas el porcentaje ya esta dibujado al lado en la barra, asi que es la columna que
 * menos se pierde al turnarse. No alterna el nombre del Proyecto, que es lo que identifica la fila.
 */
export function EscenaEspacios ({ items, ocultos, ahora, zona, fase }: {
  items: ProyectoEnPantalla[]
  ocultos: number
  /** El reloj de pared, para saber cuantos dias faltan. `null` antes de hidratar. */
  ahora: number | null
  /** La zona del negocio: "cuantos dias faltan" se cuenta contra su calendario, no el del aparato. */
  zona: string | null
  fase: 0 | 1
}): ReactNode {
  if (items.length === 0) return <Nada texto={`Sin ${GLOSARIO.espacio.plural.toLowerCase()} en curso`} />

  const plan = planDeOla(items.length, PESOS)

  return (
    <div className="flex min-h-0 flex-col">
      <CabeceraDeEscena titulo={`${GLOSARIO.espacio.plural} en curso`} ocultos={ocultos} />

      <RotulosDeColumna columnas={COLUMNAS}>
        <Rotulo texto={GLOSARIO.espacio.singular} columna={0} maximo={CUPO.nombre} />
        <Rotulo texto="Avance" columna={1} maximo={8} className="portrait:hidden" />
        <Rotulo texto={fase === 0 ? '%' : 'Entrega'} columna={2} maximo={CUPO.avance + 2} className="text-right" />
        <Rotulo texto="Abiertas" columna={3} maximo={CUPO.abiertas} className="text-right" />
        <Rotulo texto="Atrasadas" columna={4} maximo={CUPO.atrasadas} className="text-right" />
        <Rotulo texto="Entrega" columna={5} maximo={CUPO.entrega} className="text-right portrait:hidden" />
      </RotulosDeColumna>

      <ul className="pantalla-tablero min-h-0">
        {items.map((proyecto, indice) => (
          <li
            // Por POSICION y no por `proyecto.id`. Ver el docblock de `EscenaProcesos`.
            key={indice}
            className={cn('pantalla-fila py-[0.55vmin] leading-[1.15]', RELLENO_DE_FILA, COLUMNAS)}
          >
            <FichaDeTablero
              sobria
              texto={proyecto.name}
              sitio={{ plan, fila: indice, columna: 0 }}
              maximo={CUPO.nombre}
              className={cn('text-texto font-semibold', CUERPO_PRINCIPAL)}
            />

            <span className="bg-linea-suave h-[1vmin] overflow-hidden rounded-full portrait:hidden">
              <span
                className="bg-acento block h-full rounded-full"
                style={{ width: `${proyecto.progress}%` }}
              />
            </span>

            <CeldaQueAlterna
              sobria
              fase={fase}
              principal={`${proyecto.progress}%`}
              alterno={cuantoFalta(proyecto.deadline, ahora, zona)}
              sitio={{ plan, fila: indice, columna: 1 }}
              maximo={CUPO.avance}
              className={cn('text-texto text-right font-semibold', CUERPO_COLUMNA)}
            />

            <FichaDeTablero
              texto={String(proyecto.procesos_abiertos)}
              sitio={{ plan, fila: indice, columna: 2 }}
              maximo={CUPO.abiertas}
              className={cn('text-texto-tenue text-right', CUERPO_COLUMNA)}
            />

            <Atrasadas cuantas={proyecto.procesos_atrasados} plan={plan} fila={indice} />

            <FichaDeTablero
              texto={formatoCorto(proyecto.deadline)}
              sitio={{ plan, fila: indice, columna: 4 }}
              maximo={CUPO.entrega}
              className={cn('text-texto-tenue text-right portrait:hidden', CUERPO_COLUMNA)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Las Tareas atrasadas del Proyecto.
 *
 * El cero se dibuja en gris y no se esconde: una columna con huecos obliga a comprobar si falta el
 * dato o si el dato es cero, y esa duda cuesta mas que el cero.
 */
function Atrasadas ({ cuantas, plan, fila }: {
  cuantas: number
  plan: PlanDeOla
  fila: number
}): ReactNode {
  return (
    <FichaDeTablero
      texto={String(cuantas)}
      sitio={{ plan, fila, columna: 3 }}
      maximo={CUPO.atrasadas}
      className={cn(
        'text-right',
        CUERPO_COLUMNA,
        cuantas === 0 ? 'text-texto-sutil' : 'text-texto-peligro font-bold'
      )}
    />
  )
}

/**
 * `YYYY-MM-DD` a `DD/MM`, y una raya cuando no hay fecha.
 *
 * A mano y no con `Intl`, por lo mismo que en `EscenaProcesos`: la fecha llega como dia calendario,
 * sin hora ni zona, y pasarla por `Date` la interpreta en UTC y la corre un dia en cuanto el
 * televisor esta al oeste de Greenwich.
 */
function formatoCorto (fecha: string | null): string {
  if (fecha === null) return '—'

  const [, mes, dia] = fecha.split('-')

  return dia === undefined || mes === undefined ? fecha : `${dia}/${mes}`
}

/**
 * Cuanto falta para la entrega, en palabras cortas.
 *
 * Se cuenta por DIA CALENDARIO y en la zona del negocio, no por instante ni con el reloj del
 * televisor: un Proyecto que entrega hoy a las 09:00 sigue entregando "hoy" a las 18:00, y un aparato
 * con la zona en UTC diria "mañana" media tarde. Es el mismo criterio de `estadoVencimiento()` del
 * panel.
 *
 * @param fecha `YYYY-MM-DD`, o `null` si el Proyecto no tiene entrega
 * @param ahora instante en milisegundos, o `null` antes de hidratar
 * @param zona  zona IANA del negocio, o `null` para caer en la del aparato
 * @returns "hoy", "en 3 días", "hace 5 días" o una raya cuando no hay con que contestar
 */
function cuantoFalta (fecha: string | null, ahora: number | null, zona: string | null): string {
  const hoy = diaCalendario(ahora, zona)

  if (fecha === null || hoy === null) return '—'

  const dias = diasHasta(fecha, new Date(`${hoy}T00:00:00`))

  if (dias === null) return '—'
  if (dias === 0) return 'hoy'
  if (dias > 0) return `en ${dias} ${dias === 1 ? 'día' : 'días'}`

  return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
}

/**
 * El dia de hoy (`YYYY-MM-DD`) en la zona del negocio.
 *
 * `sv-SE` porque es el unico locale que `Intl` formatea nativamente como `YYYY-MM-DD`: escribirlo a
 * mano con `getFullYear()` daria el dia del televisor, que es justo lo que no se quiere.
 */
function diaCalendario (ahora: number | null, zona: string | null): string | null {
  if (ahora === null || !Number.isFinite(ahora)) return null

  const opciones: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit' }

  if (zona !== null && zona !== '') opciones.timeZone = zona

  try {
    return new Intl.DateTimeFormat('sv-SE', opciones).format(new Date(ahora))
  } catch {
    // Una zona que no se entiende no puede apagar una columna de la pared: se cae a la del aparato.
    return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(ahora))
  }
}
