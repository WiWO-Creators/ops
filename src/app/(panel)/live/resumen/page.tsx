import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ResumenDelEquipo } from '@/componentes/live/ResumenDelEquipo'
import { ResumenDelEquipoDias } from '@/componentes/live/ResumenDelEquipoDias'
import { ErrorApi } from '@/datos/errores'
import { rutaDelResumen, type PantallaDelResumen } from '@/datos/resumen-equipo'
import { pedir } from '@/datos/servidor'
import { formatearFecha } from '@/lib/fechas'

export const metadata = { title: 'Resumen del equipo · WiWO Ops' }

/**
 * El resumen del día del equipo: lo que el cron escribe a las 20:00.
 *
 * === QUÉ MUESTRA ===
 *
 * El último resumen guardado, o el del día que pida `?dia=YYYY-MM-DD`, más la lista de días
 * anteriores que tienen uno. Los dos vienen en el MISMO `GET`: la API devuelve `{resumen, dias}`
 * porque la pantalla los necesita siempre juntos, y dos rutas serían dos viajes para pintar una
 * pantalla.
 *
 * === POR QUÉ EL DÍA VA EN LA URL Y NO EN ESTADO DE CLIENTE ===
 *
 * Porque un resumen es algo que se manda: "mirá el del martes" tiene que ser un enlace. Con el día en
 * estado de cliente los treinta días viven detrás de la misma dirección, la vuelta atrás del
 * navegador no funciona, y la pantalla —que no tiene ninguna otra interacción— tendría que hidratarse
 * entera para cambiar de fecha.
 *
 * === LA COMPUERTA ===
 *
 * No hay comprobación de rol acá, y es deliberado. Quién es jefatura lo decide el backend con la
 * escalera de niveles (`Escritura\ResumenDelEquipo::nivelLoVe()`), que mira tres fuentes —las
 * banderas de Perfex, el override por persona y el mapa por rol— y ninguna de las tres viaja entera
 * en `/me`. Duplicar la regla acá con `is_admin` daría una segunda respuesta que se separa de la
 * primera: gerentes y heads verían "sin permiso" en una pantalla a la que la API sí les contesta. El
 * 403 se pinta como 403 y listo.
 *
 * === POR QUÉ NO HAY REFRESCO AUTOMÁTICO ===
 *
 * Porque el dato cambia una vez al día, a las 20:00. `/live` se repregunta sola porque mira el
 * minuto actual; esto mira un día cerrado.
 */
export default async function ResumenDelEquipoPage (props: PageProps<'/live/resumen'>) {
  const { dia } = await props.searchParams
  const pedido = typeof dia === 'string' && dia !== '' ? dia : null

  let pantalla: PantallaDelResumen

  try {
    pantalla = (await pedir<PantallaDelResumen>(rutaDelResumen(pedido))).data
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return (
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Encabezado />
        {error.estado === 403
          ? <SinPermiso className="mt-4" />
          : <ErrorEstado detalle={error.message} className="mt-4" />}
      </section>
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <Encabezado />

      {pantalla.resumen === null
        ? (
          <Vacio
            titulo={pedido === null
              ? 'Todavía no hay ningún resumen'
              : `El ${formatearFecha(pedido)} no tiene resumen`}
            descripcion={pedido === null
              ? 'El primero se escribe solo, a las 20:00 de hoy.'
              : 'El resumen se escribe a las 20:00 de cada día; los días sin corrida no tienen uno.'}
          />
          )
        : <ResumenDelEquipo resumen={pantalla.resumen} />}

      <ResumenDelEquipoDias dias={pantalla.dias} activo={pantalla.resumen?.dia ?? pedido} />
    </section>
  )
}

/** El encabezado, igual en los tres caminos: sin permiso, con error y con resumen. */
function Encabezado () {
  return (
    <TituloModulo
      titulo="Resumen del equipo"
      descripcion="En qué trabajó el equipo cada día, armado a las 20:00 con el tiempo medido en En vivo. Es para jefaturas y describe dónde se fueron las horas, no cómo trabajó nadie."
    />
  )
}
