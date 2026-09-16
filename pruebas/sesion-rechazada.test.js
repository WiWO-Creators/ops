/**
 * Pruebas del circuito que corta el bucle entre `/colab` e `/inicio`.
 *
 * El bucle aparecia cuando la cookie se abria bien pero la API rechazaba el token: `/inicio` mandaba
 * a `/colab`, `/colab` veia la cookie, concluia que habia sesion y mandaba a `/inicio`. Lo que se
 * prueba aca es exactamente lo que impide que eso se repita — que la salida por token rechazado no
 * sea nunca la pantalla de acceso, y que esa pantalla sepa quedarse quieta.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoDeSesion,
  entradaConMotivo,
  entradaDe,
  PARAMETRO_SESION,
  SESION_CADUCADA,
  salidaPorSesionRechazada,
  vieneDeSesionRechazada
} from '../src/dominio/entrada.ts'

test('cada sujeto entra por su puerta', () => {
  assert.equal(entradaDe('staff'), '/colab')
  assert.equal(entradaDe('contacto'), '/')
})

test('la salida por token rechazado NO es la pantalla de acceso: ahi estaba el bucle', () => {
  for (const sujeto of ['staff', 'contacto']) {
    const salida = salidaPorSesionRechazada(sujeto)

    assert.notEqual(salida, entradaDe(sujeto), sujeto)
    // Tiene que ser un route handler y no una pantalla: solo un route handler puede borrar la cookie,
    // que es lo unico que hace que la pantalla de acceso deje de rebotar.
    assert.ok(salida.startsWith('/api/'), salida)
  }
})

test('la salida del portal se distingue de la del panel: son dos cookies distintas', () => {
  assert.equal(salidaPorSesionRechazada('staff'), '/api/sesion/caducada')
  assert.equal(salidaPorSesionRechazada('contacto'), '/api/sesion/caducada?portal=1')
})

test('la salida deja a cada sujeto en su pantalla de acceso, con el motivo puesto', () => {
  for (const sujeto of ['staff', 'contacto']) {
    const destino = new URL(entradaConMotivo(sujeto), 'https://ops.wiwo.me')

    assert.equal(destino.pathname, entradaDe(sujeto), sujeto)
    assert.equal(destino.searchParams.get(PARAMETRO_SESION), SESION_CADUCADA, sujeto)
    // El segundo cerrojo: el destino de la salida tiene que ser, el mismo, un destino que no rebota.
    assert.equal(vieneDeSesionRechazada(destino.searchParams.get(PARAMETRO_SESION)), true, sujeto)
  }
})

test('solo el marcador exacto frena el rebote', () => {
  assert.equal(vieneDeSesionRechazada(SESION_CADUCADA), true)

  // Sin parametro es una visita normal a la pantalla de acceso: quien ya tiene sesion sigue yendo a
  // su panel, que es lo que evita mostrarle el formulario a quien no lo necesita.
  for (const valor of [undefined, '', 'caducadas', 'CADUCADA', '1', 'true', ['caducada']]) {
    assert.equal(vieneDeSesionRechazada(valor), false, JSON.stringify(valor))
  }
})

test('el aviso solo aparece cuando la sesion se perdio', () => {
  assert.match(avisoDeSesion(SESION_CADUCADA), /sesión caducó/i)
  assert.equal(avisoDeSesion(undefined), null)
  assert.equal(avisoDeSesion(''), null)
  assert.equal(avisoDeSesion('cualquier-cosa'), null)
})
