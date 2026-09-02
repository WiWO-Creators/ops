'use client'

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { MiembroEquipo } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { EQUIPO } from '@/definiciones/equipo'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { AccionesPersona } from './AccionesPersona'
import { camposDePersona } from './campos'

/**
 * Listado del Equipo con su alta, su edicion y sus dos formas de eliminar.
 *
 * Envuelve a `TablaRecurso` en vez de reimplementarla: el filtrado, el orden, la paginacion y la URL
 * ya los resuelve el motor. Lo unico propio es la barra de arriba y los controles por fila, que el
 * motor pinta a traves de `filaExtra` porque necesitan dialogos y el menu declarativo solo sabe de
 * llamadas sin cuerpo.
 *
 * Quien hereda el trabajo de una persona borrada lo pide `AccionesPersona` al abrir su dialogo, no
 * esta pantalla: es una lista que casi nunca se mira y no vale un viaje por cada visita al listado.
 */

interface PropsVistaEquipo {
  inicial: ResultadoLista<MiembroEquipo>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

export function VistaEquipo ({
  inicial,
  capacidades = [],
  opcionesDeFiltro
}: PropsVistaEquipo): ReactElement {
  const router = useRouter()
  const [creando, setCreando] = useState(false)

  const roles: OpcionCampo[] = (opcionesDeFiltro?.roles ?? []).map((opcion) => ({
    valor: String(opcion.valor),
    etiqueta: opcion.etiqueta
  }))

  return (
    <div className="flex flex-col gap-3">
      {capacidades.includes('create') && (
        <div className="flex justify-end">
          <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
            Nueva persona
          </Boton>
        </div>
      )}

      <TablaRecurso
        definicion={EQUIPO}
        inicial={inicial}
        capacidades={capacidades}
        {...(opcionesDeFiltro === undefined ? {} : { opcionesDeFiltro })}
        claveFila={(persona) => persona.id}
        filaExtra={(persona, recargar) => (
          <AccionesPersona
            persona={persona}
            roles={roles}
            capacidades={capacidades}
            recargar={recargar}
          />
        )}
      />

      {capacidades.includes('create') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo="Nueva persona"
          descripcion="No se envía ningún correo: la contraseña hay que entregarla por otro medio."
          campos={camposDePersona(roles, true)}
          ruta="staff"
          metodo="POST"
          onGuardado={() => { router.refresh() }}
        />
      )}
    </div>
  )
}
