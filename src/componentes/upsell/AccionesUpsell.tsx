'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { DialogoEliminarProyecto } from '@/componentes/proyecto/DialogoEliminarProyecto'
import { DialogoResultado } from '@/componentes/proyecto/DialogoResultado'
import { guardarEdicionCombinada } from '@/componentes/proyecto/edicion-combinada'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import { cuerpoDelFormulario, valoresIniciales, type OpcionCampo } from '@/componentes/proyecto/formulario'
import { aTextoPlano } from '@/componentes/proyecto/formatos'
import type { UpsellDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { camposDeEdicionDeUpsell, partirEdicionDeUpsell } from './campos'

/**
 * Editar, ganar, perder y eliminar un Upsell, desde su ficha.
 *
 * Ganar y perder existen **solo mientras la oportunidad esta abierta**: ganar o perder dos veces no
 * significa nada, y el backend responde 409. Una vez ganada, aparece el enlace al Espacio, que desde
 * ese momento ya vive en su seccion.
 *
 * **Editar es un solo formulario sobre dos recursos**, como en la licitacion: el nombre, las fechas y
 * la descripcion viven en el Espacio, y `guardarEdicionCombinada` reparte lo que cambio entre
 * `PATCH /projects/{id}` y `PATCH /upsells/{id}`. Sigue disponible tras cerrarla, porque corregir el
 * monto de una oportunidad ganada es un caso real; perdida, el Espacio queda archivado y la API no
 * deja tocarlo, asi que solo se ofrece lo propio.
 *
 * **Eliminar** existe en cualquier estado porque sirve para lo que no debio crearse, no para cerrar
 * la oportunidad. Es `DELETE /projects/{id}`, que arrastra la fila de `tblapi_upsells` por la FK.
 *
 * Ganar **no crea a nadie**, a diferencia de una licitacion: el cliente ya existe y el Espacio ya
 * cuelga de el. Lo unico que cambia es que deja de estar escondido, tambien del portal del cliente,
 * y el diálogo lo dice con esas palabras.
 *
 * Tras cada accion se hace `router.refresh()` y **no** una redireccion: la ficha se resuelve en el
 * servidor, refrescar baja el estado nuevo, y quien acaba de ganar quiere ver el resultado.
 */
interface PropsAcciones {
  upsell: UpsellDetalle
  /** Catalogo `currencies` de `GET /lookups`, para el formulario de edicion. */
  monedas: OpcionCampo[]
  /** Capacidades sobre `projects`: un Upsell es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
}

export function AccionesUpsell ({ upsell, monedas, capacidades }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState<'ganar' | 'perder' | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const abierta = upsell.estado === 'abierta'
  const puedeEditar = capacidades.includes('edit')
  const puedeEliminar = capacidades.includes('delete')
  const cliente = upsell.client?.company ?? 'el cliente'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {upsell.client_id !== null && <Enlace href={`/clientes/${upsell.client_id}`}>Ver cliente</Enlace>}

      {upsell.estado === 'ganada' && (
        <Enlace href={`/proyectos/${upsell.espacio.id}`}>Ver {upsell.espacio.name}</Enlace>
      )}

      {puedeEditar && (
        <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
          Editar
        </Boton>
      )}

      {abierta && puedeEditar && (
        <>
          <Boton variante="primario" tamano="chico" onClick={() => { setConfirmando('ganar') }}>
            Ganar
          </Boton>
          <Boton variante="peligro" tamano="chico" onClick={() => { setConfirmando('perder') }}>
            Perder
          </Boton>
        </>
      )}

      {puedeEliminar && (
        <Boton variante="peligro" tamano="chico" onClick={() => { setEliminando(true) }}>
          Eliminar
        </Boton>
      )}

      {puedeEditar && (
        <EdicionUpsell
          upsell={upsell}
          monedas={monedas}
          abierto={editando}
          onAbiertoCambia={setEditando}
          onGuardado={() => { router.refresh() }}
        />
      )}

      <DialogoResultado
        base={`upsells/${upsell.id}`}
        accion={confirmando}
        motivo="Por qué (opcional)"
        descripcion={{
          ganar: `${upsell.espacio.name} pasa a ser un proyecto normal de ${cliente}: aparece entre sus proyectos, en los totales y en su portal. No se crea ningún cliente ni contacto.`,
          perder: `Se archiva ${upsell.espacio.name} con sus tareas, sus hitos y sus archivos. La oportunidad queda consultable en el histórico, y el cliente nunca la ve.`
        }}
        onCerrar={() => { setConfirmando(null) }}
        onHecho={() => { router.refresh() }}
      />

      <DialogoEliminarProyecto
        espacio={eliminando ? upsell.espacio : null}
        tipo={GLOSARIO.upsell.singular}
        onCerrar={() => { setEliminando(false) }}
        onEliminado={() => { router.replace('/upsells') }}
      />
    </div>
  )
}

/** Un enlace con el aspecto de boton secundario, para no pintar un `<button>` que navega. */
function Enlace ({ href, children }: { href: string, children: React.ReactNode }): ReactElement {
  return (
    <Link
      href={href}
      className="border-control-borde bg-control text-texto hover:bg-hover rounded-control inline-flex h-8 items-center px-3 text-xs font-semibold"
    >
      {children}
    </Link>
  )
}

interface PropsEdicion {
  upsell: UpsellDetalle
  monedas: OpcionCampo[]
  abierto: boolean
  onAbiertoCambia: (abierto: boolean) => void
  onGuardado: () => void
}

/**
 * El formulario unico de edicion: el Espacio, la oportunidad y el seguimiento.
 *
 * La descripcion se siembra en texto plano porque asi la muestra la ficha; si nadie la toca no viaja,
 * y una descripcion con formato hecha en el panel viejo queda intacta.
 */
function EdicionUpsell ({ upsell, monedas, abierto, onAbiertoCambia, onGuardado }: PropsEdicion): ReactElement {
  const conEspacio = !upsell.espacio.archived
  const campos = camposDeEdicionDeUpsell(monedas, conEspacio)
  const registro = {
    ...upsell,
    espacio: { ...upsell.espacio, description: aTextoPlano(upsell.espacio.description ?? '') }
  }
  const cliente = upsell.client?.company ?? 'el cliente'

  return (
    <FormularioRecurso
      abierto={abierto}
      onAbiertoCambia={onAbiertoCambia}
      titulo={`Editar la oportunidad de ${cliente}`}
      descripcion={conEspacio
        ? 'El cliente no se cambia: si la oportunidad es de otro, se elimina y se crea de nuevo.'
        : `El ${GLOSARIO.espacio.singular.toLowerCase()} quedó archivado al perderla: solo se corrigen los datos de la oportunidad.`}
      campos={campos}
      ruta={`upsells/${upsell.id}`}
      metodo="PATCH"
      registro={registro}
      columnas={2}
      ancho="grande"
      enviar={async (cuerpo) => {
        const inicial = cuerpoDelFormulario(campos, valoresIniciales(campos, registro))
        const error = await guardarEdicionCombinada(
          { espacio: `projects/${upsell.espacio.id}`, propia: `upsells/${upsell.id}` },
          partirEdicionDeUpsell(cuerpo, inicial)
        )

        // Con la mitad guardada tambien se refresca: la ficha tiene que mostrar lo que ya quedo.
        if (error !== null && error.parcial) onGuardado()

        return error?.mensaje ?? null
      }}
      onGuardado={onGuardado}
    />
  )
}
