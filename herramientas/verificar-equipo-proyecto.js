/**
 * Verificación de navegador contra Ops y su API mock; no escribe en un backend real.
 * Con /espacios/1 del mock abierto como ana@wiwo.me en playwright-cli:
 *   playwright-cli run-code --filename herramientas/verificar-equipo-proyecto.js
 * Comprueba altas, bajas, equipo vacío, cancelación, errores y conservación de inactivos.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- playwright-cli evalúa esta función y le entrega la página.
async (page) => {
  page.setDefaultTimeout(15000)
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+\/espacios\/1(?:\?|$)/.test(page.url())) {
    throw new Error('Abrir /espacios/1 en el mock local como Ana antes de ejecutar.')
  }
  await page.keyboard.press('Escape')
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  const cancelar = page.getByRole('button', { name: 'Cancelar', exact: true })
  if (await cancelar.isVisible()) await cancelar.click()

  const ana = { id: 1, full_name: 'Ana Ríos', profile_image_url: null }
  const inactiva = { id: 999, full_name: 'Persona inactiva', profile_image_url: null }
  let miembros = [ana, inactiva]
  let fallo = false
  let escrituras = 0
  await page.route('**/api/bff/staff/asignables?*', (route) => route.fulfill({ json: { data: [ana] } }))
  await page.route('**/api/bff/projects/1/members', async (route) => {
    if (fallo) return await route.fulfill({ status: 403, json: { error: { message: 'Sin permiso de edición.' } } })
    if (route.request().method() === 'PUT') {
      escrituras++
      const ids = route.request().postDataJSON().members
      miembros = [ana, inactiva].filter((persona) => ids.includes(persona.id))
      if (ids.some((id) => ![1, 999].includes(id))) throw new Error('ID inesperado.')
      return await route.fulfill({ json: { data: miembros } })
    }
    await route.fulfill({ json: { data: miembros } })
  })
  await page.getByRole('button', { name: 'Editar equipo', exact: true }).click()
  await page.getByRole('button', { name: 'Sacar a Persona inactiva', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Sacar a Ana Ríos', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar equipo', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Equipo actualizado.' }).waitFor()
  if (miembros.length !== 1 || miembros[0].id !== 999) throw new Error('No conservó el miembro inactivo.')

  await page.getByRole('button', { name: 'Editar equipo', exact: true }).click()
  await page.getByRole('button', { name: 'Sacar a Persona inactiva', exact: true }).click()
  await page.getByText('El proyecto quedará sin miembros.').waitFor()
  await page.getByRole('button', { name: 'Guardar equipo', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Equipo actualizado.' }).waitFor()
  if (miembros.length !== 0) throw new Error('No guardó el equipo vacío.')

  await page.getByRole('button', { name: 'Editar equipo', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar personas', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: /Ana Ríos/ }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  fallo = true
  await page.getByRole('button', { name: 'Guardar equipo', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Sin permiso de edición.' }).waitFor()
  await page.getByRole('button', { name: 'Sacar a Ana Ríos', exact: true }).waitFor()
  fallo = false
  await page.getByRole('button', { name: 'Guardar equipo', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Equipo actualizado.' }).waitFor()
  if (miembros[0]?.id !== 1) throw new Error('No agregó a la persona.')

  fallo = true
  await page.getByRole('button', { name: 'Editar equipo', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Sin permiso de edición.' }).waitFor()
  if (await page.getByRole('button', { name: 'Guardar equipo', exact: true }).isEnabled()) throw new Error('Permitió guardar sin cargar.')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  if (escrituras !== 3) throw new Error('Cancelar o fallar modificó el equipo.')
  await page.unroute('**/api/bff/projects/1/members')
  await page.unroute('**/api/bff/staff/asignables?*')
}
