/**
 * La escalera de permisos: los cinco escalones que se reparten a mano y los dos que no.
 *
 * Vive en un `.ts` y no dentro del diálogo por la regla de `docs/convenciones.md`: Node despoja los
 * tipos de un `.ts` pero no el JSX, así que solo lo que está fuera del componente se puede probar.
 *
 * === Por qué hay DOS diálogos de nivel en la ficha y no uno ===
 *
 * La escalera completa es `usuario < focal < lider < head < gerente < admin < superadmin`, pero sus
 * siete escalones no salen del mismo lugar y no se escriben igual:
 *
 * - **Los cinco de abajo** viven en una tabla propia (`tblwiwo_nivel_persona`) y los reparte este
 *   módulo con `PUT /staff/{id}/nivel`. Son "dónde está esta persona en la casa".
 * - **`admin` y `superadmin`** salen de `tblstaff.admin` y `tblstaff.superadmin`, que son las
 *   columnas que la API consulta de verdad para abrir el panel y la configuración. Los reparte el
 *   diálogo de Nivel, que ya existía (`DialogoNivel`), con sus propios guards.
 *
 * La API **rechaza con 422** un intento de escribir `admin` o `superadmin` por esta puerta, y no es
 * una restricción de pintura: escribirlos acá otorgaría el piso pero ni una de las pantallas que
 * preguntan por la columna, y sería una segunda puerta al nivel administrador que se saltea el guard
 * del último superadministrador activo. Por eso este selector ofrece cinco opciones y no siete.
 *
 * === Heredar no es ser `usuario` ===
 *
 * Sin fila en la tabla, el escalón lo decide el ROL de la persona (`wiwo_permisos_niveles_por_rol`).
 * Por eso la opción "El que dé su rol" existe y manda `null`: quitar el override devuelve a la
 * persona a su default, que puede ser `head` o `gerente`. Ponerla en `usuario` sería una degradación.
 */
import type { NivelPermiso } from '@/datos/tipos'

/**
 * Valor del selector para "sin escalón puesto a mano".
 *
 * No es la cadena vacía porque Radix Select lanza con `value=""`: reserva ese valor para "nada
 * elegido". Nunca viaja a la API — `nivelDelValor()` lo traduce a `null`.
 */
export const HEREDADO = 'rol'

/** Los cinco escalones que esta puerta puede escribir, de menor a mayor. */
export const NIVELES_BASE: Array<{ valor: NivelPermiso, etiqueta: string, ayuda: string }> = [
  {
    valor: 'usuario',
    etiqueta: 'Usuario',
    ayuda: 'Trabaja con lo que tiene asignado. Crea y edita Procesos y Espacios; lo demás lo dice su matriz de permisos.'
  },
  {
    valor: 'focal',
    etiqueta: 'Focal',
    ayuda: 'Es el punto de contacto de uno o más clientes. Ve el semáforo de los clientes donde es focal, y de ningún otro.'
  },
  {
    valor: 'lider',
    etiqueta: 'Líder',
    ayuda: 'Conduce un equipo dentro de un área. No suma lectura global: lo que ve lo sigue diciendo su matriz.'
  },
  {
    valor: 'head',
    etiqueta: 'Head',
    ayuda: 'Conduce un área. Lee los Procesos, los Espacios, los clientes y el equipo de toda la casa.'
  },
  {
    valor: 'gerente',
    etiqueta: 'Gerencia',
    ayuda: 'Todo lo de Head, y ve el semáforo de cada cliente que ya puede ver.'
  }
]

/** Nombre en español de cualquiera de los siete escalones, incluidos los dos que esta puerta no escribe. */
export function etiquetaDeNivel (nivel: NivelPermiso): string {
  if (nivel === 'admin') return 'Administrador'
  if (nivel === 'superadmin') return 'Superadministrador'

  return NIVELES_BASE.find((opcion) => opcion.valor === nivel)?.etiqueta ?? nivel
}

/**
 * Traduce el valor del selector al cuerpo del `PUT`.
 *
 * @param valor Lo que eligió la persona, o `HEREDADO`.
 * @returns El nivel a escribir, o `null` para quitar el override.
 */
export function nivelDelValor (valor: string): NivelPermiso | null {
  return valor === HEREDADO ? null : valor as NivelPermiso
}

/** El valor que le corresponde al selector según lo que devolvió la API. */
export function valorDelNivel (asignado: NivelPermiso | null): string {
  return asignado ?? HEREDADO
}

/**
 * True si las banderas de Perfex están tapando el escalón de la tabla.
 *
 * Pasa cuando la persona es administradora: `Acceso\Permisos::nivel()` lee las banderas ANTES que el
 * override, así que el escalón que se elija acá queda guardado pero no gobierna nada hasta que
 * alguien le quite esa condición. Decirlo es la diferencia entre un formulario que guarda y una
 * pantalla que miente.
 */
export function loTapaLaBandera (efectivo: NivelPermiso): boolean {
  return efectivo === 'admin' || efectivo === 'superadmin'
}
