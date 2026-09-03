'use client'

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { BajaYBorrado } from '@/componentes/datos/BajaYBorrado'
import { Boton } from '@/componentes/formularios/Boton'
import { ImagenEntidad } from '@/componentes/presentadores/ImagenEntidad'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { Cliente } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { camposDeCliente } from './campos'

/**
 * Editar, dar de baja y borrar un cliente, desde su ficha.
 *
 * Van en la cabecera del detalle y no en la fila del listado porque un cliente **si** tiene pantalla
 * propia: es ahi donde se ve lo que el borrado se lleva por delante —sus proyectos, sus contactos,
 * sus contratos— antes de pedirlo.
 *
 * Tras guardar se hace `router.refresh()` y no un remontaje: la ficha se resuelve en el servidor, y
 * refrescar baja los datos nuevos sin perder la pestaña abierta ni el scroll.
 */

interface PropsAccionesCliente {
  cliente: Cliente
  /** Catalogo `countries` de `GET /lookups`. */
  paises: OpcionCampo[]
  /** Catalogo `currencies`. */
  monedas: OpcionCampo[]
  capacidades: Capacidad[]
}

export function AccionesCliente ({
  cliente,
  paises,
  monedas,
  capacidades
}: PropsAccionesCliente): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)

  const puedeEditar = capacidades.includes('edit')
  const recargar = (): void => { router.refresh() }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ImagenEntidad
        nombre={cliente.company}
        imagenPropia={cliente.image_url}
        ruta={`clients/${cliente.id}`}
        puedeEditar={puedeEditar}
      />

      {puedeEditar && (
        <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>Editar</Boton>
      )}

      <BajaYBorrado
        ruta={`clients/${cliente.id}`}
        nombre={cliente.company}
        activo={cliente.active}
        puedeEditar={puedeEditar}
        puedeBorrar={capacidades.includes('delete')}
        tamano="chico"
        advertencia={
          `Se borra ${cliente.company} y todo lo que cuelga de él: sus proyectos, sus tareas, sus ` +
          'contactos, sus contratos, sus propuestas y sus gastos. No se puede deshacer.'
        }
        recargar={recargar}
        alBorrar={() => { router.push('/clientes') }}
      />

      {puedeEditar && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={`Editar ${cliente.company}`}
          campos={camposDeCliente(paises, monedas)}
          ruta={`clients/${cliente.id}`}
          metodo="PATCH"
          registro={cliente as unknown as Record<string, unknown>}
          onGuardado={recargar}
          columnas={2}
          ancho="grande"
        />
      )}
    </div>
  )
}
