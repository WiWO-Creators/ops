'use client'

import { Repeat2 } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Desviacion, EstadoSla } from '@/componentes/presentadores/EstadoSla'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { InsigniaHito } from '@/componentes/presentadores/Hito'
import { PARAMETRO_TAREA, urlConParametro } from '@/componentes/datos/tabla'
import { PROCESOS, textoDeAprobacion } from '@/definiciones/procesos'
import { SIN_DATO } from '@/lib/sla'
import type { Proceso } from '@/datos/recursos'
import type { Columna, DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Las celdas de Procesos que necesitan JSX.
 *
 * Viven aparte de `src/definiciones/procesos.ts` porque ese archivo es un `.ts`: las pruebas lo
 * corren con el runner de Node, que despoja tipos pero **no** JSX. Ni un enlace ni un avatar caben
 * alli, y lo que hay alla es el texto que baja al CSV.
 *
 * Viven aparte de cada pantalla porque son **las mismas** en las dos vistas de Procesos —la global y
 * la pestaña Tareas de un Espacio—, y estuvieron duplicadas literalmente hasta que las dos vistas se
 * desincronizaron: una decia "Vence" y la otra "Fecha de vencimiento". Un solo lugar por celda es lo
 * que impide que vuelva a pasar.
 */

/** Presentadores ricos por clave de columna. Lo que no esta aca se queda con el texto de la definicion. */
const CELDAS: Record<string, (proceso: Proceso) => ReactElement> = {
  name: (proceso) => <EnlaceTarea proceso={proceso} />,
  project: (proceso) => <EnlaceEspacio proceso={proceso} />,
  task_type: (proceso) => <TipoDeTarea proceso={proceso} />,
  // El texto pelado de `procesos.ts` es el que baja al CSV; en pantalla el hito es una insignia
  // recortada.
  milestone: (proceso) => <InsigniaHito hito={proceso.milestone} />,
  // Los nombres de los asignados desbordaban la celda y se cortaban a mitad de palabra: la cara
  // identifica a la persona en menos ancho, y el nombre sigue disponible en el `title` y para el
  // lector de pantalla. Es el mismo grupo apilado que ya usan el tablero y el calendario.
  assignees: (proceso) => <GrupoAvatares personas={proceso.assignees} />,
  // El vencimiento sale del presentador unico, igual que en el tablero: ademas de leerse "Sin fecha"
  // cuando no hay plazo, se colorea segun cuan cerca esta.
  due_date: (proceso) => <Fecha valor={proceso.due_date} comoVencimiento />,
  eta: (proceso) => <Fecha valor={proceso.eta ?? null} />,
  start_date: (proceso) => <Fecha valor={proceso.start_date} />,
  date_added: (proceso) => <Fecha valor={proceso.date_added} />,
  // La desviacion y el SLA son la señal compartida con el detalle, el tablero y el Inicio, y salen
  // del presentador unico. Una celda con `null` no dibuja nada y el motor deja la raya.
  desviacion: (proceso) => <Desviacion dias={proceso.desviacion_dias} />,
  estado_sla: (proceso) => <EstadoSla estado={proceso.estado_sla} />,
  // La aprobacion va al lado del SLA porque lo explica: el texto lo arma `textoDeAprobacion` en la
  // definicion —es el mismo que baja al CSV— y acá se le suma la fecha y el comentario del cliente
  // en el `title`, que es lo que hacía falta para no tener que abrir la ficha.
  aprobacion: (proceso) => <CeldaAprobacion proceso={proceso} />,
  aprobacion_comentario: (proceso) => (
    <TextoLargo valor={proceso.approval?.comentario ?? null} />
  ),
  justificacion: (proceso) => <TextoLargo valor={proceso.justificacion?.texto ?? null} />,
  tags: (proceso) => <Etiquetas etiquetas={proceso.tags} />
}

/**
 * Estado de la aprobacion con su fecha: la de respuesta si el cliente contesto, y si no la del
 * pedido.
 *
 * La fecha es la mitad del dato. "Pendiente" sin fecha no dice nada; "Pendiente desde el 3 de
 * septiembre" es una deuda de aprobacion que alguien tiene que ir a golpear.
 */
function CeldaAprobacion ({ proceso }: { proceso: Proceso }): ReactElement {
  const aprobacion = proceso.approval
  const instante = aprobacion?.resuelta_en ?? aprobacion?.solicitada_en ?? null
  const comentario = aprobacion?.comentario ?? null

  return (
    <div
      className="flex min-w-0 flex-col gap-0.5"
      title={comentario === null || comentario === '' ? undefined : `Dijo el cliente: ${comentario}`}
    >
      <span className="truncate text-sm">{textoDeAprobacion(proceso)}</span>
      {instante !== null && (
        <span className="text-texto-sutil text-xs">
          <Fecha valor={instante} />
        </span>
      )}
    </div>
  )
}

/**
 * Texto de varias lineas recortado a una, con el contenido entero en el `title`.
 *
 * Las dos columnas que lo usan —el comentario del cliente y la justificacion del equipo— guardan
 * hasta 2000 caracteres, y una celda que crece hasta ahi rompe la tabla.
 */
function TextoLargo ({ valor }: { valor: string | null }): ReactElement {
  if (valor === null || valor === '') return <span className="text-texto-sutil">{SIN_DATO}</span>

  return <span className="line-clamp-2 text-sm" title={valor}>{valor}</span>
}

/**
 * Las columnas de Procesos con sus celdas de pantalla.
 *
 * Conserva la columna entera —clave, encabezado, orden, visibilidad— y cambia solo `presentar`: el
 * set de columnas lo manda la definicion, no esta funcion.
 *
 * @param columnas las columnas de la definicion, con sus presentadores de texto
 * @returns las mismas columnas, con la celda rica donde exista
 */
export function conCeldasRicas (columnas: Array<Columna<Proceso>>): Array<Columna<Proceso>> {
  return columnas.map((columna) => {
    const celda = CELDAS[columna.clave]

    return celda === undefined ? columna : { ...columna, presentar: celda }
  })
}

/**
 * La definicion global de Procesos, navegable.
 *
 * Se arma una sola vez a nivel de modulo: `TablaRecurso` memoiza contra la identidad de la
 * definicion, y reconstruirla en cada render volveria a pintar todas las celdas.
 */
export const PROCESOS_NAVEGABLES: DefinicionRecurso<Proceso> = {
  ...PROCESOS,
  columnas: conCeldasRicas(PROCESOS.columnas)
}

/**
 * El nombre de la tarea, como enlace al detalle.
 *
 * Lee `useSearchParams` por su cuenta en vez de recibir la URL por prop: `presentar` solo recibe la
 * fila, y un componente propio es la unica forma de que el enlace conserve los parametros vigentes
 * —filtros, orden, pagina— sin atar la definicion memoizada al estado.
 *
 * Es un `<a>` de verdad y no un `div` con `onClick`: asi el detalle se abre con el teclado, se copia
 * el enlace y se abre en otra pestaña. El clic de la fila entera es comodidad encima de esto, no en
 * su lugar, y lo maneja el motor, que se abstiene cuando el clic nacio en un enlace.
 */
function EnlaceTarea ({ proceso }: { proceso: Proceso }): ReactElement {
  const params = useSearchParams()

  return (
    <Link
      href={urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TAREA, String(proceso.id))}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {proceso.name}
      {/* Copia de una recurrencia: un icono y no una insignia, porque es un dato de contexto y no un
          estado. Solo si la API manda `recurring_from_id`; sin la clave no se dibuja nada. */}
      {typeof proceso.recurring_from_id === 'number' && (
        <span title="Copia de una tarea recurrente" className="ml-1.5 inline-flex align-[-2px]">
          <Repeat2 size={13} role="img" aria-label="Copia de una tarea recurrente" className="text-texto-sutil" />
        </span>
      )}
    </Link>
  )
}

