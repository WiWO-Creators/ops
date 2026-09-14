import { NextResponse, type NextRequest } from 'next/server'
import { registrarIncidente } from '@/datos/incidentes'
import { leerSesion } from '@/datos/sesion'
import type { Sujeto } from '@/datos/sobre-sesion'

/**
 * Por donde el navegador reporta lo que se le rompio.
 *
 * El BFF registra los errores que le contesta la API, pero hay una familia entera que la API nunca
 * ve: una pantalla que se cae al renderizar, una promesa sin atrapar, la API inalcanzable. Eso solo
 * lo sabe el navegador, y el navegador no puede llamar a la API directamente —el token vive cifrado
 * en una cookie `httpOnly` que solo el servidor abre—, asi que necesita esta puerta.
 *
 * No pasa por `/api/bff/[...ruta]` a proposito: ahi el sujeto se deduce del prefijo de la ruta, y
 * `incidentes` no lo lleva. Aca se prueba primero la sesion del panel y despues la del portal, que
 * es lo que hace que un error del portal quede registrado como del portal y no como uno del equipo.
 *
 * Nunca devuelve error: quien la llama ya esta mostrando un error a una persona, y un fallo al
 * reportar no puede convertirse en un segundo error encima del primero. Si no se pudo registrar,
 * devuelve `incidente: null` y el aviso se muestra sin codigo.
 */

/** Tope del cuerpo que se acepta, en caracteres. Una traza de navegador larga se corta, no se rechaza. */
const CUERPO_MAXIMO = 20000

/** Lo que manda el navegador. Todo llega como texto y nada se cree sin revisar. */
interface CuerpoDeReporte {
  tipo?: unknown
  mensaje?: unknown
  uri?: unknown
  metodo?: unknown
  traza?: unknown
}

/**
 * @returns `{ incidente }` con el codigo de ocho hexadecimales, o `{ incidente: null }`
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  const cuerpo = await leerCuerpo(peticion)

  if (cuerpo === null) {
    return NextResponse.json({ incidente: null }, { status: 200 })
  }

  const mensaje = texto(cuerpo.mensaje)

  // Un reporte sin mensaje no describe nada y ocuparia una fila con un codigo que no lleva a ningun
  // lado. Se contesta como si se hubiera guardado: el navegador no tiene nada mejor que hacer.
  if (mensaje === '') {
    return NextResponse.json({ incidente: null }, { status: 200 })
  }

  const sujeto: Sujeto = await leerSesion('staff') === null ? 'contacto' : 'staff'

  const incidente = await registrarIncidente(
    {
      tipo: texto(cuerpo.tipo) === '' ? 'ErrorDelPanel' : texto(cuerpo.tipo),
      mensaje,
      uri: texto(cuerpo.uri),
      metodo: texto(cuerpo.metodo) === '' ? 'VISTA' : texto(cuerpo.metodo),
      traza: texto(cuerpo.traza)
    },
    sujeto
  )

  return NextResponse.json({ incidente }, { headers: { 'cache-control': 'no-store' } })
}

/** El cuerpo JSON del reporte, o `null` si no vino, no era JSON o venia desmedido. */
async function leerCuerpo (peticion: NextRequest): Promise<CuerpoDeReporte | null> {
  try {
    const crudo = await peticion.text()

    if (crudo === '' || crudo.length > CUERPO_MAXIMO) return null

    return JSON.parse(crudo) as CuerpoDeReporte
  } catch {
    return null
  }
}

/** El valor como cadena, o vacio si no era una cadena. */
function texto (valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}
