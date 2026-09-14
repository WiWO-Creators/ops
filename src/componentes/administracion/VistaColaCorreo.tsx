'use client'

import { type ReactElement } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { COLA_CORREO } from '@/definiciones/cola-correo'
import type { FilaColaCorreo } from '@/datos/recursos'
import type { ResultadoLista } from '@/definiciones/tipos'

interface PropsVistaColaCorreo {
  inicial: ResultadoLista<FilaColaCorreo>
}

/**
 * Envoltorio de cliente para el visor de `tblmail_queue`.
 *
 * Existe solo para mover la frontera Server/Client: `COLA_CORREO` trae funciones `presentar` en sus
 * columnas, y `PanelAvisosPorCorreo` es un Server Component, asi que pasarle la definicion directo a
 * `TablaRecurso` obligaba a serializar esas funciones y rompia la pestaña. Importada desde adentro
 * del limite `'use client'`, la definicion nunca cruza. Es el mismo patron de `VistaHistorial` y
 * `VistaEquipo`.
 *
 * No memoiza la definicion —`TablaRecurso` la usa como dependencia de sus efectos— porque
 * `COLA_CORREO` es una constante de modulo: su referencia ya es estable entre renders.
 */
export function VistaColaCorreo ({ inicial }: PropsVistaColaCorreo): ReactElement {
  return (
    <TablaRecurso
      definicion={COLA_CORREO}
      inicial={inicial}
      claveFila={(fila) => fila.id}
    />
  )
}
