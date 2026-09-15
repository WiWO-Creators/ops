import test from 'node:test'
import assert from 'node:assert/strict'
import { unstable_getResponseFromNextConfig, getRedirectUrl } from 'next/experimental/testing/server.js'
import nextConfig from '../next.config.ts'
import { pantallaDeRuta } from '../src/dominio/pantalla.ts'

test('enlaces guardados de proyectos redirigen permanentemente y conservan consulta', async () => {
  for (const sufijo of ['', '?filter[member]=7', '/44?tab=actas&acta=9', '/plantillas', '/plantillas-hito?page=2']) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://ops.example/espacios${sufijo}`, nextConfig
    })
    assert.equal(response.status, 308)
    const destino = new URL(getRedirectUrl(response))
    const esperado = new URL(`https://ops.example/proyectos${sufijo}`)
    assert.equal(destino.pathname, esperado.pathname)
    assert.deepEqual([...destino.searchParams], [...esperado.searchParams])
  }
})

test('rutas nuevas y recursos internos no entran en la redirección legado', async () => {
  for (const ruta of ['/proyectos/44?tab=actas', '/portal/proyectos/44', '/api/scores/espacios', '/espacios-extra']) {
    const response = await unstable_getResponseFromNextConfig({ url: `https://ops.example${ruta}`, nextConfig })
    assert.equal(getRedirectUrl(response), null, ruta)
  }
})

test('presencia y Orb canonicalizan proyectos sin alterar otros nombres de ruta', () => {
  for (const [entrada, salida] of [
    ['/espacios', '/proyectos'], ['/Espacios/44', '/proyectos/44'],
    ['/proyectos/44', '/proyectos/44'], ['/espacios-extra', '/espacios-extra'],
    ['/portal/proyectos/44', '/portal/proyectos/44'], ['', null],
    ['/espacios/44?tab=actas', null], ['/espacios/%2f44', null]
  ]) assert.equal(pantallaDeRuta(entrada), salida)
})
