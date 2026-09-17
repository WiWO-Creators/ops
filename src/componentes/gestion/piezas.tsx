import { EstadoDelPortal } from '@/app/portal/(dentro)/detalle'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { formatearVencimiento } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import {
  SIN_DATO,
  formatearDias,
  motivoSinMediana,
  type LecturaDeMediana,
  type TonoDeCifra
} from '@/dominio/gestion'
import type { ProcesoDeGestion } from '@/datos/portal'

/**
 * Las piezas chicas que comparten los bloques del tablero de gestión.
 *
 * Todas son Server Components sin estado: el tablero entero se resuelve en el servidor y lo único
 * interactivo de la pantalla es el `<form method="get">` del selector de mes.
 *
 * La pieza que justifica el archivo es {@link Nota}. Este tablero publica seis salvedades que no son
 * decoración —qué significa un `null`, por qué los cubos no suman, en qué unidad está el tiempo
 * acordado— y todas se escriben con el mismo componente para que ninguna se vea como una nota al pie
 * opcional: se proyectan en una reunión y alguien va a preguntar.
 */

/**
 * La salvedad de un bloque: por qué el número dice lo que dice.
 *
 * Va debajo del dato y no arriba: primero se ve la cifra, después se lee la letra chica. Al revés,
 * la salvedad se saltea.
 *
 * @param children el texto de la salvedad
 * @param tono `aviso` cuando la salvedad cambia cómo hay que leer el número, no sólo lo matiza
 */
export function Nota (
  { children, tono = 'neutro' }: { children: React.ReactNode, tono?: 'neutro' | 'aviso' }
) {
  return (
    <p
      className={cn(
        'border-l-2 pl-3 text-xs leading-relaxed',
        tono === 'aviso'
          ? 'border-relleno-aviso text-texto-aviso'
          : 'border-linea text-texto-sutil'
      )}
    >
      {children}
    </p>
  )
}

/**
 * Lo que ocupa el lugar de un bloque que no se puede calcular.
 *
 * NO es un estado vacío decorativo ni una caja escondida: un bloque sin dato se explica. La
 * diferencia con dibujar ceros es la razón de ser de esta pantalla.
 *
 * @param titulo qué falta, en una frase
 * @param motivo por qué falta
 */
export function SinDatoAun ({ titulo, motivo }: { titulo: string, motivo: string }) {
  return (
    <div className="border-linea-suave bg-superficie-hundida rounded-medio border border-dashed p-4">
      <p className="text-texto text-sm font-medium">{titulo}</p>
      <p className="text-texto-tenue mt-1 max-w-prose text-xs leading-relaxed">{motivo}</p>
    </div>
  )
}

/** Cómo se pinta cada tono de una cifra. `neutro` es también el de lo que no se sabe. */
const TINTA: Record<TonoDeCifra, string> = {
  exito: 'text-texto-exito',
  aviso: 'text-texto-aviso',
  peligro: 'text-texto-peligro',
  neutro: 'text-texto'
}

/**
 * Una cifra con su rótulo, en la jerarquía del tablero.
 *
 * Distinta de `Metrica`: esa es una tarjeta con borde propia de una grilla de KPIs, y ésta es una
 * cifra dentro de un bloque que ya tiene su tarjeta. Meter tarjetas dentro de tarjetas es lo que
 * convierte un tablero en un estacionamiento de cajas.
 *
 * @param etiqueta el nombre de la cifra
 * @param valor el texto ya formateado; nunca un número crudo, para que el guion sea posible
 * @param tono el semáforo, si la cifra tiene uno
 * @param detalle una línea de contexto debajo, opcional
 */
export function Cifra (
  { etiqueta, valor, tono = 'neutro', detalle }:
  { etiqueta: string, valor: string, tono?: TonoDeCifra, detalle?: string }
) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        {etiqueta}
      </span>
      <span
        data-numerico
        className={cn('text-2xl leading-none font-semibold tabular-nums', TINTA[tono])}
      >
        {valor}
      </span>
      {detalle !== undefined && <span className="text-texto-tenue text-xs">{detalle}</span>}
    </div>
  )
}

