'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import type { Licitacion, LicitacionDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { nombreDelContacto } from '@/definiciones/licitaciones'
import { GLOSARIO } from '@/dominio/glosario'
import { camposDeCandidata } from './campos'

/**
 * Editar, ganar y perder una Licitacion, desde su ficha.
 *
 * Las tres acciones existen **solo mientras la licitacion esta abierta**: el backend responde 409 a
 * un `PATCH` sobre una ya resuelta, y ganar o perder dos veces no significa nada. Una vez ganada, lo
 * que hay son dos enlaces —al Cliente que se creo y al Espacio, que ya vive en su propia seccion— y
 * la edicion pasa a hacerse alla, sobre el cliente de verdad.
 *
 * Tras cada accion se hace `router.refresh()` y **no** una redireccion: la ficha se resuelve en el
 * servidor, refrescar baja el estado nuevo, y quien acaba de ganar quiere ver el resultado, no
 * aparecer en otra pantalla.
 */
interface PropsAcciones {
  licitacion: LicitacionDetalle
  /** Catalogo `countries` de `GET /lookups`, para el formulario de edicion. */
  paises: OpcionCampo[]
  /** Capacidades sobre `projects`: una Licitacion es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
}

export function AccionesLicitacion ({ licitacion, paises, capacidades }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState<'ganar' | 'perder' | null>(null)

  const abierta = licitacion.estado === 'abierta'
  const puedeEditar = capacidades.includes('edit')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {abierta && puedeEditar && (
        <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
          Editar
        </Boton>
      )}

      {licitacion.estado === 'ganada' && licitacion.client_id !== null && (
        <>
          <Enlace href={`/clientes/${licitacion.client_id}`}>Ver cliente</Enlace>
          {puedeEditar && (
            <Enlace href={`/clientes/${licitacion.client_id}`}>Editar en el cliente</Enlace>
          )}
          <Enlace href={`/espacios/${licitacion.espacio.id}`}>Ver {licitacion.espacio.name}</Enlace>
        </>
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

      {abierta && puedeEditar && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={`Editar ${licitacion.company}`}
          descripcion={`Los datos del ${GLOSARIO.espacio.singular.toLowerCase()} se editan desde su propia ficha.`}
          campos={camposDeCandidata(paises)}
          ruta={`licitaciones/${licitacion.id}`}
          metodo="PATCH"
          registro={licitacion as unknown as Record<string, unknown>}
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}

      <DialogoResultado
        licitacion={licitacion}
        accion={confirmando}
        onCerrar={() => { setConfirmando(null) }}
        onHecho={() => { router.refresh() }}
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

/**
 * Confirmacion de ganar o perder, con las consecuencias escritas **antes** de apretar.
 *
 * El dialogo no se cierra si la llamada falla: cerrarlo dejaria el mensaje de error sin donde
 * mostrarse, y quien lo apreto creyendo que funciono se enteraria recien al recargar.
 *
 * @param accion Cual de las dos se esta confirmando, o `null` cuando el dialogo esta cerrado.
 */
function DialogoResultado ({
  licitacion,
  accion,
  onCerrar,
  onHecho
}: {
  licitacion: Licitacion
  accion: 'ganar' | 'perder' | null
  onCerrar: () => void
  onHecho: () => void
}): ReactElement {
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const ganando = accion === 'ganar'

  /** Llama a la accion; el error es un valor que se muestra, nunca una excepcion que rompa la ficha. */
  async function confirmar (): Promise<void> {
    if (accion === null) return

    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<Licitacion>(`licitaciones/${licitacion.id}/actions/${accion}`, 'POST')

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    cerrar(false)
    onHecho()
  }

  /** Cierra limpiando el error: el mensaje de un intento viejo no debe recibir al siguiente. */
  function cerrar (abierto: boolean): void {
    if (abierto) return

    setFallo(null)
    onCerrar()
  }

  return (
    <Dialogo open={accion !== null} onOpenChange={cerrar}>
      <ContenidoDialogo
        titulo={ganando ? 'Marcar como ganada' : 'Marcar como perdida'}
        descripcion={
          ganando
            ? `Se crea el cliente ${licitacion.company} con ${nombreDelContacto(licitacion.contacto)} como contacto principal, y ${licitacion.espacio.name} pasa a colgar de ese cliente. No se puede deshacer.`
            : `Se archiva ${licitacion.espacio.name} con sus tareas, sus hitos y sus archivos. La licitación queda consultable en el histórico.`
        }
      >
        {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Boton type="button" variante="sutil" onClick={() => { cerrar(false) }}>Cancelar</Boton>
          <Boton
            type="button"
            variante={ganando ? 'primario' : 'peligro'}
            cargando={enviando}
            onClick={() => { void confirmar() }}
          >
            {ganando ? 'Ganar' : 'Perder'}
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
