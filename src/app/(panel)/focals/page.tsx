import { PanelFocals } from '@/componentes/focals/PanelFocals'
import { SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { agruparPorCliente, RUTA_CLIENTES_FOCAL, RUTA_ESPACIOS_FOCAL, type ScoreEspacio } from '@/datos/focals'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { ScoreCliente } from '@/datos/recursos'
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
 * === Por qué las dos llamadas van en paralelo y no anidadas ===
 *
 * Podrían ser una por cliente —los {@link GLOSARIO.espacio} de cada uno—, y serían N+1 peticiones
 * para una cartera de doce cuentas. `?focal=me` devuelve de una sola vez todo lo que esta persona
 * puede ver, y el agrupado se hace acá, donde no cuesta nada.
 *
 * === Esconder no autoriza ===
 *
 * La llave es la misma que ya usa el semáforo del cliente y la aplica la API: `lider` y `usuario`
 * reciben 403 en las dos rutas. Este `catch` existe para mostrar una pantalla que se entienda, no
 * para decidir quién entra; sin él la ruta mostraría el límite de error genérico.
 */
export default async function FocalsPage () {
  const [cuentas, error] = await cargarCartera()

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
          'Las cuentas de las que respondes, de la que peor está a la que mejor. El puntaje sale de ' +
          'la fórmula —cumplimiento de plazos, carga y vencimientos—; el estado en palabras lo ' +
          `redacta ${ASISTENTE} a partir de esas mismas señales.`
        }
      />

      {cuentas.length === 0
        ? (
          <Vacio
            titulo={`No eres ${GLOSARIO.focal.singular.toLowerCase()} de ningún cliente`}
            descripcion={`El ${GLOSARIO.focal.singular.toLowerCase()} de una cuenta se nombra desde la ficha del cliente, en su pestaña ${GLOSARIO.focal.plural}.`}
          />
          )
        : <PanelFocals cuentas={cuentas} />}
    </section>
  )
}

/**
 * Los clientes y los {@link GLOSARIO.espacio} de quien mira, ya agrupados.
 *
 * El 403 se devuelve como valor y no se relanza porque cambia la pantalla entera, no un pedazo.
 * Cualquier otro error sube y lo muestra el límite de error de la ruta: un 500 de la API no es lo
 * mismo que "no tienes permiso" y no puede contarse igual.
 *
 * @returns las cuentas agrupadas, o el error de permiso que impidió armarlas
 */
async function cargarCartera (): Promise<[ReturnType<typeof agruparPorCliente>, ErrorApi | null]> {
  try {
    const [clientes, espacios] = await Promise.all([
      pedir<ScoreCliente[]>(RUTA_CLIENTES_FOCAL),
      pedir<ScoreEspacio[]>(RUTA_ESPACIOS_FOCAL)
    ])

    return [agruparPorCliente(clientes.data, espacios.data), null]
  } catch (fallo) {
    if (fallo instanceof ErrorApi && fallo.codigo === 'forbidden') return [[], fallo]

    throw fallo
  }
}
