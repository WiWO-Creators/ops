import Link from 'next/link'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { GLOSARIO } from '@/dominio/glosario'
import type { Cliente } from '@/datos/recursos'
import { enlaceDeSitio } from './cliente'

/**
 * Cabecera del detalle de Cliente: quien es, si sigue activo y como se lo contacta.
 *
 * El foco es el nombre: es el unico dato por el que alguien reconoce al cliente, y todo lo demas
 * —telefono, RUT, sitio— es una linea de apoyo en tono tenue. No hay tarjetas de metricas arriba
 * porque un cliente no tiene un numero que valga esa jerarquia; los conteos viven en su pestaña.
 *
 * @param cliente El cliente ya cargado, con `contacts` incluido si la API lo trajo.
 * @returns El bloque superior de la pantalla.
 */
export function CabeceraCliente ({ cliente }: { cliente: Cliente }) {
  const sitio = enlaceDeSitio(cliente.website)

  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/clientes"
        className="text-texto-sutil hover:text-texto w-fit text-xs font-medium transition-colors"
      >
        ← {GLOSARIO.cliente.plural}
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <Avatar nombre={cliente.company} tamano="grande" />

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-texto text-seccion leading-tight font-semibold">{cliente.company}</h1>
            <Insignia tono={cliente.active ? 'exito' : 'neutro'}>
              {cliente.active ? 'Activo' : 'Inactivo'}
            </Insignia>
            <Etiquetas etiquetas={cliente.tags} maximo={4} />
          </div>

          <dl className="text-texto-tenue flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {cliente.vat !== null && <DatoLinea etiqueta="RUT" valor={cliente.vat} />}
            {cliente.phonenumber !== null && (
              <DatoLinea
                etiqueta="Teléfono"
                valor={<a href={`tel:${cliente.phonenumber}`} className="hover:text-texto">{cliente.phonenumber}</a>}
              />
            )}
            {sitio !== null && (
              <DatoLinea
                etiqueta="Sitio"
                valor={
                  <a
                    href={sitio}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-acento underline-offset-4 hover:underline"
                  >
                    {cliente.website}
                  </a>
                }
              />
            )}
            <DatoLinea etiqueta="Cliente desde" valor={<Fecha valor={cliente.datecreated} />} />
          </dl>
        </div>
      </div>
    </header>
  )
}

/** Un par rotulo/valor de la linea de apoyo. El rotulo va en versalita para no competir con el dato. */
function DatoLinea ({ etiqueta, valor }: { etiqueta: string, valor: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-texto-sutil text-xs tracking-[0.06em] uppercase">{etiqueta}</dt>
      <dd className="text-texto">{valor}</dd>
    </div>
  )
}
