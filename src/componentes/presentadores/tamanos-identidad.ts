/**
 * Escala unica de las caras del panel: el `Avatar` redondo de una persona y la `ImagenEntidad`
 * cuadrada de un cliente o un proyecto.
 *
 * Un mismo nombre mide lo mismo en los dos; lo unico que cambia entre ellos es la forma. `ficha` es
 * el tamaño de la cabecera de un detalle, sea de una persona o de un cliente.
 */
export const TAMANOS_IDENTIDAD = {
  chico: 'size-6 text-micro',
  medio: 'size-8 text-xs',
  grande: 'size-10 text-sm',
  ficha: 'size-12 text-base',
  destacada: 'size-16 text-seccion sm:size-20'
} as const

export type TamanoIdentidad = keyof typeof TAMANOS_IDENTIDAD
