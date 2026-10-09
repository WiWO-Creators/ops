import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { SeccionTaller } from '@/componentes/estructura/Muestra'
import { Vacio } from '@/componentes/estado/Estados'
import { fuenteDelPanel } from '@/dominio/fuente-proyecto'

/**
 * Lee el proyecto de prueba de la configuracion.
 *
 * @returns el id de `TALLER_PROYECTO_ID`, o `null` si falta o no es un entero positivo
 */
function proyectoDePrueba (): number | null {
  const id = Number(process.env.TALLER_PROYECTO_ID)
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * Banco de pruebas de la pestaña Tareas y del Registro de horas, fuera de la ficha del proyecto.
 *
 * La ficha (`(panel)/proyectos/[id]`) ya monta los dos paneles; esta pagina queda para mirarlos
 * aislados, sin cabecera ni pestañas alrededor. Habla con la API real, asi que pide una sesion
 * abierta y un proyecto con datos: el id sale de `TALLER_PROYECTO_ID` (ver `.env.example`).
 */
export default function TallerTareasPage () {
  const proyectoId = proyectoDePrueba()

  if (proyectoId === null) {
    return (
      <Vacio
        titulo="Falta el proyecto de prueba"
        descripcion="Define TALLER_PROYECTO_ID con el id de un proyecto que tenga tareas y horas, y vuelve a construir."
      />
    )
  }

  return (
    <>
      <SeccionTaller titulo="Tareas del proyecto" nota="Resumen por estado, tabla con acciones masivas y tablero.">
        <PanelTareas proyectoId={proyectoId} fuente={fuenteDelPanel(proyectoId)} capacidades={['view', 'create', 'edit', 'delete']} conIa />
      </SeccionTaller>

      <SeccionTaller titulo="Registro de horas" nota="Los permisos por fila y las duraciones los decide el backend.">
        <PanelTiempos proyectoId={proyectoId} fuente={fuenteDelPanel(proyectoId)} capacidades={['view', 'create', 'edit', 'delete']} />
      </SeccionTaller>
    </>
  )
}
