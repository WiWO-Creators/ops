import { GLOSARIO } from '@/dominio/glosario'
import { formatearPromedio } from '@/dominio/calidad-tareas'
import { formatearFecha } from '@/lib/fechas'
import type { ResumenCalidadTareas } from '@/datos/recursos'
import { cn } from '@/lib/clases'

/**
 * Los contadores del detector, arriba de la tabla.
 *
 * === Por que es una lectura aparte y no la suma de la tabla ===
 *
 * Porque la tabla esta paginada y filtrada. Sumar las veinticinco filas visibles diria "8 sin
 * descripcion" cuando hay doscientas diez, y filtrar por un Proyecto apagaria el problema del resto.
 * Estos numeros salen de `GET /quality/tasks/summary`, que cuenta sobre TODAS las Tareas visibles
 * para quien mira, y no se mueven cuando se filtra la tabla: eso es lo que los hace comparables de
 * un dia para otro.
 *
 * === Por que el promedio puede no ser un numero ===
 *
 * `nota_promedio` llega en `null` cuando no hay ninguna Tarea evaluada. Un cero ahi diria "todas
 * malas" y lo que pasa es que todavia no hay nada medido, que se arregla esperando a la cola de IA y
 * no escribiendo descripciones.
 *
 * Las tarjetas son las mismas del resto del panel —borde, superficie elevada, numero grande— y no un
 * sistema nuevo: la de Tareas por estado de una persona y la del Proyecto ya se ven asi.
 *
 * @param resumen La foto que devuelve el endpoint, o `null` si esa lectura fallo.
 * @param error El mensaje del error, si lo hubo.
 * @returns La tira de contadores, o un aviso cuando no se pudo leer.
 */
export function ResumenCalidad ({
  resumen,
  error
}: {
  resumen: ResumenCalidadTareas | null
  error: string | null
}) {
  if (resumen === null) {
    return (
      <p role="status" className="text-texto-tenue text-sm">
        {error ?? 'Los contadores no se pudieron cargar. La tabla de abajo sigue sirviendo.'}
      </p>
    )
  }

  const procesos = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <section className="flex flex-col gap-2" aria-label="Resumen de calidad">
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Contador
          etiqueta="Nota promedio"
          valor={formatearPromedio(resumen.nota_promedio)}
          detalle={
            resumen.nota_promedio === null
              ? 'Todavía no hay nada evaluado'
              : `Sobre ${resumen.evaluadas} de ${resumen.total} ${procesos}`
          }
        />
        <Contador
          etiqueta="Sin descripción"
          valor={resumen.sin_descripcion}
          detalle="No dicen qué hay que hacer"
          alarmante={resumen.sin_descripcion > 0}
        />
        <Contador
          etiqueta="Sin responsable"
          valor={resumen.sin_asignado}
          detalle="No hay a quién preguntarle"
          alarmante={resumen.sin_asignado > 0}
        />
        <Contador
          etiqueta="Sin fecha"
          valor={resumen.sin_fecha}
          detalle="No se puede saber si van tarde"
          alarmante={resumen.sin_fecha > 0}
        />
      </ul>

      {/* La letra chica contesta las dos preguntas que el numero grande deja abiertas: cuanto falta
          por evaluar —o el promedio esta hecho sobre menos de lo que parece— y de cuando es la foto. */}
      <p className="text-texto-sutil text-xs">
        {resumen.pendientes_de_ia > 0
          ? `Quedan ${resumen.pendientes_de_ia} descripciones que la IA todavía no miró. `
          : 'La IA ya miró todas las descripciones. '}
        Calculado el {formatearFecha(resumen.calculado_en, true)}.
      </p>
    </section>
  )
}

/**
 * Una tarjeta de contador.
 *
 * `alarmante` pinta el numero en rojo solo cuando hay algo que arreglar: un cero en rojo convierte
 * la buena noticia en una alarma, que es el error tipico de estos tableros.
 */
function Contador ({
  etiqueta,
  valor,
  detalle,
  alarmante = false
}: {
  etiqueta: string
  valor: string | number
  detalle: string
  alarmante?: boolean
}) {
  return (
    <li className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-1 border p-3">
      <span className="text-texto-tenue truncate text-xs font-medium">{etiqueta}</span>
      <span
        className={cn(
          'text-2xl leading-none font-semibold tabular-nums',
          alarmante ? 'text-texto-peligro' : 'text-texto'
        )}
      >
        {valor}
      </span>
      <span className="text-texto-sutil text-xs">{detalle}</span>
    </li>
  )
}
