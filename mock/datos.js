/**
 * Fixtures del mock de la API v1.
 *
 * Los datos se generan de forma determinista (sin `Math.random`) para que dos ejecuciones del mock
 * devuelvan exactamente lo mismo: una prueba que dependa de la fila 3 no puede volverse intermitente.
 *
 * Los nombres de campo son los del contrato (docs/contrato-api.md), que a su vez salen del esquema
 * real de Perfex. No inventar campos acá: si falta uno, se agrega primero al contrato.
 */

/** Rota un valor de una lista segun el indice, para repartir los fixtures sin azar. */
const ciclo = (lista, i) => lista[i % lista.length]

/**
 * Estados de Proceso, tal como los devuelve `Tasks_model::get_statuses()`.
 *
 * OJO: los `id` NO siguen el orden de visualizacion. `4` (En progreso) va segundo y `2` (Esperando
 * respuesta) va cuarto, mientras que `5` (Completado) tiene `order: 100`. Cualquier consumidor que
 * ordene por `id` arma las columnas del tablero al reves.
 */
export const ESTADOS_PROCESO = [
  { id: 1, name: 'No iniciado', color: '#64748b', order: 1, filter_default: true },
  { id: 4, name: 'En progreso', color: '#3b82f6', order: 2, filter_default: true },
  { id: 3, name: 'En pruebas', color: '#0284c7', order: 3, filter_default: true },
  { id: 2, name: 'Esperando respuesta', color: '#84cc16', order: 4, filter_default: true },
  { id: 5, name: 'Completado', color: '#22c55e', order: 100, filter_default: false }
]

export const PRIORIDADES = [
  { id: 1, name: 'Baja', color: '#777' },
  { id: 2, name: 'Media', color: '#03a9f4' },
  { id: 3, name: 'Alta', color: '#ff6f00' },
  { id: 4, name: 'Urgente', color: '#fc2d42' }
]

export const ESTADOS_ESPACIO = [
  { id: 1, name: 'No iniciado', color: '#64748b', order: 1 },
  { id: 2, name: 'En progreso', color: '#3b82f6', order: 2 },
  { id: 3, name: 'En espera', color: '#ff6f00', order: 3 },
  { id: 4, name: 'Terminado', color: '#22c55e', order: 4 }
]

export const ETIQUETAS = [
  { id: 1, name: 'urgente' },
  { id: 2, name: 'cliente-clave' },
  { id: 3, name: 'bloqueado' },
  { id: 4, name: 'diseño' }
]

export const ROLES = [
  { id: 1, name: 'Administración' },
  { id: 2, name: 'Diseño' },
  { id: 3, name: 'Desarrollo' }
]

export const DEPARTAMENTOS = [
  { id: 1, name: 'Soporte' },
  { id: 2, name: 'Ventas' }
]

const NOMBRES = [
  ['Ana', 'Ríos'], ['Bruno', 'Cabral'], ['Carla', 'Méndez'], ['Diego', 'Sosa'],
  ['Elena', 'Paz'], ['Facundo', 'Lugo'], ['Gina', 'Ferrer'], ['Hugo', 'Márquez']
]

/**
 * Staff. El primero es admin; el segundo tiene 2FA por correo, para poder ejercitar ese camino sin
 * tocar el fixture. El ultimo esta inactivo: `POST /auth/login` debe darle 403, no 401.
 */
export const STAFF = NOMBRES.map(([firstname, lastname], i) => ({
  id: i + 1,
  email: `${firstname.toLowerCase()}@wiwo.me`,
  password: 'mock1234',
  firstname,
  lastname,
  full_name: `${firstname} ${lastname}`,
  profile_image_url: null,
  is_admin: i === 0,
  role_id: ciclo(ROLES, i).id,
  active: i !== NOMBRES.length - 1,
  is_not_staff: false,
  phonenumber: null,
  hourly_rate: 0,
  last_login: `2026-08-${String(10 + i).padStart(2, '0')}T09:12:00Z`,
  // La cuenta se creo antes de que entrara: la antiguedad es lo que la ficha muestra como "Cuenta
  // creada". `last_activity` la escribe solo el panel viejo, asi que la ultima no tiene ninguna.
  date_created: `2025-0${(i % 9) + 1}-15T10:00:00Z`,
  last_activity: i === NOMBRES.length - 1 ? null : `2026-08-${String(20 + (i % 8)).padStart(2, '0')}T17:30:00Z`,
  two_factor_enabled: i === 1,
  two_factor: i === 1 ? 'email' : null
}))

