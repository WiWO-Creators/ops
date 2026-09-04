import type { AltaRapida, CatalogosAlta } from './alta-rapida.ts'
import type { CamposTarea } from './ia.ts'

/**
 * Fusion del parser local con lo que interpreto el modelo, para el alta de tarea.
 *
 * El alta corre las dos lecturas en el mismo clic: `interpretarAltaRapida()`, que es instantanea y
 * gratis, y `POST /ia/tareas/interpretar`, que cuesta una llamada. Aca se decide cual gana cada
 * campo, con **una sola regla: lo explicito gana**. Lo que la persona escribio con prefijo (`@`,
 * `#`, `!`) o como fecha reconocible es inamovible; el modelo solo llena lo que quedo en `null`.
 *
 * La unica excepcion es el **titulo**, y es deliberada: el parser local devuelve "lo que sobro"
 * despues de sacar prefijos y fechas, o sea una frase en bruto, mientras que el modelo devuelve un
 * titulo redactado. Por eso el titulo del modelo pisa al local — y por eso el formulario ofrece
 * "Deshacer", que es la contrapartida obligatoria de un pisado.
 *
 * La otra mitad del archivo es defensa, y es la razon de que esto viva en un `.ts` probable y no
 * dentro del componente: **todo id que devuelve el modelo tiene que existir en los catalogos del
 * front**. Un responsable, una prioridad o una etiqueta que el catalogo no conoce se descarta y se
 * lista como no resuelto. Mandar un id que la interfaz no sabe nombrar es exactamente como una tarea
 * termina asignada a la persona equivocada.
 *
 * Lo que no se fusiona, a proposito:
 *
 * - **El Espacio** (`rel_type`/`rel_id`): el formulario de tarea se abre desde su proyecto y el
 *   proyecto viaja fijo. Aceptar el que nombre el modelo seria dejarlo mover la tarea de proyecto
 *   desde una frase.
 * - **El hito** (`milestone`): no hay campo en el alta; se elige en el detalle.
 */

/** Formato de fecha que acepta la API. Lo que no matchea se descarta antes de llegar al formulario. */
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Los campos del alta que el modelo puede llegar a llenar. */
export type CampoDeTarea =
  | 'name'
  | 'description'
  | 'due_date'
  | 'start_date'
  | 'priority'
  | 'assignees'
  | 'tags'

/**
 * Catalogos contra los que se valida todo lo que devuelve el modelo.
 *
 * Extiende los del alta rapida con las etiquetas, que el alta rapida no maneja. En el formulario de
 * tarea `personas` y `espacios` van vacios —ahi no se eligen—, asi que cualquier responsable que
 * proponga el modelo se descarta: eso es lo correcto, no un bug.
 */
export interface CatalogosTarea extends CatalogosAlta {
  etiquetas: ReadonlyArray<{ id: number, name: string }>
}

/** El resultado de fusionar, listo para volcarse en los campos del formulario. */
export interface TareaFusionada {
  name: string
  description: string | null
  due_date: string | null
  start_date: string | null
  priority: number | null
  assignees: number[]
  tags: string[]
  /** Campos cuyo valor final salio del modelo. El formulario los marca distinto en la vista previa. */
  deIa: CampoDeTarea[]
  /** Todo lo que nadie pudo resolver: del parser, del modelo, y lo descartado por no estar en catalogo. */
  noResuelto: string[]
}

/**
 * Devuelve la fecha solo si tiene el formato del contrato.
 *
 * Un modelo que devuelve "el viernes" o "2026-13-45" en un campo de fecha no es raro; volcarlo en un
 * `<input type="date">` lo dejaria vacio sin decir nada.
 *
 * @param valor lo que devolvio el modelo
 * @returns la fecha en `YYYY-MM-DD`, o `null` si no lo es
 */
function fechaValida (valor: string | null): string | null {
  return valor !== null && FORMATO_FECHA.test(valor) ? valor : null
}

/**
 * Resuelve las etiquetas propuestas contra el catalogo, sin distinguir mayusculas.
 *
 * La comparacion es case-insensitive porque la colacion de `tbltags` es `_ci`: "urgente" y "Urgente"
 * son la misma fila para la API. Se devuelve el nombre del catalogo, no el que escribio el modelo,
 * para que lo que se ve en el formulario sea lo que existe en la base.
 *
 * **La IA no crea catalogo**: lo que no existe se descarta, igual que si lo hubiera tipeado alguien.
 *
 * @param pedidas nombres de etiqueta que propuso el modelo
 * @param catalogo etiquetas que ya existen
 * @returns las validas con su nombre canonico y las descartadas tal como llegaron
 */
