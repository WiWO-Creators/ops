import type { AvisosDeContacto, ContactoCompleto, PermisoPortal } from '../datos/recursos.ts'

/**
 * Logica de la pestaña Contactos.
 *
 * Vive en un `.ts` por la razon de siempre: es lo que se puede probar. El orden de la lista y la
 * validacion del formulario se rompen en silencio —un contacto de baja arriba de todo, un correo
 * invalido que la API rechaza despues de un viaje—, y ninguna de las dos cosas la detecta el
 * compilador.
 */

/**
 * Secciones del portal, con el nombre que se muestra.
 *
 * El orden es el de `get_contact_permissions()` de Perfex (ids 1 a 6), para que la lista se lea
 * igual que en el panel clasico. Los valores son los `short_name`, que es lo que viaja por la API:
 * mandar ids numericos obligaria a mantener el mapa en los dos lados.
 */
export const PERMISOS_PORTAL: Array<{ clave: PermisoPortal, etiqueta: string }> = [
  { clave: 'invoices', etiqueta: 'Facturas' },
  { clave: 'estimates', etiqueta: 'Presupuestos' },
  { clave: 'contracts', etiqueta: 'Contratos' },
  { clave: 'proposals', etiqueta: 'Propuestas' },
  { clave: 'support', etiqueta: 'Soporte' },
  { clave: 'projects', etiqueta: 'Proyectos' }
]

/**
 * Las siete banderas de aviso por correo, con su nombre visible.
 *
 * **Los manda el panel clasico, no esta interfaz.** La API no envia correo en ninguna escritura, asi
 * que lo que se marca acá cambia lo que enviara el panel y su cron, no lo que hace ops.
 */
export const AVISOS_DE_CONTACTO: Array<{ clave: keyof AvisosDeContacto, etiqueta: string }> = [
  { clave: 'invoice_emails', etiqueta: 'Facturas' },
  { clave: 'estimate_emails', etiqueta: 'Presupuestos' },
  { clave: 'credit_note_emails', etiqueta: 'Notas de crédito' },
  { clave: 'contract_emails', etiqueta: 'Contratos' },
  { clave: 'task_emails', etiqueta: 'Tareas' },
  { clave: 'project_emails', etiqueta: 'Proyectos' },
  { clave: 'ticket_emails', etiqueta: 'Tickets' }
]

/** Todos los avisos en el mismo valor. Sirve para el alta (todos puestos, como el panel). */
export function avisosTodos (puesto: boolean): AvisosDeContacto {
  return Object.fromEntries(
    AVISOS_DE_CONTACTO.map((aviso) => [aviso.clave, puesto])
  ) as unknown as AvisosDeContacto
}

/**
 * Ordena los contactos para mostrarlos.
 *
 * Tres niveles, en este orden: el principal arriba, después los activos, y dentro de cada grupo por
 * nombre. Quien abre la pestaña busca a quién hay que llamar, y un contacto dado de baja nunca es
 * esa persona — pero tiene que seguir viéndose, porque si no, no hay forma de reactivarlo.
 *
 * @param contactos los contactos tal como llegaron
 * @returns una lista nueva; la original no se muta
 */
export function ordenarContactosCompletos (contactos: ContactoCompleto[]): ContactoCompleto[] {
  return [...contactos].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    if (a.active !== b.active) return a.active ? -1 : 1

    return a.full_name.localeCompare(b.full_name, 'es')
  })
}

/** Cuántos contactos activos hay. Es lo que cuenta la pestaña. */
export function cuantosActivos (contactos: ContactoCompleto[]): number {
  return contactos.filter((contacto) => contacto.active).length
}

export interface EntradaContacto {
  firstname: string
  lastname: string
  email: string
  phonenumber: string
  title: string
  password: string
}

/**
 * Revisa el formulario antes de mandarlo.
 *
 * Solo bloquea lo que la API va a rechazar igual: gastar un viaje al servidor para que diga "falta el
 * nombre" es tiempo que la persona mira una pantalla que ya sabia la respuesta. Lo que la API decide
 * y acá no se puede saber —si el correo ya lo tiene otro contacto— llega como error del servidor.
 *
 * @param entrada lo que hay en el formulario
 * @returns errores por campo; vacio habilita el envio
 */
export function revisarContacto (entrada: EntradaContacto): Record<string, string> {
  const errores: Record<string, string> = {}

  if (entrada.firstname.trim() === '') errores.firstname = 'Poné el nombre.'
  if (entrada.lastname.trim() === '') errores.lastname = 'Poné el apellido.'

  const email = entrada.email.trim()
  if (email === '') {
    errores.email = 'Poné el correo.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errores.email = 'Ese correo no tiene forma de correo.'
  }

  // Vacia significa "no le pongas contraseña" (alta) o "no la cambies" (edicion), no un error.
  const clave = entrada.password
  if (clave !== '' && (clave.length < 8 || clave.length > 72)) {
    // 72 es el tope real de bcrypt: mas alla se trunca en silencio, que es la peor forma de que una
    // contraseña "funcione" a medias.
    errores.password = 'Entre 8 y 72 caracteres.'
  }

  return errores
}

/**
 * Arma el cuerpo que espera la API a partir del formulario.
 *
 * Los campos opcionales vacios viajan como `null` y no como `""`: el contrato promete `null` para
 * "sin dato", y una cadena vacia guardada se muestra despues como un espacio en blanco que parece un
 * dato cargado.
 *
 * @param entrada lo que hay en el formulario
 * @param permisos secciones del portal marcadas
 * @param avisos banderas de aviso marcadas
 * @returns el objeto listo para `POST` o `PATCH`
 */
export function cuerpoDeContacto (
  entrada: EntradaContacto,
  permisos: PermisoPortal[],
  avisos: AvisosDeContacto
): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {
    firstname: entrada.firstname.trim(),
    lastname: entrada.lastname.trim(),
    email: entrada.email.trim().toLowerCase(),
    phonenumber: entrada.phonenumber.trim() === '' ? null : entrada.phonenumber.trim(),
    title: entrada.title.trim() === '' ? null : entrada.title.trim(),
    permissions: permisos,
    email_notifications: avisos
  }

  // La clave solo viaja cuando se escribio: mandar `null` en una edicion no la borra, pero mandar la
  // clave vacia en cada guardado seria pedirle a la API que decida algo que nadie pidio.
  if (entrada.password !== '') cuerpo.password = entrada.password

  return cuerpo
}