/**
 * Contactos de cliente, que son quienes entran al portal.
 *
 * No son staff con menos permisos: es otra poblacion de ids, con otra tabla y otra puerta. El
 * fixture lo refleja a proposito —el contacto 1 y el staff 1 existen los dos y no son la misma
 * persona— porque justamente ese solapamiento es lo que un bug de sujeto haria pasar por alto.
 *
 * Los tres cubren los casos que el portal tiene que distinguir: uno completo, uno con una sola
 * seccion habilitada, y uno que no verifico su correo.
 */
export const CONTACTOS = [
  {
    id: 1,
    client_id: 1,
    email: 'clienta@acme.com',
    password: 'portal1234',
    firstname: 'Renata',
    lastname: 'Ferreyra',
    full_name: 'Renata Ferreyra',
    phonenumber: '+54 11 4444-1122',
    title: 'Gerenta de Operaciones',
    is_primary: true,
    email_verified: true,
    active: true,
    direction: null,
    last_login: '2026-08-24T10:04:00Z',
    permissions: ['invoices', 'estimates', 'contracts', 'proposals', 'support', 'projects']
  },
  {
    id: 2,
    client_id: 1,
    email: 'limitado@acme.com',
    password: 'portal1234',
    firstname: 'Bruno',
    lastname: 'Salas',
    full_name: 'Bruno Salas',
    phonenumber: null,
    title: null,
    is_primary: false,
    email_verified: true,
    active: true,
    direction: null,
    last_login: null,
    permissions: ['projects']
  },
  {
    id: 3,
    client_id: 2,
    email: 'sinverificar@nordelta.com',
    password: 'portal1234',
    firstname: 'Ivo',
    lastname: 'Duarte',
    full_name: 'Ivo Duarte',
    phonenumber: null,
    title: null,
    is_primary: true,
    email_verified: false,
    active: true,
    direction: null,
    last_login: null,
    permissions: ['projects', 'invoices']
  },
  {
    // Dado de baja a proposito: es el caso que la pestaña anterior escondia, y con el escondido un
    // cliente con contactos inactivos se veia igual que uno sin ninguno.
    id: 4,
    client_id: 1,
    email: 'exempleado@acme.com',
    password: 'portal1234',
    firstname: 'Nadia',
    lastname: 'Ortiz',
    full_name: 'Nadia Ortiz',
    phonenumber: '+54 11 4444-9090',
    title: 'Compras',
    is_primary: false,
    email_verified: true,
    active: false,
    direction: null,
    last_login: '2026-05-02T13:20:00Z',
    permissions: []
  }
]

/** Las siete banderas de aviso por correo, con el default del esquema de Perfex (todas puestas). */
export const AVISOS_CONTACTO = [
  'invoice_emails', 'estimate_emails', 'credit_note_emails', 'contract_emails',
  'task_emails', 'project_emails', 'ticket_emails'
]

const EMPRESAS = [
  'Acme SRL', 'Nordelta Group', 'Vera & Asociados', 'Ledesma Digital',
  'Costa Norte', 'Pampa Software', 'Rivera Consultora'
]

