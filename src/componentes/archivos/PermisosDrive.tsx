'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { cargarAsignables } from '@/datos/asignables'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import type {
  PermisoDrive, PersonaAsignable, RaizDrive, RolPermisoDrive, SujetoPermisoDrive
} from '@/datos/recursos'

/**
 * Quién tiene acceso a una carpeta de Drive: la sección desplegada de la pestaña Archivos y el
 * diálogo de una subcarpeta. Salió de `ArbolDrive.tsx` cuando el árbol pasó a ser el explorador.
 */

/** Texto de respaldo cuando el 404 no trae el envelope. */
const SIN_PERMISOS_MANUALES = 'Esta carpeta no lleva permisos manuales: los da el Proyecto o el Cliente.'

/** El `message` del envelope de error, sin avisar incidente. */
async function mensajeSinAviso (respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json() as { error?: { message?: unknown } }
    return typeof cuerpo.error?.message === 'string' ? cuerpo.error.message : SIN_PERMISOS_MANUALES
  } catch {
    return SIN_PERMISOS_MANUALES
  }
}

type CargaPermisos =
  | { fase: 'cargando' }
  /** 404 del backend: esta carpeta no lleva lista de permisos. Es un vacio, no un fallo. */
  | { fase: 'no-gestionable', mensaje: string }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: PermisoDrive[] }

const ETIQUETAS_ROL: Record<RolPermisoDrive, string> = {
  writer: 'Editor',
  commenter: 'Comentador',
  reader: 'Lector'
}

/**
 * Roles que se pueden dar a mano desde acá.
 *
 * `reader` no esta: es el que el backend le pone solo a los contactos del cliente, y el alta manual
 * de esta pantalla es por `staff_id`, o sea siempre alguien del equipo.
 */
const ROLES_MANUALES: RolPermisoDrive[] = ['writer', 'commenter']

/** De donde sale el permiso que el backend sincroniza solo, por raiz. */
const ORIGEN_PERMISOS: Record<RaizDrive, string> = {
  clients: `quien puede ver el ${GLOSARIO.cliente.singular} entra como Editor y sus contactos activos como Lectores`,
  projects: `los miembros del ${GLOSARIO.espacio.singular} entran como Editores`,
  tasks: 'el encargado entra como Editor y el revisor como Comentador'
}

/** Titulo de cada grupo de la lista de accesos. Separa al equipo de la gente del cliente. */
const TITULOS_SUJETO: Record<SujetoPermisoDrive, string> = {
  staff: 'Equipo',
  contact: `Contactos del ${GLOSARIO.cliente.singular}`
}

/**
 * Quien tiene acceso a la carpeta, a la vista en la propia pestaña Archivos.
 *
 * Va desplegado y no detras de un dialogo porque la pregunta que responde —"¿quien ve esto?"— es
 * justamente la que hoy obliga a abrir Drive para contestar. La bajada dice de donde sale cada
 * permiso: la lista refleja lo que Drive tiene, no una intencion guardada de este lado.
 *
 * @param folderId la carpeta de Drive cuyos accesos se listan
 * @param raiz la entidad de la que cuelga, para explicar que sincroniza el backend
 */
export function AccesosDrive ({ folderId, raiz }: { folderId: string, raiz: RaizDrive }) {
  return (
    <section className="border-linea rounded-tarjeta flex flex-col gap-3 border p-3">
      <header className="flex flex-col gap-0.5">
        <h4 className="text-texto-tenue text-sm font-semibold">Quién tiene acceso</h4>
        <p className="text-texto-sutil text-xs">
          Es el permiso real en Drive: {ORIGEN_PERMISOS[raiz]}, y abajo se agrega o se quita a quien haga falta.
        </p>
      </header>

      <GestorPermisosDrive folderId={folderId} />
    </section>
  )
}

/**
 * La lista de accesos de una carpeta de Drive, con su alta y su baja manual.
 *
 * Es el mismo bloque que muestran el dialogo de una subcarpeta y la seccion desplegada de la
 * pestaña: una sola implementacion, dos marcos.
 *
 * El 404 de "esta carpeta no lleva permisos" se distingue de un error real pidiendo la respuesta
 * cruda (`pedirRespuesta`) en vez de `pedirSobre`, que descarta el status junto con el resto de la
 * respuesta.
 *
 * @param folderId la carpeta de Drive sobre la que se leen y escriben los permisos
 */
