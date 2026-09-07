'use client'

import { useId, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { guardarAjustes } from '@/datos/recursos'
import {
  detallesDeAjustesLegibles, etiquetaDeAjuste, grupoDeAjustes
} from '@/dominio/ajustes'
import type { AjusteEditable, Ajustes, CambiosDeAjustes } from '@/datos/recursos'

/** Valor de un control mientras se edita. `null` es "la opcion no tiene fila en `tbloptions`". */
type Valor = string | number | boolean | null

interface PropsFormularioDeAjustes {
  /** El cuerpo de `GET /settings` tal como lo trajo el servidor. */
  inicial: Ajustes
  /** Grupo a dibujar (`procesos`, `cronometro`, `listados`, `ia`, ...). */
  grupo: string
  /** Claves de ese grupo, en el orden en que se muestran. */
  claves: string[]
  /** Nombres legibles de las opciones de cada `enum` y `rol`: `clave -> valor -> nombre`. */
  dominios: Record<string, Record<string, string>>
  /** Contenido que se dibuja entre la ayuda del grupo y los controles. */
  children?: React.ReactNode
}

/**
 * Formulario de un grupo de ajustes de la instalacion.
 *
 * Es generico a proposito: cada opcion de `GET /settings` viaja con su tipo y su dominio —`min`,
 * `max`, `options`—, asi que el control se elige de la respuesta y no hay un rango escrito a mano
 * que pueda quedar desincronizado del backend. Una opcion nueva en la whitelist de la API aparece
 * aca sola; solo le falta el nombre legible, que vive en `dominio/ajustes.ts` y que si no esta
 * cae a la clave tecnica en vez de esconder la opcion.
 *
 * Escribe con `guardarAjustes()` y no con `escribirEnBff()` por lo mismo que `AccesoGoogle` y
 * `ModoCorreoAlCliente`: ese helper reduce el error a un mensaje y pierde el `details` del 422, que
 * es lo unico que dice **cual** de las claves rechazo la API.
 *
 * Se manda solo lo que cambio. No es una optimizacion: `PATCH /settings` escribe unicamente las
 * claves presentes y rechaza el cuerpo entero —sin escribir nada— si alguna no pasa su dominio.
 */
export function FormularioDeAjustes ({
  inicial, grupo, claves, dominios, children
}: PropsFormularioDeAjustes): ReactElement {
  const [guardada, setGuardada] = useState(inicial)
  const [valores, setValores] = useState<Record<string, Valor>>(() => valoresDe(inicial, claves))
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [detallesError, setDetallesError] = useState<string[]>([])
  const [confirmado, setConfirmado] = useState(false)

  const { titulo, ayuda } = grupoDeAjustes(grupo)
  const errores = erroresLocales(valores, guardada, claves)
  const cambios = cambiosPendientes(valores, guardada, claves)
  const sucio = Object.keys(cambios).length > 0

  /** Anota un valor y borra el "Guardado" anterior: ya no describe lo que hay en pantalla. */
  function anotar (clave: string, valor: Valor): void {
    setValores((previos) => ({ ...previos, [clave]: valor }))
    setConfirmado(false)
  }

  /**
   * Escribe lo que cambio y reler el estado de la respuesta.
   *
   * El `PATCH` devuelve el mismo cuerpo que el `GET`, asi que los controles se repueblan con lo que
   * la API dice que quedo y no con lo que se mando: si el backend normalizo un valor, se ve.
   */
  async function guardar (): Promise<void> {
    if (!sucio || Object.keys(errores).length > 0) return

    setGuardando(true)
    setErrorGuardar(null)
    setDetallesError([])
    setConfirmado(false)

    const resultado = await guardarAjustes(cambios)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorGuardar(resultado.mensaje)
      setDetallesError(detallesDeAjustesLegibles(resultado.detalles, etiquetasDe(claves)))
      return
    }

    setGuardada(resultado.ajustes)
    setValores(valoresDe(resultado.ajustes, claves))
    setConfirmado(true)
  }

  if (claves.length === 0) {
    return (
      <Seccion titulo={titulo}>
        <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
          La API todavía no publica ninguna opción de este grupo en <code>GET /settings</code>. Hasta que la
          instalación aplique la migración que las crea no hay nada que configurar desde acá.
        </p>
      </Seccion>
    )
  }

  return (
    <Seccion titulo={titulo}>
      <div className="flex flex-col gap-5">
        {ayuda !== '' && <p className="text-texto-tenue text-sm">{ayuda}</p>}

        {children}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {claves.map((clave) => (
            <ControlDeAjuste
              key={clave}
              clave={clave}
              opcion={guardada.editable[clave]}
              valor={valores[clave] ?? null}
              nombres={dominios[clave] ?? {}}
              error={errores[clave]}
              deshabilitado={guardando}
              onCambio={(valor) => { anotar(clave, valor) }}
            />
          ))}
        </div>

        {errorGuardar !== null && (
          <div role="alert" className="text-texto-peligro flex flex-col gap-1 text-sm">
            <p>{errorGuardar}</p>
            {detallesError.length > 0 && (
              <ul className="list-disc pl-5 text-xs">
                {detallesError.map((detalle) => <li key={detalle}>{detalle}</li>)}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={!sucio || Object.keys(errores).length > 0}
            onClick={() => { void guardar() }}
          >
            Guardar
          </Boton>
          {!sucio && (
            <span className="text-texto-sutil text-xs">{confirmado ? 'Guardado' : 'Sin cambios'}</span>
          )}
        </div>
      </div>
    </Seccion>
  )
}

interface PropsControl {
  clave: string
  opcion: AjusteEditable | undefined
  valor: Valor
  nombres: Record<string, string>
  error: string | undefined
  deshabilitado: boolean
  onCambio: (valor: Valor) => void
}

/**
 * Un control, elegido por el `type` que publica la API.
 *
 * `bool`, `entero` y `texto` salen por su rama; el desplegable del final atiende a `enum` y a `rol`,
 * que se dibujan igual —una lista de valores— y solo se diferencian en de donde sale el dominio: el
 * `enum` lo trae en `options` y el `rol` en los roles de `/lookups`, que llegan por `nombres`.
 */
function ControlDeAjuste ({
  clave, opcion, valor, nombres, error, deshabilitado, onCambio
}: PropsControl): ReactElement | null {
  const idCasilla = useId()

  if (opcion === undefined) return null

  const { etiqueta, ayuda } = etiquetaDeAjuste(clave)

  if (opcion.type === 'bool') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-texto flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            id={idCasilla}
            className={CLASES_CASILLA}
            checked={valor === true}
            disabled={deshabilitado}
            aria-describedby={ayuda !== undefined ? `${idCasilla}-ayuda` : undefined}
            onChange={(evento) => { onCambio(evento.target.checked) }}
          />
          {etiqueta}
        </label>
        {ayuda !== undefined && (
          <p id={`${idCasilla}-ayuda`} className="text-texto-tenue pl-6 text-xs">{ayuda}</p>
        )}
      </div>
    )
  }

  if (opcion.type === 'entero') {
    return (
      <Campo etiqueta={etiqueta} ayuda={ayudaConRango(ayuda, opcion)} error={error}>
        {(props) => (
          <Entrada
            {...props}
            type="number"
            inputMode="numeric"
            min={opcion.min}
            max={opcion.max}
            value={valor === null ? '' : String(valor)}
            disabled={deshabilitado}
            onChange={(evento) => {
              const crudo = evento.target.value
              onCambio(crudo === '' ? null : Number(crudo))
            }}
          />
        )}
      </Campo>
    )
  }

  if (opcion.type === 'texto') {
    return (
      <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
        {(props) => (
          <Entrada
            {...props}
            type="text"
            value={valor === null ? '' : String(valor)}
            disabled={deshabilitado}
            onChange={(evento) => { onCambio(evento.target.value) }}
          />
        )}
      </Campo>
    )
  }

  const opciones = opcion.type === 'rol' ? Object.keys(nombres) : opcion.options ?? []

  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error}>
      {(props) => (
        <Selector
          value={valor === null ? undefined : String(valor)}
          disabled={deshabilitado}
          onValueChange={(elegido) => { onCambio(elegido) }}
        >
          <DisparadorSelector marcador="Sin definir" id={props.id} />
          <ContenidoSelector>
            {opciones.map((valorOpcion) => (
              <Opcion key={valorOpcion} value={valorOpcion}>{nombres[valorOpcion] ?? valorOpcion}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>
      )}
    </Campo>
  )
}

/** Los valores guardados de las claves pedidas, listos para poblar los controles. */
function valoresDe (ajustes: Ajustes, claves: string[]): Record<string, Valor> {
  return Object.fromEntries(claves.map((clave) => [clave, ajustes.editable[clave]?.value ?? null]))
}

/**
 * Lo que cambio respecto de lo guardado.
 *
 * Un valor que quedo en `null` —el campo vacio de una opcion sin fila— no se manda: `PATCH` escribe
 * lo presente, y mandar `null` seria pedirle a la API que valide un vacio que no acepta.
 */
function cambiosPendientes (
  valores: Record<string, Valor>, guardada: Ajustes, claves: string[]
): CambiosDeAjustes {
  const cambios: CambiosDeAjustes = {}

  for (const clave of claves) {
    const valor = valores[clave] ?? null

    if (valor !== null && valor !== (guardada.editable[clave]?.value ?? null)) {
      cambios[clave] = valor
    }
  }

  return cambios
}

/**
 * Lo que se puede rechazar sin ir a la API: un entero fuera de su rango o sin numero.
 *
 * No reemplaza a la validacion del backend —ahi esta la de verdad, y su 422 se muestra igual—, pero
 * evita el viaje y, sobre todo, evita que un solo campo mal escrito haga rebotar el grupo entero:
 * el rechazo del `PATCH` es atomico.
 */
function erroresLocales (
  valores: Record<string, Valor>, guardada: Ajustes, claves: string[]
): Record<string, string> {
  const errores: Record<string, string> = {}

  for (const clave of claves) {
    const opcion = guardada.editable[clave]
    const valor = valores[clave] ?? null

    if (opcion === undefined || opcion.type !== 'entero' || valor === null) continue

    if (typeof valor !== 'number' || !Number.isInteger(valor)) {
      errores[clave] = 'Tiene que ser un número entero.'
      continue
    }

    if (opcion.min !== undefined && valor < opcion.min) {
      errores[clave] = `El mínimo es ${opcion.min}.`
      continue
    }

    if (opcion.max !== undefined && valor > opcion.max) {
      errores[clave] = `El máximo es ${opcion.max}.`
    }
  }

  return errores
}

/** Agrega el rango a la ayuda del campo: el dominio lo publica la API y conviene leerlo antes de fallar. */
function ayudaConRango (ayuda: string | undefined, opcion: AjusteEditable): string | undefined {
  if (opcion.min === undefined || opcion.max === undefined) return ayuda

  const rango = `Entre ${opcion.min} y ${opcion.max}.`

  return ayuda === undefined ? rango : `${ayuda} ${rango}`
}

/** Nombres legibles de las claves del grupo, para traducir el `details` del 422. */
function etiquetasDe (claves: string[]): Record<string, string> {
  return Object.fromEntries(claves.map((clave) => [clave, etiquetaDeAjuste(clave).etiqueta]))
}