export const CLIENTES = EMPRESAS.map((company, i) => ({
  id: i + 1,
  company,
  vat: `30-${71000000 + i}-4`,
  phonenumber: `+54 11 5${String(100000 + i).slice(0, 6)}`,
  city: ciclo(['Buenos Aires', 'Córdoba', 'Rosario'], i),
  state: ciclo(['CABA', 'Córdoba', 'Santa Fe'], i),
  zip: `${1400 + i}`,
  address: `Av. Siempre Viva ${100 + i * 7}`,
  country_id: 11,
  website: `https://${company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
  active: i !== 4,
  default_currency: 1,
  default_language: 'spanish',
  datecreated: `2025-0${(i % 9) + 1}-02T00:00:00Z`,
  lead_id: null,
  billing: {
    street: `Av. Siempre Viva ${100 + i * 7}`,
    city: ciclo(['Buenos Aires', 'Córdoba', 'Rosario'], i),
    state: ciclo(['CABA', 'Córdoba', 'Santa Fe'], i),
    zip: `${1400 + i}`,
    country_id: 11
  },
  shipping: null,
  tags: i % 3 === 0 ? [ETIQUETAS[1]] : []
}))

const NOMBRES_ESPACIO = [
  'Rediseño de marca', 'Portal de autogestión', 'Migración de datos',
  'Campaña Q3', 'Aplicación móvil', 'Integración contable',
  'Sitio institucional', 'Panel de indicadores', 'Auditoría técnica'
]

export const ESPACIOS = NOMBRES_ESPACIO.map((name, i) => ({
  id: i + 1,
  name,
  description: `Espacio de trabajo para ${name.toLowerCase()}.`,
  status: ciclo(ESTADOS_ESPACIO, i).id,
  clientid: ciclo(CLIENTES, i).id,
  billing_type: 1,
  start_date: `2026-0${(i % 6) + 1}-15`,
  deadline: `2026-${String(((i % 6) + 7)).padStart(2, '0')}-30`,
  date_finished: null,
  progress: (i * 13) % 101,
  progress_from_tasks: true,
  project_cost: 12000 + i * 1500,
  project_rate_per_hour: null,
  estimated_hours: 120 + i * 40,
  added_from: 1,
  project_created: `2026-0${(i % 6) + 1}-10`,
  tags: i % 4 === 0 ? [ETIQUETAS[3]] : []
}))

const VERBOS = ['Revisar', 'Definir', 'Maquetar', 'Migrar', 'Documentar', 'Corregir', 'Publicar']
const OBJETOS = [
  'la pantalla de acceso', 'el contrato de la API', 'las tarjetas del tablero',
  'los adjuntos heredados', 'el flujo de alta', 'los totales de la factura',
  'el catálogo de estados', 'la barra lateral', 'los permisos por rol'
]

/**
 * Procesos. 84 filas: suficientes para ejercitar la paginacion (per_page 25 da 4 paginas) y para que
 * una columna del tablero tenga mas de una pagina propia.
 */
export const PROCESOS = Array.from({ length: 84 }, (_, i) => {
  const espacio = ciclo(ESPACIOS, i)
  const estado = ciclo(ESTADOS_PROCESO, i)
  const asignados = [ciclo(STAFF, i), ciclo(STAFF, i + 3)]
    .filter((s, pos, todos) => todos.findIndex((o) => o.id === s.id) === pos)

  return {
    id: 500 + i,
    name: `${ciclo(VERBOS, i)} ${ciclo(OBJETOS, i + 2)}`,
    description: null,
    status: estado.id,
    priority: ciclo(PRIORIDADES, i + 1).id,
    start_date: `2026-08-${String((i % 27) + 1).padStart(2, '0')}`,
    due_date: `2026-09-${String((i % 27) + 1).padStart(2, '0')}`,
    date_added: `2026-07-${String((i % 27) + 1).padStart(2, '0')}T10:15:00Z`,
    date_finished: estado.id === 5 ? `2026-08-${String((i % 27) + 1).padStart(2, '0')}T17:00:00Z` : null,
    added_from: 1,
    // Polimorfico: una de cada nueve cuelga de un cliente y no de un Espacio. La interfaz tiene que
    // sobrevivir a un Proceso sin Espacio, y sin este fixture nadie se entera hasta produccion.
    rel_type: i % 9 === 8 ? 'customer' : 'project',
    rel_id: i % 9 === 8 ? ciclo(CLIENTES, i).id : espacio.id,
    project: i % 9 === 8 ? null : { id: espacio.id, name: espacio.name },
    milestone: null,
    billable: i % 3 !== 0,
    billed: false,
    hourly_rate: 0,
    is_public: false,
    visible_to_client: false,
    recurring: false,
    kanban_order: Math.floor(i / ESTADOS_PROCESO.length) + 1,
    assignees: asignados.map((s) => ({
      id: s.id,
      full_name: s.full_name,
      profile_image_url: s.profile_image_url
    })),
    followers: i % 5 === 0 ? [{ id: ciclo(STAFF, i + 1).id, full_name: ciclo(STAFF, i + 1).full_name }] : [],
    tags: i % 4 === 0 ? [ciclo(ETIQUETAS, i)] : [],
    counts: {
      comments: i % 7,
      checklist: i % 5,
      checklist_done: i % 5 === 0 ? 0 : (i % 5) - 1,
      attachments: i % 3
    },
    // Un unico cronometro activo en todo el fixture: el caso que pinta la barra superior.
    timer_activo: i === 4
      ? { id: 88, staff_id: 1, start_time: '2026-08-24T13:00:00Z' }
      : null
  }
})

export const HITOS = ESPACIOS.flatMap((espacio, i) =>
  Array.from({ length: 2 }, (_, j) => ({
    id: i * 2 + j + 1,
    name: j === 0 ? 'Entrega inicial' : 'Cierre',
    description: null,
    start_date: espacio.start_date,
    due_date: espacio.deadline,
    project_id: espacio.id,
    color: j === 0 ? '#3b82f6' : '#22c55e',
    milestone_order: j + 1,
    datecreated: espacio.project_created
  }))
)

export const ARCHIVOS = PROCESOS.filter((p) => p.counts.attachments > 0).map((p, i) => ({
  id: 70 + i,
  file_name: ciclo(['propuesta.pdf', 'captura.png', 'notas.txt'], i),
  filetype: ciclo(['application/pdf', 'image/png', 'text/plain'], i),
  size: 18000 + i * 512,
  rel_type: 'task',
  rel_id: p.id,
  staff_id: 1,
  date_added: '2026-08-02T11:00:00Z',
  visible_to_customer: false,
  url: `/api/v1/files/${70 + i}/download`,
  thumbnail_url: null
}))

export const COMENTARIOS = PROCESOS.flatMap((p) =>
  Array.from({ length: p.counts.comments }, (_, j) => ({
    id: p.id * 100 + j,
    task_id: p.id,
    content: `Comentario ${j + 1} sobre el proceso ${p.id}.`,
    staff: { id: ciclo(STAFF, j).id, full_name: ciclo(STAFF, j).full_name },
    date_added: `2026-08-${String((j % 27) + 1).padStart(2, '0')}T12:00:00Z`
  }))
)

export const CHECKLIST = PROCESOS.flatMap((p) =>
  Array.from({ length: p.counts.checklist }, (_, j) => ({
    id: p.id * 100 + j,
    task_id: p.id,
    description: `Punto ${j + 1}`,
    finished: j < p.counts.checklist_done,
    list_order: j + 1,
    assigned: null
  }))
)

export const CRONOMETROS = [
  {
    id: 88,
    task_id: 504,
    staff_id: 1,
    start_time: '2026-08-24T13:00:00Z',
    end_time: null,
    note: null,
    hourly_rate: 0
  }
]

/** Definiciones de campos personalizados, por entidad (`fieldto` de Perfex). */
export const CAMPOS_PERSONALIZADOS = {
  tasks: [
    {
      id: 4,
      slug: 'tasks_cf_area',
      name: 'Área',
      type: 'select',
      options: ['Diseño', 'Desarrollo', 'Contenido'],
      required: true,
      order: 1,
      default_value: null,
      only_admin: false,
      show_on_table: true
    },
    {
      id: 5,
      slug: 'tasks_cf_estimacion',
      name: 'Estimación',
      type: 'input',
      options: null,
      required: false,
      order: 2,
      default_value: null,
      only_admin: false,
      show_on_table: false
    }
  ],
  projects: [
    {
      id: 6,
      slug: 'projects_cf_referente',
      name: 'Referente',
      type: 'input',
      options: null,
      required: false,
      order: 1,
      default_value: null,
      only_admin: true,
      show_on_table: false
    }
  ],
  clients: []
}

/** Valores de campos personalizados, indexados por `${entidad}:${id}`. */
export const VALORES_CAMPOS = Object.fromEntries(
  PROCESOS.map((p, i) => [
    `tasks:${p.id}`,
    [
      {
        id: 4,
        slug: 'tasks_cf_area',
        name: 'Área',
        type: 'select',
        value: ciclo(['Diseño', 'Desarrollo', 'Contenido'], i)
      },
      {
        id: 7,
        slug: 'tasks_cf_canales',
        name: 'Canales',
        type: 'multiselect',
        // ARRAY, no string separado por comas: la base lo guarda con `implode(', ')` y la API
        // deshace esa transformacion. Si la interfaz asume string, se rompe justo acá.
        value: i % 3 === 0 ? ['PR', 'TechLab'] : ['CX']
      }
    ]
  ])
)

/**
 * Salas de reunion, las tres reales de MGC.
 *
 * `panel_token` va fijo y no generado: la pantalla de puerta se prueba abriendo una URL, y una URL
 * que cambia en cada arranque del mock no se puede dejar anotada en la guia de verificacion.
 */
export const SALAS = [
  { id: 1, name: 'El Confesionario', capacity: 3, location: null, active: true, date_created: '2026-08-01T12:00:00Z', panel_token: '7f3a9c1e5b8d4260a1c7e93f5d2b6084' },
  { id: 2, name: 'One Team', capacity: 10, location: 'Piso 2', active: true, date_created: '2026-08-01T12:00:00Z', panel_token: 'c2e60d7b91f34a58bd05e7c31a9b4d62' },
  { id: 3, name: 'Insight', capacity: 8, location: 'Piso 2', active: true, date_created: '2026-08-01T12:00:00Z', panel_token: 'a4d81b360e7c92f5486ad0c1b73e29f5' }
]

/**
 * Reservas de hoy, ancladas al dia en que corre el mock.
 *
 * Se calculan a partir de la fecha actual y no de una constante para que la agenda del mock siempre
 * tenga algo que mostrar: con fechas fijas, al dia siguiente la pantalla sale vacia y parece rota.
 *
 * La hora se arma en UTC a proposito. El mock no conoce la zona del negocio y no tiene por que:
 * emite instantes, que es lo que dice el contrato, y quien los ubica en la grilla es el frontend.
 */
function reservaDeHoy (id, salaId, staffIndex, horaUtc, minutos, titulo, asistentes) {
  const hoy = new Date()
  const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), horaUtc, 0, 0))
  const fin = new Date(inicio.getTime() + minutos * 60_000)
  const persona = STAFF[staffIndex]
  const sala = SALAS.find((s) => s.id === salaId)

  return {
    id,
    room_id: salaId,
    room_name: sala.name,
    room_capacity: sala.capacity,
    staff_id: persona.id,
    staff: {
      id: persona.id,
      full_name: persona.full_name,
      email: persona.email,
      profile_image_url: null
    },
    title: titulo,
    start: inicio.toISOString(),
    end: fin.toISOString(),
    // Los dos siguientes del fixture, para que la agenda del mock muestre participantes sin que
    // haya que crear una reserva a mano.
    participants: STAFF.slice(staffIndex, staffIndex + 2).map((p) => ({
      id: p.id, full_name: p.full_name, profile_image_url: p.profile_image_url
    })),
    attendees: asistentes,
    notes: null,
    cancelled_at: null,
    date_created: inicio.toISOString()
  }
}

export const RESERVAS = [
  reservaDeHoy(1, 2, 0, 13, 60, 'Comité semanal', 8),
  reservaDeHoy(2, 1, 1, 15, 30, 'Uno a uno', 2),
  reservaDeHoy(3, 3, 2, 17, 90, 'Presentación a cliente', 6)
]
