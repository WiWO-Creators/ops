import 'server-only'

/**
 * La lectura de `GET /organigrama` desde el servidor, compartida por las dos pantallas que lo montan.
 *
 * Archivo propio y no una función suelta en cada `page.tsx` por dos motivos. Uno: Next sólo acepta
 * exportaciones conocidas en un archivo de página, así que un ayudante exportado desde ahí no
 * compila. Dos: son las dos pantallas del MISMO organigrama, y dos `try`/`catch` copiados es por
 * donde empiezan a divergir — una tratando el 403 y la otra no.
 *
 * Va aparte de `datos/organigrama.ts` —que sólo tiene las formas del contrato— porque aquél lo
 * importan componentes de cliente, y `server-only` en la misma cadena rompe la compilación.
 */
import { ErrorApi } from './errores'
import { pedir } from './servidor'
import type { Organigrama } from './organigrama'

/**
 * Trae el organigrama de quien mira, o el error de la API como valor.
 *
 * Se devuelve el error en vez de lanzarlo para que la página pueda decidir qué dibujar sin construir
 * JSX dentro de un `try`: React no renderiza el JSX en el momento en que se lee, así que un error de
 * render ahí no lo atraparía el `catch` — y el lint del proyecto lo rechaza.
 *
 * @returns la respuesta de `GET /organigrama`, o el `ErrorApi` que devolvió
 * @throws cualquier error que no venga del contrato de la API
 */
export async function cargarOrganigrama (): Promise<Organigrama | ErrorApi> {
  try {
    const { data } = await pedir<Organigrama>('/organigrama')

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
