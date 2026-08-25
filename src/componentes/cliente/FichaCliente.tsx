import { Vacio } from '@/componentes/estado/Estados'
import { textoDeCampo } from '@/definiciones/espacios'
import type { ClienteConEnvio, EstadoLookup, Moneda } from '@/datos/recursos'
import {
  direccionPrincipal,
  direccionSecundaria,
  lineasDeDireccion,
  preferencias,
  type Dato
} from './cliente'

/**
 * Pestaña Ficha: todo lo que la API sabe del cliente, agrupado por para que sirve.
 *
 * Las secciones sin datos no se dibujan. Una ficha de seis bloques en guion no dice "no hay
 * telefono", dice "esta pantalla no funciona"; se muestra lo que hay, y si no hay nada, un vacio
 * honesto que explica donde se cargan los datos.
 *
 * RUT, telefono y sitio web NO estan aca: los lleva la cabecera, donde se ven sin abrir nada.
 * Repetirlos en la ficha era la duplicacion mas visible de la pantalla.
 *
 * La estructura es tipografica y no de tarjetas: un rotulo en versalita, una linea fina y las filas.
 * Seis recuadros iguales convertirian una ficha en un tablero de nada.
 *
 * @param cliente El cliente ya cargado, con `custom_fields` incluido si la API lo trajo.
 * @param paises Catalogo `countries` de `GET /lookups`, para resolver los `country_id`.
 * @param monedas Catalogo `currencies`, para resolver `default_currency`.
 * @returns La grilla de secciones de la ficha.
 */
interface PropsFicha {
  cliente: ClienteConEnvio
  paises: EstadoLookup[]
  monedas: Moneda[]
}

export function FichaCliente ({ cliente, paises, monedas }: PropsFicha) {
  const direccion = lineasDeDireccion(direccionPrincipal(cliente, paises))
  const facturacion = lineasDeDireccion(direccionSecundaria(cliente.billing, paises))
  const envio = lineasDeDireccion(direccionSecundaria(cliente.shipping, paises))
  const ajustes = preferencias(cliente, monedas)
  const personalizados = camposConValor(cliente)

  const vacia =
    direccion.length === 0 &&
    facturacion.length === 0 &&
    envio.length === 0 &&
    ajustes.length === 0 &&
    personalizados.length === 0 &&
    cliente.lead_id === null

  if (vacia) {
    return (
      <Vacio
        titulo="Este cliente no tiene más datos cargados"
        descripcion="Todo lo que hay de él está arriba. La dirección, la facturación y los campos personalizados se cargan desde el panel clásico: la API v1 expone el cliente de solo lectura."
      />
    )
  }

  return (
    <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      {direccion.length > 0 && (
        <Seccion titulo="Dirección">
          <Renglones lineas={direccion} />
        </Seccion>
      )}

      {facturacion.length > 0 && (
        <Seccion titulo="Facturación">
          <Renglones lineas={facturacion} />
        </Seccion>
      )}

      {envio.length > 0 && (
        <Seccion titulo="Envío">
          <Renglones lineas={envio} />
        </Seccion>
      )}

      {ajustes.length > 0 && (
        <Seccion titulo="Preferencias">
          <Filas datos={ajustes} />
        </Seccion>
      )}

      {personalizados.length > 0 && (
        <Seccion titulo="Campos personalizados">
          <Filas datos={personalizados} />
        </Seccion>
      )}

      {cliente.lead_id !== null && (
        <Seccion titulo="Origen">
          <p className="text-texto text-sm">
            Nació de convertir el prospecto{' '}
            <span className="tabular-nums">#{cliente.lead_id}</span>
          </p>
          <p className="text-texto-sutil mt-1 text-xs">
            La API v1 todavía no expone prospectos, así que no hay adónde enlazar.
          </p>
        </Seccion>
      )}
    </div>
  )
}

/**
 * Los campos personalizados que tienen algo escrito.
 *
 * Perfex guarda los `textarea` pasados por `nl2br()`, asi que los valores llegan con `<br />`
 * incrustado; `textoDeCampo` lo deshace. Un campo definido pero nunca completado no aporta una fila.
 *
 * @param cliente Cliente con `custom_fields` incluido.
 * @returns Una fila por campo con valor, en el orden que devolvio la API.
 */
function camposConValor (cliente: ClienteConEnvio): Dato[] {
  return (cliente.custom_fields ?? [])
    .map((campo) => ({ etiqueta: campo.name, valor: textoDeCampo(campo.value) }))
    .filter((campo) => campo.valor !== '')
}

/** Un grupo de la ficha: rotulo en versalita, linea fina y contenido. */
function Seccion ({ titulo, children }: { titulo: string, children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-linea-suave text-texto-sutil border-b pb-1.5 text-[0.6875rem] font-medium tracking-[0.08em] uppercase">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** Filas rotulo/valor. El rotulo queda tenue y el valor lleva el peso: se lee el dato, no la etiqueta. */
function Filas ({ datos }: { datos: Dato[] }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {datos.map((dato) => (
        <div key={dato.etiqueta} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-texto-tenue min-w-28 text-xs">{dato.etiqueta}</dt>
          <dd className="text-texto font-medium break-words whitespace-pre-line">{dato.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Una direccion, un renglon por linea. */
function Renglones ({ lineas }: { lineas: string[] }) {
  return (
    <address className="text-texto text-sm not-italic">
      {lineas.map((linea) => (
        <span key={linea} className="block">{linea}</span>
      ))}
    </address>
  )
}
