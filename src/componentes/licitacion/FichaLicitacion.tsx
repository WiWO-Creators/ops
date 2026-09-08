import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import { nombreDe } from '@/datos/catalogos'
import type { EstadoLookup, Licitacion } from '@/datos/recursos'
import { etiquetaDeEstado, nombreDelContacto } from '@/definiciones/licitaciones'
import { formatearFecha } from '@/lib/fechas'

/**
 * Pestaña Ficha de una Licitacion: la empresa candidata y su contacto.
 *
 * Lo del Espacio —descripcion, plazos, montos— no se repite aca: lo muestra `PanelDescripcion`, que
 * es el mismo panel del detalle de un Espacio y va debajo de esta ficha.
 *
 * Las filas sin valor no se dibujan. Una ficha en guiones no dice "no hay teléfono", dice "esta
 * pantalla no funciona"; se muestra lo que hay.
 *
 * @param licitacion La licitacion ya cargada.
 * @param paises Catalogo `countries` de `GET /lookups`, para resolver `country_id`.
 * @returns Las dos secciones de la ficha.
 */
export function FichaLicitacion ({
  licitacion,
  paises
}: {
  licitacion: Licitacion
  paises: EstadoLookup[]
}) {
  const { cliente, contacto } = licitacion

  const empresa = conValor([
    { etiqueta: 'Nombre o razón social', valor: cliente.company },
    { etiqueta: 'RUT', valor: cliente.vat },
    { etiqueta: 'Teléfono', valor: cliente.phonenumber },
    { etiqueta: 'Sitio web', valor: cliente.website },
    { etiqueta: 'Dirección', valor: cliente.address },
    { etiqueta: 'Ciudad', valor: cliente.city },
    { etiqueta: 'Región', valor: cliente.state },
    { etiqueta: 'Código postal', valor: cliente.zip },
    // `0` es como Perfex escribe «ningún país»: no tiene nombre que resolver. Ausente tampoco: la
    // API devuelve el JSON del alta sin las claves que nadie llenó, y `nombreDe(paises, undefined)`
    // pintaba «#undefined» en la ficha.
    {
      etiqueta: 'País',
      valor: cliente.country_id == null || cliente.country_id === 0 ? null : nombreDe(paises, cliente.country_id)
    }
  ])

  const persona = conValor([
    { etiqueta: 'Nombre', valor: nombreDelContacto(contacto) },
    { etiqueta: 'Cargo', valor: contacto?.title },
    { etiqueta: 'Correo', valor: contacto?.email },
    { etiqueta: 'Teléfono', valor: contacto?.phonenumber }
  ])

  const seguimiento = conValor([
    { etiqueta: 'Estado', valor: etiquetaDeEstado(licitacion.estado) },
    { etiqueta: 'Alta', valor: formatearFecha(licitacion.creada_en, true) },
    {
      etiqueta: licitacion.estado === 'perdida' ? 'Perdida el' : 'Ganada el',
      valor: licitacion.resultado_en === null ? null : formatearFecha(licitacion.resultado_en, true)
    }
  ])

  return (
    <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      <Seccion titulo="Empresa candidata">
        <Filas datos={empresa} />
      </Seccion>

      <Seccion titulo="Contacto">
        <Filas datos={persona} />
      </Seccion>

      <Seccion titulo="Seguimiento">
        <Filas datos={seguimiento} />
      </Seccion>
    </div>
  )
}

/**
 * Deja solo las filas que tienen algo escrito.
 *
 * `cliente` y `contacto` viajan tal cual se guardaron: la API devuelve el JSON del alta sin
 * completar las claves que nadie llenó, asi que una clave AUSENTE es tan normal como una en `null`.
 * Por eso se comprueba el tipo y no `!== null`: sin eso, una candidata sin sitio web tumbaba la
 * pantalla entera con `Cannot read properties of undefined (reading 'trim')`.
 *
 * @param filas Rotulos con su valor crudo; ausente, `null` o vacio significa "la API no trajo nada".
 * @returns Las filas con valor, en el mismo orden.
 */
function conValor (filas: Array<{ etiqueta: string, valor: string | null | undefined }>): Dato[] {
  return filas.filter((fila): fila is Dato => typeof fila.valor === 'string' && fila.valor.trim() !== '')
}
