import type { Referencia } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import type { ClienteElegible } from '@/componentes/formularios/SelectorClientes'
import type { OpcionBuscable } from '@/componentes/formularios/SelectorBuscableMultiple'
import type { OpcionDePersona } from '@/componentes/formularios/SelectorDePersona'

/**
 * Datos inventados para el taller. Ninguna seccion llama al backend: lo que se ve aca tiene que
 * poder abrirse sin sesion y sin API.
 */

/** La persona de la tarjeta flotante: la misma que abre la lista. */
export const PERSONA_DESTACADA: StaffReferencia = { id: 1, full_name: 'Ana Ríos', profile_image_url: null }

export const PERSONAS_DE_EJEMPLO: StaffReferencia[] = [
  PERSONA_DESTACADA,
  { id: 2, full_name: 'Bruno Cabral', profile_image_url: null },
  { id: 3, full_name: 'Carla Méndez', profile_image_url: null },
  { id: 4, full_name: 'Diego Sosa', profile_image_url: null },
  { id: 5, full_name: 'Elena Paz', profile_image_url: null }
]

export const OPCIONES_DE_PERSONA: OpcionDePersona[] = PERSONAS_DE_EJEMPLO.map((persona) => ({
  staffid: persona.id,
  nombre: persona.full_name,
  detalle: persona.id % 2 === 0 ? 'Diseño' : 'Cuentas'
}))

export const OPCIONES_BUSCABLES: OpcionBuscable[] = PERSONAS_DE_EJEMPLO.map((persona) => ({
  id: persona.id,
  nombre: persona.full_name,
  imagen: persona.profile_image_url
}))

export const CLIENTES_DE_EJEMPLO: ClienteElegible[] = [
  { id: 11, company: 'Acme', image_url: null },
  { id: 12, company: 'Globex', image_url: null },
  { id: 13, company: 'Initech', image_url: null }
]

export const ESPACIOS_DE_EJEMPLO: Referencia[] = [
  { id: 21, name: 'Rediseño de marca' },
  { id: 22, name: 'Campaña Q3' },
  { id: 23, name: 'Migración de datos' }
]

export const ETIQUETAS_DE_EJEMPLO = ['urgente', 'cliente', 'interno', 'diseño', 'legal']

/** Lo que la tarjeta flotante mostraria tras `GET /staff/{id}`. */
export const FICHA_DE_EJEMPLO = {
  cargo: { id: 1, name: 'Directora de cuentas' },
  area: { id: 2, name: 'Cuentas' },
  email: 'ana@wiwo.me',
  phonenumber: '+54 11 5555-0101'
}
