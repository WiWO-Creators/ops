import test from 'node:test'
import assert from 'node:assert/strict'
import { idCarpetaDrive } from '../src/componentes/equipo/exportar-tareas-sheets.ts'

test('el destino admite carpetas de Drive e IDs y rechaza archivos, otros hosts y valores vacíos', () => {
  const id = 'carpeta_exportacion_123'
  for (const entrada of [id, ` ${id} `, `https://drive.google.com/drive/folders/${id}?usp=sharing`, `https://drive.google.com/drive/u/1/folders/${id}/`]) {
    assert.equal(idCarpetaDrive(entrada), id)
  }
  for (const entrada of ['', ' ', 'invalido', 'javascript:alert(1)', `https://drive.google.com.ejemplo.com/drive/folders/${id}`, `https://drive.google.com/file/d/${id}/view`, `https://usuario@drive.google.com/drive/folders/${id}`, `http://drive.google.com/drive/folders/${id}`, `https://drive.google.com:8443/drive/folders/${id}`]) {
    assert.equal(idCarpetaDrive(entrada), null)
  }
})
