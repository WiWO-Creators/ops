import type { ValoresFormulario } from '../componentes/proyecto/formulario'

export interface BorradorLicitacion {
  version: 1
  paso: 0 | 1 | 2
  prospectoId: number | null
  contactoId: number | null
  licitacionId: number | null
  valoresProspecto: ValoresFormulario
  valoresContacto: ValoresFormulario
  valoresLicitacion: ValoresFormulario
  pendiente: 'prospecto' | 'contacto' | 'licitacion' | null
}

type Almacenamiento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Crea un borrador vacío, o continúa desde un prospecto ya guardado. */
export function crearBorrador (
  prospectoId: number | null = null,
  valoresProspecto: ValoresFormulario = {}
): BorradorLicitacion {
  if (prospectoId !== null && !esId(prospectoId)) throw new Error('El prospecto no es válido.')
  return {
    version: 1,
    paso: prospectoId === null ? 0 : 1,
    prospectoId,
    contactoId: null,
    licitacionId: null,
    valoresProspecto: { ...valoresProspecto },
    valoresContacto: {},
    valoresLicitacion: {},
    pendiente: null
  }
}

/** Separa los borradores por usuario y prospecto; rechaza identificadores inválidos. */
export function claveBorrador (usuarioId: number, contextoId?: number): string {
  if (!esId(usuarioId) || (contextoId !== undefined && !esId(contextoId))) {
    throw new Error('No se pudo identificar el borrador de esta cuenta.')
  }
  return `wiwo:licitacion:v1:${usuarioId}:${contextoId ?? 'nuevo'}`
}

/** Recupera un borrador validado; ausencia devuelve null, datos corruptos o bloqueo lanzan Error. */
export function leerBorrador (almacenamiento: Almacenamiento, clave: string): BorradorLicitacion | null {
  let texto: string | null
  try {
    texto = almacenamiento.getItem(clave)
  } catch (causa) {
    throw new Error('No se pudo leer el borrador en este navegador.', { cause: causa })
  }
  if (texto === null) return null
  let valor: unknown
  try {
    valor = JSON.parse(texto)
  } catch (causa) {
    throw new Error('El borrador guardado no es válido. Descártalo para comenzar de nuevo.', { cause: causa })
  }
  if (!esBorrador(valor)) {
    throw new Error('El borrador guardado no es válido. Descártalo para comenzar de nuevo.')
  }
  return valor
}

/** Persiste campos y checkpoints; lanza Error si no puede confirmar el guardado local. */
export function guardarBorrador (almacenamiento: Almacenamiento, clave: string, borrador: BorradorLicitacion): void {
  if (!esBorrador(borrador)) throw new Error('No se puede guardar un borrador inválido.')
  try {
    almacenamiento.setItem(clave, JSON.stringify(borrador))
  } catch (causa) {
    throw new Error('No se pudo guardar el borrador en este navegador. No cierres el formulario.', { cause: causa })
  }
}

/** Quita el borrador al finalizar o descartarlo; informa si el navegador impide borrarlo. */
export function eliminarBorrador (almacenamiento: Almacenamiento, clave: string): void {
  try {
    almacenamiento.removeItem(clave)
  } catch (causa) {
    throw new Error('No se pudo eliminar el borrador en este navegador.', { cause: causa })
  }
}

/** Comprueba identificadores persistidos, sin aceptar cero, decimales ni valores fuera de rango. */
function esId (valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
}

/** Comprueba los valores que admiten los formularios sin interpretar contenido del usuario. */
function sonValores (valor: unknown): valor is ValoresFormulario {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) &&
    Object.values(valor).every(campo => typeof campo === 'string' || typeof campo === 'boolean')
}

/** Valida versión, pasos y entidades guardadas antes de restaurar datos del navegador. */
function esBorrador (valor: unknown): valor is BorradorLicitacion {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false
  const borrador = valor as Record<string, unknown>
  return borrador.version === 1 &&
    (borrador.paso === 0 || borrador.paso === 1 || borrador.paso === 2) &&
    (borrador.prospectoId === null || esId(borrador.prospectoId)) &&
    (borrador.contactoId === null || esId(borrador.contactoId)) &&
    (borrador.licitacionId === null || esId(borrador.licitacionId)) &&
    (borrador.licitacionId === null || (esId(borrador.prospectoId) && esId(borrador.contactoId))) &&
    (borrador.paso === 0 || esId(borrador.prospectoId)) &&
    (borrador.paso !== 2 || esId(borrador.contactoId)) &&
    (borrador.contactoId === null || esId(borrador.prospectoId)) &&
    sonValores(borrador.valoresProspecto) && sonValores(borrador.valoresContacto) &&
    sonValores(borrador.valoresLicitacion) &&
    (borrador.pendiente === null || borrador.pendiente === 'prospecto' ||
      borrador.pendiente === 'contacto' || borrador.pendiente === 'licitacion')
}
