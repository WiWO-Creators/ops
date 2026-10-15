import { NextResponse } from 'next/server'
import { llamarApi } from '@/datos/api'
import { secretoDeBoletoEnVivo, tiempoDeApiMs, urlDeEnVivo } from '@/datos/config'
import { resolverBoletoDePantalla, type LecturaDePantalla } from '@/lib/en-vivo/boleto-pantalla'

/**
 * `POST /api/pantalla/{codigo}/boleto`: el boleto con el que un televisor abre el bus de «Ops en vivo».
 *
 * Un televisor no tiene sesión: su única credencial es el código de su URL. La ruta comprueba que ese
 * código existe (`GET /public/display/{codigo}` = 200) y que el board declara `meta.en_vivo`, y firma
 * un boleto de 120 s que solo vale para la sala `pantallas`, que no lleva ni ids: la pantalla se entera
 * de «algo cambió» y vuelve a pedir su paquete por la ruta de siempre.
 *
 * Abierta a internet como el resto de `/api/pantalla`: el código no se escribe en ningún log y los
 * errores no dan detalle. 404 `not_found` (código mal formado o inexistente), 503 `upstream_down`
 * (la API no contesta), 503 `en_vivo_apagado` (sin URL, sin secreto o apagado en el board).
 */

export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'no-store' }

/**
 * Lee la pantalla en la API y reduce la respuesta a lo que decide el boleto.
 *
 * @param codigo código ya validado
 * @returns el estado HTTP y si el paquete declara `meta.en_vivo` verdadero
 * @throws Error si la API no contesta a tiempo o la red falla
 */
async function leerPantalla (codigo: string): Promise<LecturaDePantalla> {
  const respuesta = await llamarApi(`/public/display/${encodeURIComponent(codigo)}`, {
    senal: AbortSignal.timeout(tiempoDeApiMs())
  })

  if (respuesta.status !== 200) {
    await respuesta.body?.cancel()

    return { estado: respuesta.status, enVivo: false }
  }

  const sobre = await respuesta.json() as { meta?: { en_vivo?: unknown } }

  return { estado: 200, enVivo: sobre.meta?.en_vivo === true }
}

/** Emite el boleto de la pantalla; ver el docblock del archivo. */
export async function POST (
  _peticion: Request,
  ctx: RouteContext<'/api/pantalla/[codigo]/boleto'>
): Promise<Response> {
  const { codigo } = await ctx.params
  const { estado, cuerpo } = await resolverBoletoDePantalla({
    codigo,
    url: urlDeEnVivo(),
    secreto: secretoDeBoletoEnVivo(),
    leerPantalla
  })

  return NextResponse.json(cuerpo, { status: estado, headers: SIN_CACHE })
}
