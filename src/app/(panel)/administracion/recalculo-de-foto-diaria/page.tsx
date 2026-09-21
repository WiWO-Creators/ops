import type { ReactElement } from 'react'
import { RecalculoDeFotoDiaria } from '@/componentes/administracion/RecalculoDeFotoDiaria'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { pedirOpcional } from '@/datos/servidor'
import type { Espacio } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { GLOSARIO } from '@/dominio/glosario'

export const metadata = { title: 'Recálculo de la foto diaria · WiWO Ops' }

/**
 * Cuántos Proyectos se traen para el selector. El mismo tope que usan `/procesos` y la calidad.
 *
 * Es la cartera entera y no una página: el selector es buscable, y una lista recortada por el
 * paginador deja fuera justo al Proyecto que se vino a corregir.
 */
const TOPE_DE_OPCIONES = 500

/**
 * El recálculo manual de la foto diaria de un {@link GLOSARIO.espacio}.
 *
 * Es la única escritura de la rama `/scores`, y existe porque la foto diaria es inmutable por
 * diseño: corregir una fecha de entrega limpia el incumplimiento de la {@link GLOSARIO.proceso} al
 * instante, pero los días ya fotografiados del {@link GLOSARIO.espacio} conservan el número viejo
 * para siempre. La decisión de producto fue mantener el histórico inmutable y dar esta salida
 * acotada —un {@link GLOSARIO.espacio}, un rango corto— para usar después de una corrección
 * justificada (punto 4 del requerimiento del 15/09).
 *
 * **Sin compuerta por rol en esta página, a propósito.** La de verdad la pone la API: el endpoint
 * exige administración y responde 403 con su mensaje. Replicar acá esa regla sería una segunda copia
 * que puede quedar desincronizada de la que manda, y esconder no autoriza.
 */
export default async function RecalculoDeFotoDiariaPage (): Promise<ReactElement> {
  // `pedirOpcional` y no `pedir`: que el catálogo no venga no puede tumbar la pantalla con una
  // excepción. El componente muestra el motivo y no ofrece el formulario, que sin Proyectos que
  // elegir no serviría de nada.
  const catalogo = await pedirOpcional<Espacio[]>(`/projects?per_page=${TOPE_DE_OPCIONES}&sort=name`)

  const espacios: OpcionFiltro[] = (catalogo.datos ?? []).map((espacio) => ({
    valor: String(espacio.id),
    // La patente es como el equipo nombra un Proyecto en voz alta; el nombre solo no alcanza para
    // distinguir dos homónimos de clientes distintos.
    etiqueta: espacio.patente == null ? espacio.name : `${espacio.patente} · ${espacio.name}`
  }))

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Recálculo de la foto diaria"
        descripcion={`La foto diaria de un ${GLOSARIO.espacio.singular.toLowerCase()} se guarda una vez por día y no se vuelve a tocar. Acá se reescribe a mano un tramo, después de una corrección justificada.`}
      />

      <RecalculoDeFotoDiaria espacios={espacios} errorCatalogo={catalogo.error} />
    </section>
  )
}