/**
 * Una mediana, o la razón por la que no se dibuja.
 *
 * Es el único lugar de la pantalla donde se decide mostrar o no mostrar una mediana, y la decisión
 * la toma `leerMediana()` en el dominio. Con menos de tres casos se muestra el CONTEO y se dice por
 * qué: un promedio de dos {procesos} proyectado en una reunión es una anécdota con cara de
 * estadística.
 *
 * @param etiqueta qué se midió
 * @param lectura lo que devolvió `leerMediana()`
 * @param que qué se contaba, en plural y minúscula, para la frase del caso sin mediana
 */
export function MedianaOConteo (
  { etiqueta, lectura, que }: { etiqueta: string, lectura: LecturaDeMediana, que: string }
) {
  const motivo = motivoSinMediana(lectura, que)

  if (lectura.clase === 'mediana') {
    return (
      <div className="flex flex-col gap-1">
        <Cifra
          etiqueta={etiqueta}
          valor={formatearDias(lectura.mediana)}
          detalle={`Mediana de ${lectura.n} · 9 de cada 10 en ${formatearDias(lectura.p90)}`}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Cifra
        etiqueta={etiqueta}
        valor={lectura.clase === 'muestraChica' ? String(lectura.n) : SIN_DATO}
        detalle={lectura.clase === 'muestraChica' ? 'casos, sin mediana' : undefined}
      />
      {motivo !== null && <span className="text-texto-sutil max-w-prose text-xs">{motivo}</span>}
    </div>
  )
}

/**
 * Una {proceso} en cualquiera de las tres listas del tablero.
 *
 * Los ocho campos comunes se dibujan una sola vez: lo que cambia por lista es el `destaque` —la
 * cifra grande de la derecha— y el `cuerpo`, que en las trabas es el motivo y la acción necesaria.
 *
 * El nombre no es enlace. La ruta del portal a una {proceso} cuelga de su {espacio}
 * (`/portal/proyectos/{id}`) y el tablero es transversal: mandar a alguien a una ficha que puede
 * tener la pestaña apagada es ofrecerle una puerta que se le cierra en la cara.
 *
 * @param proceso los campos comunes
 * @param destaque la cifra de la derecha, ya formateada
 * @param rotuloDelDestaque qué es esa cifra
 * @param tono el semáforo del destaque
 * @param cuerpo lo propio de cada lista, debajo de la cabecera
 */
export function FilaDeProceso ({
  proceso,
  destaque,
  rotuloDelDestaque,
  tono = 'neutro',
  cuerpo
}: {
  proceso: ProcesoDeGestion
  destaque: string
  rotuloDelDestaque: string
  tono?: TonoDeCifra
  cuerpo?: React.ReactNode
}) {
  return (
    <li className="border-linea-suave flex flex-col gap-2 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-texto text-sm font-medium">{proceso.name}</p>
          <p className="text-texto-sutil mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>{proceso.project.name ?? `#${proceso.project.id}`}</span>
            {proceso.patente !== null && (
              <span className="font-mono">{proceso.patente}</span>
            )}
            <EstadoDelPortal catalogo="task_statuses" valor={proceso.status} />
            <span>Entrega: {formatearVencimiento(proceso.due_date)}</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span
            data-numerico
            className={cn('block text-lg leading-none font-semibold tabular-nums', TINTA[tono])}
          >
            {destaque}
          </span>
          <span className="text-texto-sutil text-xs">{rotuloDelDestaque}</span>
        </div>
      </div>

      {cuerpo}
    </li>
  )
}

/**
 * Insignia de un responsable. Sólo el del cliente lleva acento: es la única accionable por él.
 *
 * `self-start` no es decoración: la insignia vive dentro de una columna flexible y sin eso se
 * estiraría de borde a borde, que es como una etiqueta de tres palabras termina pareciendo una
 * barra de estado.
 */
export function InsigniaDeResponsable ({ texto, propia }: { texto: string, propia: boolean }) {
  return (
    <Insignia tono={propia ? 'acento' : 'contorno'} tamano="chico" className="self-start">
      {texto}
    </Insignia>
  )
}
