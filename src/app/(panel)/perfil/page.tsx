import { pedir } from '@/datos/servidor'
import { FormularioPerfil, type PerfilPropio, type YoConTelefono } from './FormularioPerfil'

export const metadata = { title: 'Mi perfil · WiWO Ops' }

/**
 * Perfil propio, al que se llega desde el avatar de la cabecera.
 *
 * No pide permiso ninguno y no puede pedirlo: todo lo que cuelga de `/me` opera sobre el staff del
 * token y nunca sobre un id de la URL, asi que no hay nada que un parametro pueda desviar hacia la
 * ficha de otra persona.
 *
 * Los dos pedidos van juntos porque son independientes: `/me` trae la identidad —incluido el
 * telefono, que `presentarStaff()` devuelve para esta pantalla— y `/me/perfil` la firma.
 * Encadenarlos sumaria un viaje de red por nada.
 */
export default async function PerfilPage () {
  const [yo, perfil] = await Promise.all([
    pedir<YoConTelefono>('/me'),
    pedir<PerfilPropio>('/me/perfil')
  ])

  return <FormularioPerfil yo={yo.data} perfil={perfil.data} />
}
