/**
 * Logica pura del formulario generico de las pestañas del detalle.
 *
 * Notas, Discusiones e Hitos son tres altas con la misma forma: un puñado de campos, un `POST` o un
 * `PATCH`, y errores por campo. En vez de tres formularios casi iguales hay una descripcion de campos
 * y este modulo, que valida y arma el cuerpo. La parte visual vive en `FormularioRecurso.tsx`.
 */

export type TipoCampo = 'texto' | 'area' | 'fecha' | 'color' | 'booleano' | 'numero' | 'seleccion'

/** Una opcion de un campo `seleccion`. El valor viaja como cadena y se convierte al armar el cuerpo. */
export interface OpcionCampo {
  valor: string
  etiqueta: string
}

export interface CampoFormulario {
  /** Nombre del campo tal como lo espera la API. No se traduce. */
  clave: string
  etiqueta: string
  tipo: TipoCampo
  requerido?: boolean
  ayuda?: string
  /** Solo para `fecha`: cota inferior, en `YYYY-MM-DD`. */
  min?: string
  /** Solo para `fecha`: cota superior, en `YYYY-MM-DD`. */
  max?: string
  /** Largo maximo para `texto`. La API rechaza con 422 lo que exceda la columna. */
  maximo?: number
  /** Solo para `seleccion`. La opcion vacia se agrega sola cuando el campo no es requerido. */
  opciones?: OpcionCampo[]
  /**
   * Titulo que precede a este campo, para partir un formulario largo en bloques.
   *
   * Va en el campo y no en una lista aparte para que agregar un campo a un bloque sea una linea y no
   * dos ediciones que se pueden desincronizar.
   */
  seccion?: string
  /**
   * Si esta vacio, el campo no viaja en el cuerpo.
   *
   * Existe por la contraseña: en una edicion, dejarla en blanco quiere decir "no la cambies", y
   * mandar `null` la convertiria en un intento de borrarla.
   */
  omitirSiVacio?: boolean
}

/** Valores del formulario en crudo, tal como los escribe el navegador. */
export type ValoresFormulario = Record<string, string | boolean>

/**
 * Valida los campos antes de mandar nada.
 *
 * Validar en el borde no reemplaza al backend, lo adelanta: un requerido vacio no merece un viaje a
 * la API ni un mensaje generico.
 *
 * @param campos la descripcion del formulario
 * @param valores lo que hay escrito
 * @returns un mapa clave -> mensaje; vacio si esta todo bien
 */
export function validarFormulario (
  campos: CampoFormulario[],
  valores: ValoresFormulario
): Record<string, string> {
  const errores: Record<string, string> = {}

  for (const campo of campos) {
    const valor = valores[campo.clave]

    if (campo.tipo === 'booleano') continue

    const texto = typeof valor === 'string' ? valor.trim() : ''

    if (campo.requerido === true && texto === '') {
      errores[campo.clave] = 'Este campo es obligatorio.'
      continue
    }

    if (texto === '') continue

    if (campo.maximo !== undefined && texto.length > campo.maximo) {
      errores[campo.clave] = `Máximo ${campo.maximo} caracteres.`
      continue
    }

    if (campo.tipo === 'fecha') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        errores[campo.clave] = 'Usá el formato AAAA-MM-DD.'
        continue
      }
      if (campo.min !== undefined && texto < campo.min) {
        errores[campo.clave] = `No puede ser anterior al ${campo.min}.`
        continue
      }
      if (campo.max !== undefined && texto > campo.max) {
        errores[campo.clave] = `No puede ser posterior al ${campo.max}.`
        continue
      }
    }

    if (campo.tipo === 'numero' && !Number.isFinite(Number(texto))) {
      errores[campo.clave] = 'Tiene que ser un número.'
    }
  }

  return errores
}

/**
 * Arma el cuerpo del `POST`/`PATCH` a partir de los valores.
 *
 * Los textos vacios viajan como `null` y no como `""`: la columna admite nulo, y guardar la cadena
 * vacia hace que despues no se pueda distinguir "sin descripcion" de "descripcion borrada".
 *
 * @param campos la descripcion del formulario
 * @param valores lo que hay escrito, ya validado
 * @returns el objeto listo para serializar
 */
export function cuerpoDelFormulario (
  campos: CampoFormulario[],
  valores: ValoresFormulario
): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = {}

  for (const campo of campos) {
    const valor = valores[campo.clave]

    if (campo.tipo === 'booleano') {
      escribirEn(cuerpo, campo.clave, valor === true)
      continue
    }

    const texto = typeof valor === 'string' ? valor.trim() : ''

    if (texto === '') {
      if (campo.omitirSiVacio === true) continue

      escribirEn(cuerpo, campo.clave, campo.requerido === true ? '' : null)
      continue
    }

    const numerico = campo.tipo === 'numero' || (campo.tipo === 'seleccion' && /^\d+$/.test(texto))

    escribirEn(cuerpo, campo.clave, numerico ? Number(texto) : texto)
  }

  return cuerpo
}

/**
 * Escribe un valor en el cuerpo, creando los objetos que pida una clave con puntos.
 *
 * `billing.street` termina en `{ billing: { street: … } }`, que es la forma que espera el contrato
 * para las direcciones de un cliente. Sin esto habria que escribir un formulario propio para el unico
 * recurso que anida.
 */
function escribirEn (cuerpo: Record<string, unknown>, clave: string, valor: unknown): void {
  const partes = clave.split('.')
  const ultima = partes.pop()

  if (ultima === undefined) return

  let destino = cuerpo

  for (const parte of partes) {
    if (typeof destino[parte] !== 'object' || destino[parte] === null) destino[parte] = {}

    destino = destino[parte] as Record<string, unknown>
  }

  destino[ultima] = valor
}

/**
 * Lee un valor del registro siguiendo una clave con puntos.
 *
 * @param registro el registro que se edita
 * @param clave `company` o `billing.street`
 * @returns el valor, o `undefined` si algun tramo del camino no existe
 */
function leerDe (registro: Record<string, unknown>, clave: string): unknown {
  let actual: unknown = registro

  for (const parte of clave.split('.')) {
    if (typeof actual !== 'object' || actual === null) return undefined

    actual = (actual as Record<string, unknown>)[parte]
  }

  return actual
}

/**
 * Valores iniciales del formulario a partir de un registro existente.
 *
 * @param campos la descripcion del formulario
 * @param registro el registro a editar, o `null` para un alta
 * @returns los valores, con cadena vacia o `false` donde el registro no traiga nada
 */
export function valoresIniciales (
  campos: CampoFormulario[],
  registro: Record<string, unknown> | null
): ValoresFormulario {
  const valores: ValoresFormulario = {}

  for (const campo of campos) {
    const crudo = registro === null ? undefined : leerDe(registro, campo.clave)

    if (campo.tipo === 'booleano') {
      valores[campo.clave] = crudo === true
      continue
    }

    valores[campo.clave] = crudo === null || crudo === undefined ? '' : String(crudo)
  }

  return valores
}
