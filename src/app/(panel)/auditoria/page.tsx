import { PanelActividad } from '@/componentes/auditoria/PanelActividad'
import { PanelCalidadTareas } from '@/componentes/calidad/PanelCalidadTareas'
import { SinPermiso } from '@/componentes/estado/Estados'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { paramsDeUrl } from '@/datos/consulta'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  VISTAS_DE_AUDITORIA,
  vistaElegida,
  vistasPermitidas,
  type VistaAuditoria
} from '@/dominio/vistas-de-auditoria'

export const metadata = { title: 'Auditoría · WiWO Ops' }

/** La línea que explica cada pestaña. Cambia con la pestaña porque no miran lo mismo. */
const DESCRIPCIONES: Record<VistaAuditoria, string> = {
  actividad:
    'Actividad de trabajo del equipo dentro de Ops: en qué pantalla está cada quien, qué sesiones hay abiertas y qué se hizo. No se registra nada de lo que se escribe ni nada fuera de la aplicación.',
  calidad:
    `Qué tan bien escritas están las ${GLOSARIO.proceso.plural.toLowerCase()}: si la descripción explica qué hay que hacer, si hay alguien a cargo y si hay fecha. La nota es del trabajo escrito, no de la persona.`
}

/**
 * Centro de auditoría.
 *
 * Son dos pantallas bajo un mismo techo, y la pestaña se elige por URL (`?vista=`) y no con estado
 * de cliente: así se comparte por enlace, "atrás" hace lo que la persona espera y —lo importante—
 * **sólo se pide lo de la pestaña abierta**. Con paneles montados a la vez habría que traer los
 * cinco recursos de Actividad para mirar la tabla de calidad.
 *
 * === LA COMPUERTA, AHORA POR PESTAÑA ===
 *
 * Antes la pantalla entera exigía `is_superadmin`. Hoy eso vale para **Actividad**, que sigue siendo
 * la misma exigencia que hacen sus cuatro rutas; **Calidad** también le corresponde a gerencia,
 * porque no mira a las personas sino al trabajo escrito. Quien no cumple ninguna de las dos ve "sin
 * permiso", igual que antes. El reparto vive en `dominio/vistas-de-auditoria.ts`, que es lo único de
 * esto que se puede probar.
 *
 * **Con una sola pestaña permitida no se dibuja la barra**: un control con una alternativa no es un
 * control, y ofrecer la otra sólo llevaría a un `403`.
 *
 * === POR QUÉ LOS ENLACES DE LA BARRA NO ARRASTRAN LA CONSULTA ===
 *
 * Porque las dos tablas tienen whitelists distintas. Pasar de Actividad filtrada por `type` a
 * Calidad con ese `filter[type]` en la URL sería un `422` en la primera carga —el backend no ignora
 * un filtro que no declara—, así que cada pestaña arranca con su vista limpia.
 */
export default async function AuditoriaPage (props: PageProps<'/auditoria'>) {
  const { data: yo } = await pedir<Yo>('/me')

  const permitidas = vistasPermitidas(yo)
  const params = paramsDeUrl(await props.searchParams)
  const vista = vistaElegida(params.get('vista'), permitidas)

  if (vista === null) return <SinPermiso className="mt-10" />

  const opciones: OpcionSegmentada[] = VISTAS_DE_AUDITORIA
    .filter((entrada) => permitidas.includes(entrada.clave))
    .map((entrada) => ({
      valor: entrada.clave,
      etiqueta: entrada.etiqueta,
      href: `/auditoria?vista=${entrada.clave}`
    }))

  return (
    <section className="flex flex-col gap-8">
      <TituloModulo titulo="Auditoría" descripcion={DESCRIPCIONES[vista]} />

      {opciones.length > 1 && (
        <Segmentado
          etiqueta="Secciones de la auditoría"
          opciones={opciones}
          activo={vista}
          tamano="medio"
        />
      )}

      {vista === 'actividad'
        ? <PanelActividad params={params} />
        : <PanelCalidadTareas params={params} yo={yo} />}
    </section>
  )
}