function GestorPermisosDrive ({ folderId }: { folderId: string }) {
  const [carga, setCarga] = useState<CargaPermisos>({ fase: 'cargando' })
  const [personal, setPersonal] = useState<PersonaAsignable[]>([])
  const [staffId, setStaffId] = useState('')
  const [rol, setRol] = useState<RolPermisoDrive>('writer')
  const [agregando, setAgregando] = useState(false)
  const [errorFormulario, setErrorFormulario] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirRespuesta(`drive/${encodeURIComponent(folderId)}/permissions`, control.signal)
      .then(async (respuesta) => {
        if (control.signal.aborted) return

        if (!respuesta.ok) {
          // El 404 es un vacío esperado —la carpeta de un Proyecto o un Cliente no lleva permisos
          // manuales— y no un fallo: se lee sin pasar por `mensajeDeRespuesta`, que lo avisaba como
          // incidente con código en cada visita a la pestaña Archivos.
          if (respuesta.status === 404) {
            setCarga({ fase: 'no-gestionable', mensaje: await mensajeSinAviso(respuesta) })
            return
          }
          setCarga({ fase: 'error', mensaje: await mensajeDeRespuesta(respuesta) })
          return
        }

        const sobre = await respuesta.json() as { data: PermisoDrive[] }
        setCarga({ fase: 'listo', datos: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return
        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar los permisos.'
        })
      })

    return () => { control.abort() }
  }, [folderId, intento])

  // El catalogo de personal solo hace falta si la carpeta resulta gestionable, y recien ahi se pide.
  // Sale de `cargarAsignables` y no de `GET /staff`: esa ruta exige `staff.view` —lo tienen 19 de 184
  // personas— y dejaba el selector vacio para casi todo el mundo, o sea sin poder compartir con nadie.
  // El correo con el que Drive comparte no viaja aca: lo resuelve el backend desde `staff_id`
  // (`Escritura/Drive.php:360`), asi que la proyeccion minima alcanza.
  useEffect(() => {
    if (carga.fase !== 'listo' || personal.length > 0) return

    // `cargarAsignables` no acepta señal de aborto —la promesa la comparten varios componentes—, asi
    // que el desmontaje se cubre descartando la respuesta, no cancelando la peticion.
    let vivo = true

    void cargarAsignables()
      .then((personas) => { if (vivo) setPersonal(personas) })
      .catch(() => {}) // La lista de permisos ya cargo bien: el formulario de alta queda sin opciones.

    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carga.fase])

  /** Da de alta o cambia el rol de una persona (`POST` es upsert). */
  async function agregar (): Promise<void> {
    if (staffId === '') return

    setAgregando(true)
    setErrorFormulario(null)

    const resultado = await escribirEnBff<{ staff_id: number, role: RolPermisoDrive }>(
      `drive/${encodeURIComponent(folderId)}/permissions`, 'POST', { staff_id: Number(staffId), role: rol }
    )

    setAgregando(false)

    if (!resultado.ok) {
      setErrorFormulario(resultado.mensaje)
      return
    }

    // Se relee en vez de insertar la fila a mano: el alta puede haber quedado sin acceso —correo sin
    // cuenta de Google— y solo el backend sabe en que `estado` quedo.
    setIntento((n) => n + 1)
    setStaffId('')
  }

  /** Quita el acceso de una persona. El backend puede volver a ponerlo si la entidad lo implica. */
  async function quitar (staffIdAQuitar: number): Promise<void> {
    if (carga.fase !== 'listo') return

    setErrorFormulario(null)
    const resultado = await escribirEnBff(`drive/${encodeURIComponent(folderId)}/permissions/${staffIdAQuitar}`, 'DELETE')

    if (!resultado.ok) {
      setErrorFormulario(resultado.mensaje)
      return
    }

    setCarga({ fase: 'listo', datos: carga.datos.filter((p) => p.staff_id !== staffIdAQuitar) })
  }

  if (carga.fase === 'cargando') return <Cargando alto="min-h-24" mensaje="Cargando accesos…" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />
  if (carga.fase === 'no-gestionable') return <p className="text-texto-tenue text-sm">{carga.mensaje}</p>

  return (
    <div className="flex flex-col gap-4">
      {carga.datos.length === 0
        ? <p className="text-texto-tenue text-sm">Todavía no figura nadie con acceso a esta carpeta.</p>
        : <ListaAccesos permisos={carga.datos} onQuitar={(staffId) => { void quitar(staffId) }} />}

      <div className="border-linea flex flex-wrap items-end gap-2 border-t pt-4">
        <Campo etiqueta="Persona" className="min-w-40 flex-1">
          {(props) => (
            <Selector value={staffId} onValueChange={setStaffId}>
              <DisparadorSelector marcador="Elige una persona" id={props.id} />
              <ContenidoSelector>
                {personal.map((persona) => (
                  <Opcion key={persona.id} value={String(persona.id)}>{persona.full_name}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <Campo etiqueta="Rol" className="w-36">
          {(props) => (
            <Selector value={rol} onValueChange={(valor) => { setRol(valor as RolPermisoDrive) }}>
              <DisparadorSelector id={props.id} />
              <ContenidoSelector>
                {ROLES_MANUALES.map((valor) => (
                  <Opcion key={valor} value={valor}>{ETIQUETAS_ROL[valor]}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <Boton
          variante="secundario"
          tamano="chico"
          cargando={agregando}
          disabled={staffId === ''}
          onClick={() => { void agregar() }}
        >
          Agregar
        </Boton>
      </div>

      {errorFormulario !== null && <p role="alert" className="text-texto-peligro text-sm">{errorFormulario}</p>}
    </div>
  )
}

/**
 * La lista de accesos, separando al equipo de los contactos del cliente.
 *
 * Los dos grupos no se mezclan porque no son lo mismo: el equipo edita y los contactos solo miran
 * desde el portal. Mientras el backend no distinga el sujeto —`subject_type` ausente— todas las filas
 * son del equipo y la lista sale plana, sin titulos que separen un solo grupo.
 *
 * Aparte va un tercer grupo con la gente que quedo sin acceso porque su correo no tiene cuenta de
 * Google: no puede ir con el resto, porque el titulo de la seccion promete "quien tiene acceso" y
 * esa gente no lo tiene. Su rol se sigue mostrando, que es lo que va a recibir cuando cree la cuenta.
 *
 * @param permisos las filas tal como las devolvio la API
 * @param onQuitar saca a alguien del equipo de la carpeta
 */
function ListaAccesos ({ permisos, onQuitar }: {
  permisos: PermisoDrive[]
  onQuitar: (staffId: number) => void
}) {
  const otorgados = permisos.filter((permiso) => (permiso.estado ?? 'otorgado') === 'otorgado')
  const sinCuenta = permisos.filter((permiso) => permiso.estado === 'sin_cuenta_google')

  const grupos: Array<[SujetoPermisoDrive, PermisoDrive[]]> = [
    ['staff', otorgados.filter((permiso) => (permiso.subject_type ?? 'staff') === 'staff')],
    ['contact', otorgados.filter((permiso) => permiso.subject_type === 'contact')]
  ]
  // Basta que haya un contacto para que los titulos hagan falta: sin ellos, una lista de solo
  // contactos se leeria como si fuera el equipo.
  const conTitulos = otorgados.some((permiso) => permiso.subject_type === 'contact')

  return (
    <div className="flex flex-col gap-3">
      {grupos.filter(([, filas]) => filas.length > 0).map(([sujeto, filas]) => (
        <div key={sujeto} className="flex flex-col gap-1.5">
          {conTitulos && (
            <p className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
              {TITULOS_SUJETO[sujeto]}
            </p>
          )}

          <ul className="border-linea divide-linea-suave rounded-medio divide-y border">
            {filas.map((permiso) => (
              <FilaAcceso key={`${sujeto}-${permiso.staff_id}`} permiso={permiso} onQuitar={onQuitar} />
            ))}
          </ul>
        </div>
      ))}

      {sinCuenta.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-texto-aviso text-xs font-medium tracking-[0.08em] uppercase">
            Sin acceso todavía
          </p>
          <p className="text-texto-sutil text-xs">
            Drive no comparte con un correo que no tiene cuenta de Google. Se vuelve a intentar solo
            cada vez que se sincroniza la carpeta: el día que la persona cree su cuenta con ese
            correo, entra con el rol que figura acá.
          </p>

          <ul className="border-linea divide-linea-suave bg-superficie-aviso rounded-medio divide-y border">
            {sinCuenta.map((permiso) => (
              <FilaAcceso key={`sin-cuenta-${permiso.staff_id}`} permiso={permiso} onQuitar={onQuitar} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Una persona en la lista de accesos, con su rol y su baja.
 *
 * Es la misma fila para quien tiene el acceso y para quien todavia no: lo que distingue a los
 * segundos es el grupo donde caen, no la fila. El boton de quitar es solo del equipo; el alta y la
 * baja de contactos las maneja el backend con el estado del contacto, asi que un boton aca seria un
 * boton que el backend vuelve a deshacer.
 *
 * @param permiso la fila tal como la devolvio la API
 * @param onQuitar saca a alguien del equipo de la carpeta
 */
function FilaAcceso ({ permiso, onQuitar }: {
  permiso: PermisoDrive
  onQuitar: (staffId: number) => void
}) {
  const esEquipo = (permiso.subject_type ?? 'staff') === 'staff'

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="text-texto truncate font-medium">{permiso.name}</p>
        <p className="text-texto-sutil truncate text-xs">{permiso.email}</p>
      </div>
      <span className="text-texto-tenue shrink-0 text-xs">{ETIQUETAS_ROL[permiso.role]}</span>
      {esEquipo
        ? (
          <Boton
            variante="sutil"
            tamano="chico"
            soloIcono
            aria-label={`Quitar a ${permiso.name}`}
            onClick={() => { onQuitar(permiso.staff_id) }}
          >
            <X className="size-3.5" />
          </Boton>
          )
        : <span className="text-texto-sutil shrink-0 text-xs">Desde el portal</span>}
    </li>
  )
}

/**
 * Los mismos accesos, pero de una subcarpeta del arbol, que no tiene lugar propio en la pantalla.
 *
 * @param folderId la subcarpeta de Drive
 * @param nombre el nombre visible de la subcarpeta, para el encabezado del dialogo
 * @param onCerrar avisa a la fila del arbol que cierre el dialogo
 */
export function DialogoPermisosDrive ({ folderId, nombre, onCerrar }: {
  folderId: string
  nombre: string
  onCerrar: () => void
}) {
  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo="Quién tiene acceso" descripcion={nombre}>
        <div className="flex flex-col gap-4">
          <GestorPermisosDrive folderId={folderId} />

          <div className="flex justify-end">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cerrar</Boton>
            </CerrarDialogo>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
