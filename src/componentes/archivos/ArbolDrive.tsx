'use client'

import { useCallback, useEffect, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import { ExploradorDrive } from '@/componentes/archivos/ExploradorDrive'
import { AccesosDrive } from '@/componentes/archivos/PermisosDrive'
import type { DriveCliente, DriveTarea, RaizDrive } from '@/datos/recursos'

/** Letras del código de Cliente. El backend valida exactamente `[A-Z]{4}`. */
const LARGO_CODIGO_CLIENTE = 4

type Carga<T> =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: T }

/**
 * Lo que trae `GET /{raiz}/{id}/drive` para cualquiera de las tres raices.
 *
 * `folder` sale de `DriveTarea`, que es la forma minima comun a los tres endpoints. `letras` y
 * `patente` son opcionales porque cada endpoint manda solo el campo que le corresponde: los tipos
 * exactos (`DriveCliente`, `DriveEspacio`, `DriveTarea`) quedan en `recursos.ts` para quien consuma
 * cada endpoint por separado.
 */
interface DatosDrive extends DriveTarea {
  letras?: string | null
  patente?: string | null
}

interface Props {
  raiz: RaizDrive
  id: number
}

/** Por que una entidad puede no tener carpeta todavia. Cambia por raiz: no todas nacen igual. */
const SIN_CARPETA: Record<RaizDrive, string> = {
  clients: `Este ${GLOSARIO.cliente.singular} es anterior a esta función, así que no se le creó sola.`,
  projects: `Este ${GLOSARIO.espacio.singular} es anterior a esta función, así que no se le creó sola.`,
  tasks: `Esta ${GLOSARIO.proceso.singular} es anterior a esta función, así que no se le creó sola.`
}

/**
 * Que hace el boton de crear, en las tres raices por igual.
 *
 * Va junto al motivo porque el vacio ya no es solo una explicacion: quien lo lee tiene algo que
 * apretar, y necesita saber que no va a quedar una carpeta a medias ni distinta de las automaticas.
 */
const AL_CREAR = 'Se puede crear ahora: queda igual que una nueva, con las carpetas que falten arriba y los mismos accesos.'

/**
 * Ultimo recurso cuando el `POST` contesta 2xx pero con `folder: null`.
 *
 * No es un error de negocio —esos vienen con su propio mensaje y se muestran tal cual—, es el
 * contrato incumplido. Se dice igual porque volver a dibujar el mismo vacio, sin una linea, se lee
 * como que el boton no hizo nada.
 */
const CREADA_SIN_CARPETA = 'El servidor respondió sin carpeta: no quedó creada. Prueba de nuevo y, si sigue igual, avisa a quien administre el sistema.'

/**
 * Drive de un Cliente, un Proyecto o una Tarea, para la pestaña Archivos: el explorador de su carpeta
 * y la lista de quién tiene acceso.
 *
 * Pide desde el navegador porque es una pestaña que puede no abrirse nunca. `folder: null` es una
 * entidad anterior a esta funcion, que nunca tuvo backfill: es un vacio normal, no un error, y se
 * resuelve creando la carpeta a mano desde el propio vacio.
 */
