/**
 * Logica pura del formulario generico de las pestañas del detalle.
 *
 * Notas, Discusiones e Hitos son tres altas con la misma forma: un puñado de campos, un `POST` o un
 * `PATCH`, y errores por campo. En vez de tres formularios casi iguales hay una descripcion de campos
 * y este modulo, que valida y arma el cuerpo. La parte visual vive en `FormularioRecurso.tsx`.
 */

export type TipoCampo = 'texto' | 'area' | 'fecha' | 'color' | 'booleano' | 'numero'

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
): Record<string, string | number | boolean | null> {
  const cuerpo: Record<string, string | number | boolean | null> = {}

  for (const campo of campos) {
    const valor = valores[campo.clave]

    if (campo.tipo === 'booleano') {
      cuerpo[campo.clave] = valor === true
      continue
    }

    const texto = typeof valor === 'string' ? valor.trim() : ''

    if (texto === '') {
      cuerpo[campo.clave] = campo.requerido === true ? '' : null
      continue
    }

    cuerpo[campo.clave] = campo.tipo === 'numero' ? Number(texto) : texto
  }

  return cuerpo
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
    const crudo = registro === null ? undefined : registro[campo.clave]

    if (campo.tipo === 'booleano') {
      valores[campo.clave] = crudo === true
      continue
    }

    valores[campo.clave] = crudo === null || crudo === undefined ? '' : String(crudo)
  }

  return valores
}
