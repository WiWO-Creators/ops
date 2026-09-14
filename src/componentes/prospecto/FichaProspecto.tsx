import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import { nombreDe } from '@/datos/catalogos'
import type { EstadoLookup, ProspectoDetalle } from '@/datos/recursos'
import { etiquetaDeEstadoDeProspecto } from '@/definiciones/prospectos'
import { formatearFecha } from '@/lib/fechas'

/**
 * Pestaña Ficha de un Prospecto: la empresa candidata y en que va su conversion.
 *
 * Las personas de contacto y las licitaciones no se repiten acá: tienen su propia pestaña, que es
 * donde ademas se pueden agregar.
 *
 * Las filas sin valor no se dibujan. Una ficha en guiones no dice "no hay teléfono", dice "esta
 * pantalla no funciona"; se muestra lo que hay.
 *
 * @param prospecto El prospecto ya cargado.
 * @param paises Catalogo `countries` de `GET /lookups`, para resolver `country_id`.
 * @returns Las dos secciones de la ficha.
 */
export function FichaProspecto ({
  prospecto,
  paises
}: {
  prospecto: ProspectoDetalle
  paises: EstadoLookup[]
}) {
  const { cliente } = prospecto

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
    // API devuelve el JSON del alta sin las claves que nadie llenó.
    {
      etiqueta: 'País',
      valor: cliente.country_id == null || cliente.country_id === 0 ? null : nombreDe(paises, cliente.country_id)
    }
  ])

  const seguimiento = conValor([
    { etiqueta: 'Estado', valor: etiquetaDeEstadoDeProspecto(prospecto.estado) },
    { etiqueta: 'Licitaciones', valor: resumenDeLicitaciones(prospecto) },
    { etiqueta: 'Alta', valor: formatearFecha(prospecto.creado_en, true) },
    {
      etiqueta: 'Convertido en cliente',
      valor: prospecto.convertido_en === null ? null : formatearFecha(prospecto.convertido_en, true)
    }
  ])

  return (
    <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2">
      <Seccion titulo="Empresa candidata">
        <Filas datos={empresa} />
      </Seccion>

      <Seccion titulo="Seguimiento">
        <Filas datos={seguimiento} />
      </Seccion>
    </div>
  )
}

/**
 * Los tres contadores en una linea legible.
 *
 * Se escribe "3 (1 abierta, 2 ganadas)" y no tres filas de numeros: el total sin el desglose no dice
 * nada, y el desglose en filas separadas obliga a sumarlas con la vista.
 *
 * @param prospecto El prospecto con sus contadores ya resueltos por la API.
 * @returns La linea, o `null` cuando todavia no tiene ninguna licitacion.
 */
function resumenDeLicitaciones (prospecto: ProspectoDetalle): string | null {
  if (prospecto.licitaciones_total === 0) return null

  const partes: string[] = []

  if (prospecto.licitaciones_abiertas > 0) partes.push(`${prospecto.licitaciones_abiertas} abierta(s)`)
  if (prospecto.licitaciones_ganadas > 0) partes.push(`${prospecto.licitaciones_ganadas} ganada(s)`)

  return partes.length === 0
    ? String(prospecto.licitaciones_total)
    : `${prospecto.licitaciones_total} (${partes.join(', ')})`
}

/**
 * Deja solo las filas que tienen algo escrito.
 *
 * `cliente` viaja tal cual se guardo: la API devuelve el JSON del alta sin completar las claves que
 * nadie llenó, asi que una clave AUSENTE es tan normal como una en `null`. Por eso se comprueba el
 * tipo y no `!== null`.
 *
 * @param filas Rotulos con su valor crudo; ausente, `null` o vacio significa "la API no trajo nada".
 * @returns Las filas con valor, en el mismo orden.
 */
function conValor (filas: Array<{ etiqueta: string, valor: string | null | undefined }>): Dato[] {
  return filas.filter((fila): fila is Dato => typeof fila.valor === 'string' && fila.valor.trim() !== '')
}
