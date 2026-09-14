import { PanelFocals } from '@/componentes/focals/PanelFocals'
import { SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import {
  agruparPorCliente,
  RUTA_CLIENTES_FOCAL,
  RUTA_CLIENTES_TODOS,
  RUTA_ESPACIOS_FOCAL,
  RUTA_ESPACIOS_TODOS,
  type CuentaFocal,
  type ScoreEspacio
} from '@/datos/focals'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { ScoreCliente } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { puedeVerTodosLosFocals } from '@/dominio/permisos'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'

export const metadata = { title: `${GLOSARIO.focal.plural} · WiWO Ops` }

/**
 * La pantalla del Focal: las cuentas de las que uno responde, con su semáforo y el de cada
 * {@link GLOSARIO.espacio}.
 *
 * === Qué es un Focal, y por qué esta pantalla existe ===
 *
 * El Focal es quien responde por un cliente. Hasta ahora ese dato vivía escondido en una pestaña de
 * la ficha del cliente, y para saber cómo iban sus cuentas había que abrirlas de a una. Esta
 * pantalla es esa lista, ordenada por lo que está peor.
 *
 * === La misma pantalla, dos lecturas ===
 *
 * Para un Focal es SU cartera: las cuentas de las que responde. Para la superadministración y la
 * gerencia es la cartera ENTERA, con el nombre del focal al lado de cada cuenta — como si fueran
 * focal de todas, sin que nadie las tenga que agregar una por una. Lo decide
 * {@link puedeVerTodosLosFocals}, y lo único que cambia es si la llamada lleva `?focal=me`: la ruta
 * es la misma y el permiso también, porque la API ya le abre la cartera entera a quien alcanza el
 * escalón (`V1::scoresRuta()`).
 *
 * === Por qué las dos llamadas van en paralelo y no anidadas ===
 *
 * Podrían ser una por cliente —los {@link GLOSARIO.espacio} de cada uno—, y serían N+1 peticiones
 * para una cartera de doce cuentas. Cada ruta devuelve de una sola vez todo lo que esta persona
 * puede ver, y el agrupado se hace acá, donde no cuesta nada.
 *
 * === Esconder no autoriza ===
 *
 * La llave es la misma que ya usa el semáforo del cliente y la aplica la API: `lider` y `usuario`
 * reciben 403 en las dos rutas. Este `catch` existe para mostrar una pantalla que se entienda, no
 * para decidir quién entra; sin él la ruta mostraría el límite de error genérico.
 */
export default async function FocalsPage () {
  const yo = await pedir<Yo>('/me')
  const todas = puedeVerTodosLosFocals(yo.data)
  const [cuentas, error] = await cargarCartera(todas)

  if (error !== null) {
    return (
      <section className="flex flex-col gap-4">
        <TituloModulo titulo={GLOSARIO.focal.plural} />
        <SinPermiso />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={GLOSARIO.focal.plural}
        descripcion={
          (todas
            ? 'Todas las cuentas, de la que peor está a la que mejor, con quien responde por cada una. '
            : 'Las cuentas de las que respondes, de la que peor está a la que mejor. ') +
          'El puntaje sale de la fórmula —cumplimiento de plazos, carga y vencimientos—; el estado ' +
          `en palabras lo redacta ${ASISTENTE} a partir de esas mismas señales.`
        }
      />

      {cuentas.length === 0
        ? <CarteraVacia todas={todas} />
        : <PanelFocals cuentas={cuentas} mostrarFocal={todas} />}
    </section>
  )
}

/**
 * El vacío dice cosas distintas según quién mire: a un Focal, que no responde por ninguna cuenta; a
 * una gerencia, que no hay ni un cliente con semáforo calculado, que es un problema del cron y no
 * suyo. Un solo texto para los dos mandaría a la gerencia a buscarse en una pestaña de cliente.
 */
function CarteraVacia ({ todas }: { todas: boolean }) {
  const focal = GLOSARIO.focal.singular.toLowerCase()

  if (todas) {
    return (
      <Vacio
        titulo="Todavía no hay cuentas con semáforo"
        descripcion={
          'El puntaje lo calcula una corrida diaria. Si la lista sigue vacía mañana, es que esa ' +
          'corrida no está pasando.'
        }
      />
    )
  }

  return (
    <Vacio
      titulo={`No eres ${focal} de ningún cliente`}
      descripcion={`El ${focal} de una cuenta se nombra desde la ficha del cliente, en su pestaña ${GLOSARIO.focal.plural}.`}
    />
  )
}

/**
 * Los clientes y los {@link GLOSARIO.espacio} de quien mira, ya agrupados.
 *
 * El 403 se devuelve como valor y no se relanza porque cambia la pantalla entera, no un pedazo.
 * Cualquier otro error sube y lo muestra el límite de error de la ruta: un 500 de la API no es lo
 * mismo que "no tienes permiso" y no puede contarse igual.
 *
 * @param todas si la pantalla es la cartera entera y no la propia
 * @returns las cuentas agrupadas, o el error de permiso que impidió armarlas
 */
async function cargarCartera (todas: boolean): Promise<[CuentaFocal[], ErrorApi | null]> {
  try {
    const [clientes, espacios] = await Promise.all([
      pedir<ScoreCliente[]>(todas ? RUTA_CLIENTES_TODOS : RUTA_CLIENTES_FOCAL),
      pedir<ScoreEspacio[]>(todas ? RUTA_ESPACIOS_TODOS : RUTA_ESPACIOS_FOCAL)
    ])

    return [agruparPorCliente(clientes.data, espacios.data), null]
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.codigo === 'forbidden') return [[], fallo]

    throw fallo
  }
}
