import { PanelTareas } from '@/componentes/proyecto/PanelTareas'
import { PanelTiempos } from '@/componentes/proyecto/PanelTiempos'
import { SeccionTaller } from '@/componentes/estructura/Muestra'

/**
 * Banco de pruebas de la pestaña Tareas y del Registro de horas.
 *
 * La pagina del detalle de un espacio la escribe otro frente: esta existe para poder ver y verificar
 * los dos paneles contra la API real mientras tanto. Monta el proyecto 93, que es el que tiene datos.
 */
const PROYECTO_DE_PRUEBA = 93

export default function TallerTareasPage () {
  return (
    <>
      <SeccionTaller titulo="Tareas del proyecto" nota="Resumen por estado, tabla con acciones masivas y tablero.">
        <PanelTareas proyectoId={PROYECTO_DE_PRUEBA} capacidades={['view', 'create', 'edit', 'delete']} conIa />
      </SeccionTaller>

      <SeccionTaller titulo="Registro de horas" nota="Los permisos por fila y las duraciones los decide el backend.">
        <PanelTiempos proyectoId={PROYECTO_DE_PRUEBA} capacidades={['view', 'create', 'edit', 'delete']} />
      </SeccionTaller>
    </>
  )
}
