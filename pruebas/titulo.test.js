/**
 * Pruebas del formato de titulo de los nombres de Tarea y de Proyecto.
 *
 * Lo que hay que proteger no es que arregle los gritos: es que NO toque nada mas. Un nombre feo se
 * edita; un nombre corrompido —una sigla convertida en palabra, una marca con la caja cambiada— no
 * se nota hasta que alguien lo busca y no lo encuentra.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enFormatoTitulo } from '../src/lib/titulo.ts'

test('arregla el nombre gritado y baja las atonas', () => {
  assert.equal(enFormatoTitulo('REVISAR EL PLAN DE MEDIOS'), 'Revisar el Plan de Medios')
  assert.equal(enFormatoTitulo('CAMPAÑA DE VERANO PARA LA MARCA'), 'Campaña de Verano para la Marca')
})

test('la primera palabra va en mayuscula aunque sea atona', () => {
  assert.equal(enFormatoTitulo('EL CIERRE DEL TRIMESTRE'), 'El Cierre del Trimestre')
})

test('techo conocido: una palabra de hasta tres letras se trata como sigla', () => {
  // "MES" y "SAC" son indistinguibles por forma. Se elige dejar la palabra gritada antes que
  // romper la sigla: lo primero se lee igual, lo segundo deja de encontrarse al buscarlo.
  assert.equal(enFormatoTitulo('CIERRE DEL MES'), 'Cierre del MES')
})

test('las siglas sobreviven', () => {
  assert.equal(enFormatoTitulo('REVISAR SAC Y DMG'), 'Revisar SAC y DMG')
  assert.equal(enFormatoTitulo('INFORME MGC PARA HL Y PR'), 'Informe MGC para HL y PR')
  assert.equal(enFormatoTitulo('PLAN RRHH 2026'), 'Plan RRHH 2026')
})

test('no toca nada que tenga una sola minuscula: puede ser una marca', () => {
  assert.equal(enFormatoTitulo('Revisar el plan de MEDIOS'), 'Revisar el plan de MEDIOS')
  assert.equal(enFormatoTitulo('eBay y la campaña SAC'), 'eBay y la campaña SAC')
  assert.equal(enFormatoTitulo('Plan de Medios'), 'Plan de Medios')
})

test('un nombre que ya esta en formato de titulo vuelve identico', () => {
  const nombre = 'Campaña de Verano para la Marca'

  assert.equal(enFormatoTitulo(nombre), nombre)
})

test('una sigla sola no se convierte en palabra', () => {
  assert.equal(enFormatoTitulo('SAC'), 'SAC')
  assert.equal(enFormatoTitulo('PR'), 'PR')
})

test('recorta los extremos aunque no haya nada que convertir', () => {
  assert.equal(enFormatoTitulo('  Revisar el plan  '), 'Revisar el plan')
  assert.equal(enFormatoTitulo(''), '')
  assert.equal(enFormatoTitulo('   '), '')
})

test('conserva la puntuacion y los separadores tal como estaban', () => {
  assert.equal(enFormatoTitulo('PLAN 2026: FASE II - SAC/DMG'), 'Plan 2026: Fase II - SAC/DMG')
})

test('un nombre sin letras se devuelve igual', () => {
  assert.equal(enFormatoTitulo('2026-03'), '2026-03')
})
