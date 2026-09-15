import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TableroDeIndicadores } from '@/componentes/indicadores/TableroDeIndicadores'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { paramsDeUrl } from '@/datos/consulta'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { ComparacionDeIndicadores } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Indicadores · WiWO Ops' }

/**
 * Línea base de indicadores: los mismos números en dos fechas, y la diferencia.
 *
 * === Para qué existe ===
 *
 * Para poder decir "estábamos así y estamos así" en una reunión de cuenta. Saber que hay 42 Procesos
 * vencidos no sirve si no se sabe si hace dos semanas eran 60 o eran 12; el número sin su fecha de
 * corte no se puede citar en ningún lado, y por eso las dos fechas van a la vista y viajan en la URL.
 *
 * === Por qué no hay botón de recalcular ===
 *
 * Porque los números salen de la foto diaria que el cron ya escribe todas las noches, no de una
 * cuenta hecha al abrir la pantalla. Si se recalcularan al leer, la "foto del 1 de septiembre" se
 * armaría con las Tareas de hoy —las creadas después incluidas— y la comparación no compararía nada.
 * Un indicador que se puede recalcular a pedido es un indicador que se puede acomodar.
 *
 * === La compuerta ===
 *
 * **Gerencia o superadministración**, el mismo corte que la pestaña de Calidad y por el mismo
 * motivo: son números de estructura, para corregir la forma de trabajar. La API vuelve a decidir con
 * la misma llave; esconder el enlace de la barra es cosmética.
 *
 * El `404` de la API —todavía no corrió ninguna foto— no es un error de la pantalla: se muestra
 * tal cual, porque lo que hay que hacer es esperar al cron, no reintentar.
 */
export default async function IndicadoresPage (props: PageProps<'/indicadores'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin && yo.escalon !== 'gerencia') return <SinPermiso className="mt-10" />

  const params = paramsDeUrl(await props.searchParams)

  // Se reenvían tal cual los cuatro parámetros que el recurso declara. Cualquier otro se descarta
  // acá en vez de viajar: la API responde 422 a una clave que no declara, y una URL vieja no puede
  // dejar la pantalla en error.
  const consulta = new URLSearchParams()
  for (const clave of ['corte', 'base'] as const) {
    const valor = params.get(clave)
    if (valor !== null && valor !== '') consulta.set(clave, valor)
  }
  const clienteId = params.get('filter[client_id]')
  if (clienteId !== null && clienteId !== '') consulta.set('filter[client_id]', clienteId)

  const { datos, error } = await pedirOpcional<ComparacionDeIndicadores>(
    `/indicadores${consulta.size === 0 ? '' : `?${consulta.toString()}`}`
  )

  if (datos === null) {
    return (
      <section className="flex flex-col gap-8">
        <TituloModulo titulo="Indicadores" descripcion={DESCRIPCION} />
        <ErrorEstado detalle={error ?? 'No se pudieron leer los indicadores.'} className="mt-4" />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-8">
      <TituloModulo titulo="Indicadores" descripcion={DESCRIPCION} />
      <TableroDeIndicadores comparacion={datos} clienteId={clienteId} />
    </section>
  )
}

/** Qué mide la pantalla, en una línea. Va debajo del título. */
const DESCRIPCION =
  'Los mismos números en dos fechas, para poder decir cuánto se movió la cuenta. Salen de la foto ' +
  'que se guarda cada noche, así que solo se puede comparar contra días en los que el cálculo corrió.'
