'use client'

import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenuMarcable,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { CAMPOS_DE_TARJETA } from '@/componentes/proyecto/tarjeta-tarea'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * El menu que decide que campos pinta cada tarjeta del tablero.
 *
 * Es el gemelo de "Columnas" de `ControlesTabla`, pero **no es el mismo control y no comparte su
 * estado**. La tabla tiene diecinueve columnas y la tarjeta sabe pintar seis; ademas, en la vista de
 * tablero no hay ninguna `TablaRecurso` montada de la que heredar nada, y el portal del cliente usa
 * este mismo tablero: un menu generico de columnas le daria al contacto control sobre una tabla que
 * ahi no existe.
 *
 * Las opciones salen de intersecar `CAMPOS_DE_TARJETA` con las columnas de la definicion vigente, y
 * las etiquetas del `encabezado` de esa columna: asi "Inicio" y "Seguidores" se llaman igual en la
 * tabla y en el tablero, y un renombre futuro llega a los dos sin tocar este archivo.
 */

interface PropsMenuCamposTarjeta<T> {
  definicion: DefinicionRecurso<T>
  /** Claves encendidas hoy. */
  campos: string[]
  onCampos: (campos: string[]) => void
}

export function MenuCamposTarjeta<T> ({ definicion, campos, onCampos }: PropsMenuCamposTarjeta<T>) {
  // En el orden de dibujo de la tarjeta, no en el de la tabla: el menu se lee como la tarjeta.
  const disponibles = CAMPOS_DE_TARJETA
    .map((clave) => definicion.columnas.find((columna) => columna.clave === clave))
    .filter((columna) => columna !== undefined)

  // Un tablero cuya definicion no declara ninguno de los campos podables no tiene nada que ofrecer:
  // un menu vacio es peor que ninguno.
  if (disponibles.length === 0) return null

  /**
   * Enciende o apaga un campo, conservando el orden de dibujo de la tarjeta.
   *
   * Misma regla que `alternarColumna`: el ultimo encendido no se puede apagar. Una tarjeta sin
   * ningun campo sigue mostrando su esqueleto —nombre, estado, fecha—, pero el menu quedaria sin
   * ninguna marca y sin forma obvia de volver atras.
   *
   * @param clave La clave del campo que se marco o desmarco.
   */
  function alternarCampo (clave: string): void {
    const encendido = campos.includes(clave)
    const siguiente = disponibles
      .map((columna) => columna.clave)
      .filter((suya) => (suya === clave ? !encendido : campos.includes(suya)))

    if (siguiente.length > 0) onCampos(siguiente)
  }

  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton tamano="chico" variante="sutil">Campos de la tarjeta</Boton>
      </DisparadorMenu>
      <ContenidoMenu align="end">
        {disponibles.map((columna) => (
          <ItemMenuMarcable
            key={columna.clave}
            checked={campos.includes(columna.clave)}
            onCheckedChange={() => { alternarCampo(columna.clave) }}
          >
            {columna.encabezado}
          </ItemMenuMarcable>
        ))}
      </ContenidoMenu>
    </MenuContextual>
  )
}