/**
 * El espacio de la tarea, como enlace a su pantalla.
 *
 * Son dos destinos distintos en la misma fila y confundirlos es peor que no tener el enlace: el
 * nombre abre el detalle sin salir del listado, el espacio navega a su pantalla.
 *
 * Una tarea puede no tener espacio: ahi va una raya y no una celda vacia, que se confunde con un
 * dato que no cargo.
 */
function EnlaceEspacio ({ proceso }: { proceso: Proceso }): ReactElement {
  if (proceso.project === null) return <span className="text-texto-sutil">—</span>

  return (
    <Link
      href={`/proyectos/${proceso.project.id}`}
      className="text-texto-tenue hover:text-acento underline-offset-4 hover:underline"
    >
      {proceso.project.name}
    </Link>
  )
}

/** Tipo de tarea. Trae sus dos colores de la base y por eso se pintan con `style`. */
function TipoDeTarea ({ proceso }: { proceso: Proceso }): ReactElement {
  const tipo = proceso.task_type

  if (tipo === null || tipo === undefined) return <span className="text-texto-sutil">—</span>

  return (
    <span
      className="rounded-control inline-flex items-center px-2 py-0.5 text-xs font-medium"
      // Los dos colores los administra quien configura los tipos en Perfex: son datos, no tokens.
      style={{
        backgroundColor: tipo.label_color ?? undefined,
        color: tipo.text_color ?? undefined
      }}
    >
      {tipo.name}
    </span>
  )
}