export function ArbolDrive ({ raiz, id }: Props) {
  const [carga, setCarga] = useState<Carga<DatosDrive>>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState<string | null>(null)

  const reintentar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<DatosDrive>(`${raiz}/${id}/drive`, control.signal)
      .then((sobre) => {
        if (control.signal.aborted) return

        setCarga({ fase: 'listo', datos: sobre.data })
      })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setCarga({
          fase: 'error',
          mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el árbol de Drive.'
        })
      })

    return () => { control.abort() }
  }, [raiz, id, intento])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-40" mensaje="Cargando Drive…" />
  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  const { datos } = carga
  const { folder } = datos

  /**
   * Crea la carpeta que la entidad no tiene y deja la pestaña mostrandola, sin recargar.
   *
   * El `POST` es idempotente y devuelve el mismo cuerpo que el `GET`, asi que alcanza con reemplazar
   * los datos: la pestaña pasa del vacio al arbol sin recargar. Un 2xx sin cuerpo no dice nada de la
   * carpeta y se resuelve pidiendo el `GET` de nuevo; el tipo lleva `| undefined` porque eso es lo
   * que `escribirEnBff` devuelve ahi.
   *
   * El error se muestra tal como lo manda el backend: "Drive no configurado" o "esta Tarea no cuelga
   * de un Espacio" no son fallas de la pantalla, y el boton queda habilitado para reintentar —el
   * `POST` es idempotente, asi que reintentar nunca deja dos carpetas.
   */
  const crearCarpeta = async (): Promise<void> => {
    setCreando(true)
    setErrorCrear(null)

    const resultado = await escribirEnBff<DatosDrive | undefined>(`${raiz}/${id}/drive`, 'POST')

    setCreando(false)

    if (!resultado.ok) {
      setErrorCrear(resultado.mensaje)
      return
    }

    if (resultado.datos === undefined) {
      reintentar()
      return
    }

    if (resultado.datos.folder === null) {
      setErrorCrear(CREADA_SIN_CARPETA)
      return
    }

    setCarga({ fase: 'listo', datos: resultado.datos })
  }

  return (
    <div className="flex flex-col gap-3">
      {raiz === 'clients' && (
        <CodigoCliente
          clienteId={id}
          letrasActuales={datos.letras ?? null}
          onActualizado={(letras) => { setCarga({ fase: 'listo', datos: { ...datos, letras } }) }}
        />
      )}

      {raiz === 'projects' && datos.patente !== null && datos.patente !== undefined && (
        <p className="text-texto-tenue text-sm">
          Patente: <span className="text-texto font-medium">{datos.patente}</span>
        </p>
      )}

      {folder === null
        ? (
          <Vacio
            titulo="Todavía no tiene carpeta en Drive"
            descripcion={`${SIN_CARPETA[raiz]} ${AL_CREAR}`}
            accion={
              <div className="flex flex-col items-center gap-2">
                <Boton
                  variante="primario"
                  tamano="chico"
                  cargando={creando}
                  onClick={() => { void crearCarpeta() }}
                >
                  <FolderPlus className="size-3.5" aria-hidden="true" />
                  Crear carpeta en Drive
                </Boton>

                {errorCrear !== null && (
                  <p role="alert" className="text-texto-peligro max-w-prose text-sm">{errorCrear}</p>
                )}
              </div>
            }
          />
          )
        : (
          <>
            <ExploradorDrive key={folder.id} raiz={raiz} folder={folder} />

            <AccesosDrive folderId={folder.id} raiz={raiz} />
          </>
          )}
    </div>
  )
}

/**
 * Input del codigo de 4 letras del Cliente, del que cuelga la patente de todos sus Espacios.
 *
 * Cambiarlo arrastra en cascada las patentes de sus Espacios y Procesos y el nombre de sus carpetas
 * en Drive: el backend lo hace en una transaccion, aca solo se manda el codigo.
 *
 * El input filtra a A-Z en mayuscula en vez de dejar escribir cualquier cosa y comerse un 422: el
 * backend acepta exactamente `[A-Z]{4}`, y un campo que acepta lo que el servidor rechaza es una
 * trampa, no una validacion.
 */
function CodigoCliente ({ clienteId, letrasActuales, onActualizado }: {
  clienteId: number
  letrasActuales: string | null
  onActualizado: (letras: string) => void
}) {
  const [letras, setLetras] = useState(letrasActuales ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const sucio = letras !== (letrasActuales ?? '')

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(undefined)

    const resultado = await escribirEnBff<DriveCliente>(`clients/${clienteId}/drive`, 'PATCH', { letras })

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onActualizado(resultado.datos.letras ?? letras)
  }

  return (
    <div className="flex items-end gap-2">
      <Campo etiqueta="Código de 4 letras" error={error} className="max-w-32">
        {(props) => (
          <Entrada
            {...props}
            value={letras}
            maxLength={LARGO_CODIGO_CLIENTE}
            placeholder="CNSA"
            onChange={(evento) => {
              setLetras(evento.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
              setError(undefined)
            }}
          />
        )}
      </Campo>

      <Boton
        variante="secundario"
        tamano="chico"
        cargando={guardando}
        disabled={!sucio || letras.length !== LARGO_CODIGO_CLIENTE}
        onClick={() => { void guardar() }}
      >
        Guardar
      </Boton>
    </div>
  )
}

