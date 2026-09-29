import type { ReactElement } from 'react'
import { LaboratorioDeAnimaciones } from '@/componentes/administracion/LaboratorioDeAnimaciones'
import { SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { NOVEDADES, novedadesDelRecorrido } from '@/dominio/novedades'

export const metadata = { title: 'Animaciones · WiWO Ops' }

/**
 * El laboratorio de las animaciones de actualizacion.
 *
 * La bienvenida solo se ve despues de un despliegue, una vez y al azar: sin esta pantalla, revisar
 * una coreografia nueva exigia publicar y recargar. No toca la API ni guarda nada, pero es de
 * superadministrador igual que el resto de Administracion: es una herramienta del equipo que
 * mantiene Ops, no algo que el resto necesite encontrar.
 */
export default async function AnimacionesPage (): Promise<ReactElement> {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  return (
    <section className="flex flex-col gap-6">
      <TituloModulo
        titulo="Animaciones"
        descripcion="Las coreografías que recibe al equipo después de actualizar y el recorrido de novedades. Acá se repiten sin esperar un despliegue."
      />
      <LaboratorioDeAnimaciones novedades={novedadesDelRecorrido(NOVEDADES)} />
    </section>
  )
}
