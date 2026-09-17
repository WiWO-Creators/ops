'use client'

import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { ControlDeCampo } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { mensajeDeRespuesta } from '@/datos/cliente'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  pendientesDeLicitacion,
  type LicitacionParaPendientes,
  type PendienteDeLicitacion
} from '@/dominio/pendientes-licitacion'

/**
 * Lo que una Licitacion quedo debiendo, arriba de su ficha.
 *
 * === POR QUE EXISTE ===
 *
 * Porque el alta dejo de exigir la persona de contacto: se puede crear la licitacion y cargarla
 * despues. Un hueco que nadie recuerda es un hueco permanente, asi que este es el recordatorio, y va
 * con el camino para taparlo — un aviso sin accion se aprende a ignorar en dos dias.
 *
 * === POR QUE EL FOCAL SE NOMBRA ACA Y EL CONTACTO NO ===
 *
 * El {@link GLOSARIO.focal} es una persona del equipo y se guarda en la licitacion misma
 * (`PATCH /licitaciones/{id}`): elegirlo son dos clics y se hacen donde se lee el aviso. Las personas
 * de contacto son de la EMPRESA y viven en el prospecto —uno solo para todas sus licitaciones—, asi
 * que aca solo va el enlace: duplicar ese formulario garantizaria que las dos pantallas terminen
 * guardando cosas distintas.
 *
 * === CUANDO NO DIBUJA NADA ===
 *
 * Cuando no falta nada, y cuando la licitacion ya se gano o se perdio. `pendientesDeLicitacion`
 * decide las dos cosas; aca no se repite ese criterio.
 */
interface PropsPendientes {
  licitacion: LicitacionParaPendientes
  /** Catalogo `staff` de `GET /lookups`, para nombrar al focal sin salir de la ficha. */
  staff: OpcionCampo[]
  /** Capacidades sobre `projects`: una Licitacion es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
}

export function PendientesLicitacion ({ licitacion, staff, capacidades }: PropsPendientes): ReactElement | null {
  const pendientes = pendientesDeLicitacion(licitacion)

  if (pendientes.length === 0) return null

  return (
    <section
      aria-label="Pendientes por completar"
      className="rounded-tarjeta border-linea-fuerte bg-superficie-aviso mb-6 border-l-4 p-4"
    >
      <h2 className="text-texto-aviso flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle size={16} aria-hidden="true" className="shrink-0" />
        Pendientes por completar
      </h2>

      <ul className="mt-3 flex flex-col gap-4">
        {pendientes.map((pendiente) => (
          <li key={pendiente.clave} className="flex flex-col gap-2">
            <p className="text-texto text-sm font-medium">{pendiente.titulo}</p>
            <p className="text-texto-tenue text-sm">{pendiente.detalle}</p>
            <Accion
              pendiente={pendiente}
              licitacionId={licitacion.id}
              staff={staff}
              puedeEditar={capacidades.includes('edit')}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * El camino para resolver UN pendiente: un enlace a otra pantalla, o el control que lo cierra aca.
 *
 * @param pendiente el pendiente a resolver
 * @param licitacionId la licitacion que se esta viendo
 * @param staff el catalogo de personas del equipo
 * @param puedeEditar si quien mira puede escribir sobre Espacios
 * @returns el control, el enlace, o nada cuando no hay permiso para actuar
 */
function Accion (
  { pendiente, licitacionId, staff, puedeEditar }:
  { pendiente: PendienteDeLicitacion, licitacionId: number, staff: OpcionCampo[], puedeEditar: boolean }
): ReactElement | null {
  if (pendiente.enlace !== null) {
    return (
      <Link
        href={pendiente.enlace.href}
        className="text-acento w-fit text-sm font-semibold underline underline-offset-4"
      >
        {pendiente.enlace.etiqueta}
      </Link>
    )
  }

  if (!puedeEditar) return null

  return <NombrarFocal licitacionId={licitacionId} staff={staff} />
}

/**
 * Nombra al {@link GLOSARIO.focal} de la licitacion sin salir de la ficha.
 *
 * Guarda con `PATCH /licitaciones/{id}`, que acepta `focal_id` y nada del Espacio. Tras guardar hace
 * `router.refresh()` y no esconde la caja por su cuenta: la ficha se resuelve en el servidor, y
 * dejar de mostrar el aviso antes de que el dato este confirmado es como mentir.
 *
 * El catalogo vacio no dibuja un selector muerto: dice que no hay a quien elegir. Pasa cuando
 * `/staff/asignables` falla, que es una lectura opcional a proposito.
 *
 * @param licitacionId la licitacion a la que se le nombra el focal
 * @param staff el catalogo de personas del equipo, ya en forma de opciones
 * @returns el selector con su boton, o el aviso de catalogo vacio
 */
function NombrarFocal (
  { licitacionId, staff }: { licitacionId: number, staff: OpcionCampo[] }
): ReactElement {
  const router = useRouter()
  const [elegido, setElegido] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  if (staff.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        No hay personas del equipo que ofrecer: el catálogo no cargó. Recarga la página para intentarlo de nuevo.
      </p>
    )
  }

  /** Guarda el focal elegido; un id vacío o no numérico no llega a salir del navegador. */
  async function guardar (): Promise<void> {
    const focalId = Number(elegido)

    if (!Number.isSafeInteger(focalId) || focalId <= 0) {
      setFallo(`Elige quién va a ser el ${GLOSARIO.focal.singular}.`)
      return
    }

    setGuardando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/licitaciones/${licitacionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ focal_id: focalId })
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      router.refresh()
    } catch {
      setFallo('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56">
          <ControlDeCampo
            campo={{
              clave: 'focal_id',
              etiqueta: GLOSARIO.focal.singular,
              tipo: 'seleccion',
              // El campo NO se marca como requerido: marcarlo saca del desplegable la opcion vacia, y
              // sin ella el control arranca en blanco —el selector guarda un valor centinela que no
              // corresponde a nadie y Radix no puede dibujar ni el marcador—. Lo que se cambia es su
              // rotulo: «Sin definir» describe el estado actual, no lo que hay que hacer.
              etiquetaSinValor: 'Elige una persona',
              opciones: staff
            }}
            valor={elegido}
            error={undefined}
            alCambiar={(valor) => { setElegido(typeof valor === 'string' ? valor : '') }}
          />
        </div>
        <Boton
          type="button"
          variante="primario"
          tamano="chico"
          cargando={guardando}
          onClick={() => { void guardar() }}
        >
          Nombrar
        </Boton>
      </div>
      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
    </div>
  )
}