function resolverEtiquetas (
  pedidas: readonly string[],
  catalogo: ReadonlyArray<{ name: string }>
): { validas: string[], descartadas: string[] } {
  const validas: string[] = []
  const descartadas: string[] = []

  for (const pedida of pedidas) {
    const limpia = pedida.trim()
    const existente = catalogo.find((e) => e.name.toLowerCase() === limpia.toLowerCase())

    if (limpia === '') continue
    if (existente === undefined) descartadas.push(limpia)
    else if (!validas.includes(existente.name)) validas.push(existente.name)
  }

  return { validas, descartadas }
}

/** El texto si es texto y no esta vacio; `null` en cualquier otro caso. */
function comoTexto (valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor : null
}

/** El numero si es un numero finito; `null` en cualquier otro caso. */
function comoNumero (valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/**
 * Lee la respuesta de `POST /ia/tareas/interpretar` como `CamposTarea`.
 *
 * El generico de `escribirEnBff<CamposTarea>` es una promesa del contrato, no una verificacion: lo
 * que llega es JSON de la red producido por un modelo, y una sola propiedad asumida de mas revienta
 * el dialogo con un `TypeError` en medio del clic. Por eso hay un type guard escrito a mano —zod no
 * esta instalado y no se agrega una dependencia para validar una forma conocida—, con el mismo
 * criterio que `leerEventoIA()`: lo que no encaja se descarta en vez de lanzar.
 *
 * Un payload parcial no se rechaza entero: cada campo que no encaja cae a `null` o a lista vacia, y
 * la fusion se hace con lo que si vino. Rechazar todo por un campo de mas seria perder la lectura
 * completa por un detalle.
 *
 * La API anida: el `data` trae `campos` con el cuerpo listo para `POST /tasks`, y `no_resuelto`
 * colgando del padre junto a `resueltos` y `faltantes`. Leer el `data` plano —como se hizo mientras
 * el endpoint no existia— devuelve todo en `null` **sin dar error**, porque cada campo cae por su
 * cuenta: la interfaz se queda muda y nadie se entera. Por eso esta funcion recibe el envelope
 * entero y sabe donde vive cada cosa, en vez de confiar en que el llamador acierte el nivel.
 *
 * @param valor el `data` del envelope, tal como llego
 * @returns los campos normalizados, o `null` si ni siquiera es un objeto
 */
export function leerCamposTarea (valor: unknown): CamposTarea | null {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null

  const sobre = valor as Record<string, unknown>
  const anidado = sobre.campos

  // Se acepta tambien la forma plana: el mock la sirvio asi antes de que existiera el endpoint, y
  // un `campos` ausente no puede significar "no se entendio nada".
  const crudo = (typeof anidado === 'object' && anidado !== null && !Array.isArray(anidado))
    ? { ...anidado as Record<string, unknown>, no_resuelto: sobre.no_resuelto }
    : sobre

  const lista = (campo: unknown): unknown[] => Array.isArray(campo) ? campo : []

  return {
    name: comoTexto(crudo.name),
    description: comoTexto(crudo.description),
    due_date: comoTexto(crudo.due_date),
    start_date: comoTexto(crudo.start_date),
    priority: comoNumero(crudo.priority),
    rel_type: crudo.rel_type === 'project' ? 'project' : null,
    rel_id: comoNumero(crudo.rel_id),
    milestone: comoNumero(crudo.milestone),
    assignees: lista(crudo.assignees).map(comoNumero).filter((id) => id !== null),
    tags: lista(crudo.tags).map(comoTexto).filter((etiqueta) => etiqueta !== null),
    no_resuelto: lista(crudo.no_resuelto).map(comoTexto).filter((texto) => texto !== null)
  }
}

/**
 * Fusiona la lectura local con la del modelo y valida todo lo que el modelo aporta.
 *
 * @param local lo que devolvio `interpretarAltaRapida()` sobre el mismo texto
 * @param ia lo que devolvio `POST /ia/tareas/interpretar`, o `null` si la llamada fallo o no se hizo
 * @param catalogos personas, Espacios, prioridades y etiquetas conocidos por la interfaz
 * @returns los campos a volcar en el formulario, con el origen de cada uno y lo no resuelto
 */
export function fusionarInterpretacion (
  local: AltaRapida,
  ia: CamposTarea | null,
  catalogos: CatalogosTarea
): TareaFusionada {
  const fusion: TareaFusionada = {
    name: local.name.trim(),
    description: null,
    due_date: local.due_date,
    start_date: null,
    priority: local.priority,
    assignees: [...local.assignees],
    tags: [],
    deIa: [],
    noResuelto: [...local.sinResolver]
  }

  // Sin respuesta del modelo el alta sigue funcionando: queda el parser local, que es lo que habia
  // antes de que existiera este boton.
  if (ia === null) return fusion

  fusion.noResuelto.push(...ia.no_resuelto)

  aplicarTextos(fusion, ia)
  aplicarFechas(fusion, ia)
  aplicarPrioridad(fusion, ia, catalogos)
  aplicarResponsables(fusion, ia, catalogos)

  const { validas, descartadas } = resolverEtiquetas(ia.tags, catalogos.etiquetas)

  if (validas.length > 0) {
    fusion.tags = validas
    fusion.deIa.push('tags')
  }

  for (const etiqueta of descartadas) fusion.noResuelto.push(`Etiqueta «${etiqueta}»`)

  // El parser y el modelo suelen tropezar con lo mismo —un `@nadie` cae en las dos listas—, y verlo
  // dos veces en "Sin reconocer" hace dudar de si son dos cosas distintas.
  fusion.noResuelto = [...new Set(fusion.noResuelto)]

  return fusion
}

/**
 * Vuelca titulo y descripcion del modelo.
 *
 * El titulo es la excepcion declarada a "lo explicito gana": pisa al local porque el local es un
 * sobrante, no una redaccion. La descripcion no compite con nada — el parser local no la produce.
 *
 * @param fusion el acumulador, que se modifica
 * @param ia la respuesta del modelo
 */
function aplicarTextos (fusion: TareaFusionada, ia: CamposTarea): void {
  const titulo = (ia.name ?? '').trim()
  const descripcion = (ia.description ?? '').trim()

  if (titulo !== '') {
    fusion.name = titulo
    fusion.deIa.push('name')
  }

  if (descripcion !== '') {
    fusion.description = descripcion
    fusion.deIa.push('description')
  }
}

/**
 * Vuelca las dos fechas del modelo en los huecos que dejo el parser local.
 *
 * El vencimiento solo entra si el parser no reconocio ninguna fecha en el texto; el inicio siempre
 * puede entrar porque el parser local no lo produce. Una fecha con formato invalido se descarta y se
 * anota: perderla en silencio es peor que mostrar que llego mal.
 *
 * @param fusion el acumulador, que se modifica
 * @param ia la respuesta del modelo
 */
function aplicarFechas (fusion: TareaFusionada, ia: CamposTarea): void {
  if (fusion.due_date === null) {
    const vence = fechaValida(ia.due_date)

    if (vence !== null) { fusion.due_date = vence; fusion.deIa.push('due_date') }
    else if (ia.due_date !== null) fusion.noResuelto.push(`Vencimiento «${ia.due_date}»`)
  }

  const empieza = fechaValida(ia.start_date)

  if (empieza !== null) { fusion.start_date = empieza; fusion.deIa.push('start_date') }
  else if (ia.start_date !== null) fusion.noResuelto.push(`Inicio «${ia.start_date}»`)
}

/**
 * Vuelca la prioridad del modelo si el texto no traia `!nivel` y el id existe en el catalogo.
 *
 * @param fusion el acumulador, que se modifica
 * @param ia la respuesta del modelo
 * @param catalogos los catalogos contra los que se valida
 */
function aplicarPrioridad (fusion: TareaFusionada, ia: CamposTarea, catalogos: CatalogosTarea): void {
  const propuesta = ia.priority

  if (fusion.priority !== null || propuesta === null) return

  if (catalogos.prioridades.some((p) => p.id === propuesta)) {
    fusion.priority = propuesta
    fusion.deIa.push('priority')
  } else {
    fusion.noResuelto.push(`Prioridad #${propuesta}`)
  }
}

/**
 * Vuelca los responsables del modelo si el texto no traia ningun `@persona`.
 *
 * Cada id se busca en el catalogo de personas. El que no esta se descarta y se anota con su id: es
 * el caso que esta funcion existe para impedir, porque una asignacion equivocada no se ve hasta que
 * la tarea aparece en el tablero de otra persona.
 *
 * @param fusion el acumulador, que se modifica
 * @param ia la respuesta del modelo
 * @param catalogos los catalogos contra los que se valida
 */
function aplicarResponsables (fusion: TareaFusionada, ia: CamposTarea, catalogos: CatalogosTarea): void {
  if (fusion.assignees.length > 0 || ia.assignees.length === 0) return

  const validos = ia.assignees.filter((id) => catalogos.personas.some((p) => p.id === id))

  if (validos.length > 0) {
    fusion.assignees = validos
    fusion.deIa.push('assignees')
  }

  for (const id of ia.assignees) {
    if (!validos.includes(id)) fusion.noResuelto.push(`Responsable #${id}`)
  }
}
