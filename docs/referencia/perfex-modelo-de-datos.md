# Perfex — modelo de datos (referencia)

> **Los endpoints que este documento describe no existen.**
>
> Fue escrito contra el módulo API oficial de Perfex 3.x (header `authtoken`, `/api/clients`,
> `/api/invoices`, …), que **no está instalado** en `board.wiwo.me`. Verificado: no hay ninguna ruta
> `api/*` en `application/config/routes.php`, `authtoken` no aparece en el código fuera del SDK de
> Twilio en `vendor/`, `application/core/App_Controller.php` no maneja tokens, y `curl` sobre
> cualquiera de esas rutas devuelve 404. No es una opción que se active en Settings: es código que
> falta.
>
> **El contrato vigente es [`../contrato-api.md`](../contrato-api.md)**, servido por
> `wiwo-board/modules/api/` con prefijo `/api/v1/` y `Authorization: Bearer`.
>
> Este archivo se conserva por una sola razón: su mapa de campos y de estados de Perfex es correcto y
> es útil al construir los recursos de Finanzas, Comercial y Soporte que todavía faltan en la API.
> Léelo como documentación del **esquema de la base**, nunca como documentación de endpoints.

---

# Perfex CRM — API Handoff para Frontend Next.js
> Documento técnico completo para agentes. Última actualización: 2026-08-25.

---

## 1. Contexto del servidor

| Item | Valor |
|------|-------|
| Perfex WiWO | `https://board.wiwo.me/` |
| Perfex MGC | `https://gestor.mgc.live/` |
| DB WiWO | `wiwoadmin_wiwo_board_db` |
| DB MGC | `mgclive_crm` |
| PHP | ea-php82 |
| Auth | Header `authtoken` con el token del staff |

> ⚠️ La API llama siempre **server-side** desde Next.js. El token **nunca** llega al browser.

---

## 2. Habilitar la API en Perfex

Antes de hacer cualquier llamada:

1. Ir a **Setup → Settings → API**
2. Activar **"Enable API"**
3. Ir a **Setup → Staff → [editar usuario] → API Token**
4. Copiar el token generado → va al `.env` del proyecto

---

## 3. Variables de entorno

```env
# .env.local (Next.js)
PERFEX_BASE_URL=https://board.wiwo.me
PERFEX_TOKEN=tu_token_aqui
```

> En producción usar `.env` (no `.env.local`). El prefijo `NEXT_PUBLIC_` **no se usa** para estas variables — son solo server-side.

---

## 4. Cliente base — `lib/perfex.ts`

Este archivo es el único punto de contacto con Perfex. Todos los demás archivos importan desde acá.

```typescript
// src/lib/perfex.ts

const BASE_URL = process.env.PERFEX_BASE_URL!
const TOKEN    = process.env.PERFEX_TOKEN!

if (!BASE_URL || !TOKEN) {
  throw new Error('[Perfex] PERFEX_BASE_URL y PERFEX_TOKEN son requeridos')
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface PerfexRequestOptions {
  method?: HttpMethod
  body?: Record<string, unknown>
}

export async function perfexFetch<T>(
  path: string,
  options: PerfexRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      authtoken: TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body as Record<string, string>).toString() : undefined,
    // Next.js cache: no cache por defecto (datos siempre frescos)
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`[Perfex] ${method} ${path} → HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}
```

> **Nota sobre el body:** Perfex acepta `application/x-www-form-urlencoded` en POST/PUT, **no** JSON.

---

## 5. Estructura de respuestas

### Respuesta exitosa (lista)
```json
[
  { "userid": "1", "company": "Acme", ... },
  { "userid": "2", "company": "Beta", ... }
]
```

### Respuesta exitosa (uno)
```json
{ "userid": "1", "company": "Acme", ... }
```

### Error de autenticación
```json
{ "status": false, "message": "Invalid API key" }
```

### Error de recurso no encontrado
```json
{ "status": false, "message": "..." }
```

---

## 6. Endpoints y Tipos TypeScript

### 6.1 Clients (Clientes)

**Base path:** `/api/clients`

#### Tipo
```typescript
export interface PerfexClient {
  userid: string
  company: string
  vat: string                    // RUT
  phonenumber: string
  country: string                // código numérico de país
  city: string
  zip: string
  state: string
  address: string
  website: string
  active: '0' | '1'
  billing_street: string
  billing_city: string
  billing_state: string
  billing_zip: string
  billing_country: string
  shipping_street: string
  shipping_city: string
  shipping_state: string
  shipping_zip: string
  shipping_country: string
  default_language: string
  default_currency: string       // id de moneda
  addedfrom: string              // id del staff que lo creó
  registration_confirmed: '0' | '1'
  groups_in: ClientGroup[]
}

export interface ClientGroup {
  id: string
  name: string
}
```

#### Métodos disponibles

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/clients` | Todos los clientes |
| `GET` | `/api/clients/{id}` | Cliente por ID |
| `POST` | `/api/clients` | Crear cliente |
| `PUT` | `/api/clients/{id}` | Actualizar cliente |
| `DELETE` | `/api/clients/{id}` | Eliminar cliente |

#### Funciones `lib/clients.ts`
```typescript
import { perfexFetch } from './perfex'
import type { PerfexClient } from './types'

export const getClients = () =>
  perfexFetch<PerfexClient[]>('/api/clients')

export const getClient = (id: string) =>
  perfexFetch<PerfexClient>(`/api/clients/${id}`)

export const createClient = (data: Partial<PerfexClient>) =>
  perfexFetch<{ status: boolean; message: string; id?: string }>('/api/clients', {
    method: 'POST',
    body: data as Record<string, unknown>,
  })

export const updateClient = (id: string, data: Partial<PerfexClient>) =>
  perfexFetch<{ status: boolean; message: string }>(`/api/clients/${id}`, {
    method: 'PUT',
    body: data as Record<string, unknown>,
  })

export const deleteClient = (id: string) =>
  perfexFetch<{ status: boolean; message: string }>(`/api/clients/${id}`, {
    method: 'DELETE',
  })
```

---

### 6.2 Contacts (Contactos)

**Base path:** `/api/contacts`

#### Tipo
```typescript
export interface PerfexContact {
  id: string
  userid: string                 // id del cliente al que pertenece
  is_primary: '0' | '1'
  firstname: string
  lastname: string
  email: string
  phonenumber: string
  title: string
  datecreated: string            // "2024-01-01 00:00:00"
  active: '0' | '1'
  profile_image: string | null
  direction: string              // ltr | rtl
  invoice_emails: '0' | '1'
  estimate_emails: '0' | '1'
  credit_note_emails: '0' | '1'
  contract_emails: '0' | '1'
  task_emails: '0' | '1'
  project_emails: '0' | '1'
  ticket_emails: '0' | '1'
}
```

#### Métodos disponibles

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/contacts` | Todos los contactos |
| `GET` | `/api/contacts/{id}` | Contacto por ID |
| `GET` | `/api/contacts/client/{client_id}` | Contactos de un cliente |
| `POST` | `/api/contacts` | Crear contacto |
| `PUT` | `/api/contacts/{id}` | Actualizar contacto |
| `DELETE` | `/api/contacts/{id}` | Eliminar contacto |

---

### 6.3 Invoices (Facturas)

**Base path:** `/api/invoices`

#### Tipo
```typescript
export type InvoiceStatus = 1 | 2 | 3 | 4 | 5 | 6

// 1=Unpaid, 2=Paid, 3=Partially paid, 4=Overdue, 5=Cancelled, 6=Draft
export const INVOICE_STATUS: Record<InvoiceStatus, string> = {
  1: 'Sin pagar',
  2: 'Pagada',
  3: 'Pago parcial',
  4: 'Vencida',
  5: 'Cancelada',
  6: 'Borrador',
}

export interface PerfexInvoice {
  id: string
  sent: '0' | '1'
  datesend: string | null
  clientid: string
  deleted_customer_name: string
  number: string
  prefix: string
  number_format: string
  datecreated: string
  date: string                   // "2024-01-01"
  duedate: string
  currency: string               // id de moneda
  subtotal: string
  total_tax: string
  total: string
  adjustment: string
  addedfrom: string
  status: string                 // usar InvoiceStatus
  clientnote: string
  adminnote: string
  discount_percent: string
  discount_total: string
  discount_type: '' | 'before_tax' | 'after_tax'
  recurring: '0' | '1'
  paymentmethod: string | null
  items: InvoiceItem[]
  client: PerfexClient
  currency_name: string
  symbol: string
}

export interface InvoiceItem {
  id: string
  rel_id: string
  rel_type: string
  description: string
  long_description: string
  qty: string
  rate: string
  unit: string
  item_order: string
  taxname: string[]
}
```

#### Métodos disponibles

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/invoices` | Todas las facturas |
| `GET` | `/api/invoices/{id}` | Factura por ID |
| `GET` | `/api/invoices/client/{client_id}` | Facturas de un cliente |
| `POST` | `/api/invoices` | Crear factura |
| `PUT` | `/api/invoices/{id}` | Actualizar factura |
| `DELETE` | `/api/invoices/{id}` | Eliminar factura |

---

### 6.4 Estimates (Cotizaciones)

**Base path:** `/api/estimates`

#### Tipo
```typescript
export type EstimateStatus = 1 | 2 | 3 | 4 | 5

// 1=Draft, 2=Sent, 3=Declined, 4=Accepted, 5=Expired
export const ESTIMATE_STATUS: Record<EstimateStatus, string> = {
  1: 'Borrador',
  2: 'Enviada',
  3: 'Rechazada',
  4: 'Aceptada',
  5: 'Expirada',
}

export interface PerfexEstimate {
  id: string
  sent: '0' | '1'
  datesend: string | null
  clientid: string
  number: string
  prefix: string
  number_format: string
  datecreated: string
  date: string
  expirydate: string
  currency: string
  subtotal: string
  total_tax: string
  total: string
  adjustment: string
  addedfrom: string
  status: string                 // usar EstimateStatus
  reference_no: string
  clientnote: string
  adminnote: string
  discount_percent: string
  discount_total: string
  discount_type: string
  pipeline_order: string
  is_expiry_notified: '0' | '1'
  acceptance_firstname: string
  acceptance_lastname: string
  acceptance_email: string
  acceptance_date: string | null
  acceptance_ip: string
  signature: string | null
  short_link: string | null
  items: InvoiceItem[]
  client: PerfexClient
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/estimates` | Todas las cotizaciones |
| `GET` | `/api/estimates/{id}` | Cotización por ID |
| `GET` | `/api/estimates/client/{client_id}` | Cotizaciones de un cliente |
| `POST` | `/api/estimates` | Crear cotización |
| `PUT` | `/api/estimates/{id}` | Actualizar cotización |
| `DELETE` | `/api/estimates/{id}` | Eliminar cotización |

---

### 6.5 Expenses (Gastos)

**Base path:** `/api/expenses`

#### Tipo
```typescript
export interface PerfexExpense {
  id: string
  category: string               // id de categoría
  currency: string
  amount: string
  tax: string
  tax2: string
  reference_no: string
  note: string
  expense_name: string
  clientid: string | null
  project_id: string | null
  billable: '0' | '1'
  invoiceid: string | null
  paymentmode: string
  date: string
  recurring_type: string | null
  repeat_every: string
  recurring: '0' | '1'
  cycles: string
  total_cycles: string
  custom_recurring: '0' | '1'
  last_recurring_date: string | null
  create_invoice_billable: '0' | '1'
  addedfrom: string
  dateadded: string
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/expenses` | Todos los gastos |
| `GET` | `/api/expenses/{id}` | Gasto por ID |
| `POST` | `/api/expenses` | Crear gasto |
| `PUT` | `/api/expenses/{id}` | Actualizar gasto |
| `DELETE` | `/api/expenses/{id}` | Eliminar gasto |

---

### 6.6 Projects (Proyectos)

**Base path:** `/api/projects`

#### Tipo
```typescript
export type ProjectStatus = 1 | 2 | 3 | 4 | 5
export type ProjectBillingType = 1 | 2 | 3 | 4

// Status: 1=No iniciado, 2=En progreso, 3=En espera, 4=Cancelado, 5=Terminado
export const PROJECT_STATUS: Record<ProjectStatus, string> = {
  1: 'No iniciado',
  2: 'En progreso',
  3: 'En espera',
  4: 'Cancelado',
  5: 'Terminado',
}

// Billing: 1=Monto fijo, 2=Horas del proyecto, 3=Horas por tarea, 4=Sin facturación
export const PROJECT_BILLING: Record<ProjectBillingType, string> = {
  1: 'Monto fijo',
  2: 'Horas del proyecto',
  3: 'Horas por tarea',
  4: 'Sin facturación',
}

export interface PerfexProject {
  id: string
  name: string
  description: string
  status: string                 // usar ProjectStatus
  clientid: string
  billing_type: string           // usar ProjectBillingType
  start_date: string
  deadline: string | null
  project_created: string
  date_finished: string | null
  addedfrom: string
  progress: string               // 0-100
  progress_from_tasks: '0' | '1'
  project_cost: string
  project_rate_per_hour: string
  estimated_hours: string
  contact_notification: '0' | '1'
  settings: ProjectSettings
  members: ProjectMember[]
}

export interface ProjectSettings {
  view_task_comments: string
  view_task_attachments: string
  view_task_checklist_items: string
  upload_on_tasks: string
  open_task_discussion_comments: string
  view_finance_overview: string
  upload_on_milestones: string
  view_milestones: string
  view_gantt: string
  view_timesheets: string
  view_activity_log: string
  view_team_members: string
  hide_tasks_on_main_tasks_table: string
}

export interface ProjectMember {
  id: string
  project_id: string
  staff_id: string
  firstname: string
  lastname: string
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/projects` | Todos los proyectos |
| `GET` | `/api/projects/{id}` | Proyecto por ID |
| `GET` | `/api/projects/client/{client_id}` | Proyectos de un cliente |
| `POST` | `/api/projects` | Crear proyecto |
| `PUT` | `/api/projects/{id}` | Actualizar proyecto |
| `DELETE` | `/api/projects/{id}` | Eliminar proyecto |

---

### 6.7 Tasks (Tareas)

**Base path:** `/api/tasks`

#### Tipo
```typescript
export type TaskStatus   = 1 | 2 | 3 | 4 | 5
export type TaskPriority = 1 | 2 | 3 | 4

// Status: 1=No iniciada, 2=En progreso, 3=Testing, 4=Esperando feedback, 5=Completada
export const TASK_STATUS: Record<TaskStatus, string> = {
  1: 'No iniciada',
  2: 'En progreso',
  3: 'Testing',
  4: 'Esperando feedback',
  5: 'Completada',
}

// Priority: 1=Baja, 2=Media, 3=Alta, 4=Urgente
export const TASK_PRIORITY: Record<TaskPriority, string> = {
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Urgente',
}

export interface PerfexTask {
  id: string
  name: string
  description: string
  priority: string               // usar TaskPriority
  dateadded: string
  startdate: string
  duedate: string | null
  datefinished: string | null
  addedfrom: string
  is_added_from_contact: '0' | '1'
  status: string                 // usar TaskStatus
  rel_type: 'project' | 'invoice' | 'lead' | 'ticket' | 'expense' | 'contract' | 'estimate' | ''
  rel_id: string
  billable: '0' | '1'
  billed: '0' | '1'
  invoice_id: string
  hourly_rate: string
  milestone: string
  kanban_order: string
  milestone_order: string
  visible_to_client: '0' | '1'
  deadline_notified: '0' | '1'
  assignees: TaskAssignee[]
  followers: TaskFollower[]
  comments: TaskComment[]
  checklist_items: TaskChecklistItem[]
}

export interface TaskAssignee {
  id: string
  task_id: string
  staff_id: string
  assigned_from: string
  is_assigned_from_contact: '0' | '1'
}

export interface TaskComment {
  id: string
  taskid: string
  content: string
  staffid: string
  dateadded: string
  contactid: string
  file_name: string | null
  file_mime_type: string | null
}

export interface TaskChecklistItem {
  id: string
  taskid: string
  description: string
  finished: '0' | '1'
  finished_from: string | null
  dateadded: string
  addedfrom: string
  list_order: string
  assigned: string
}

export interface TaskFollower {
  id: string
  task_id: string
  staff_id: string
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/tasks` | Todas las tareas |
| `GET` | `/api/tasks/{id}` | Tarea por ID |
| `GET` | `/api/tasks/project/{project_id}` | Tareas de un proyecto |
| `POST` | `/api/tasks` | Crear tarea |
| `PUT` | `/api/tasks/{id}` | Actualizar tarea |
| `DELETE` | `/api/tasks/{id}` | Eliminar tarea |

---

### 6.8 Leads

**Base path:** `/api/leads`

#### Tipo
```typescript
export interface PerfexLead {
  id: string
  hash: string
  name: string
  title: string
  company: string
  description: string
  country: string
  zip: string
  city: string
  state: string
  address: string
  assigned: string               // staff_id
  dateadded: string
  status: string                 // id del status del lead (configurable en Perfex)
  source: string                 // id de la fuente del lead
  lastcontact: string | null
  dateassigned: string
  last_status_change: string | null
  addedfrom: string
  email: string
  website: string
  phonenumber: string
  is_public: '0' | '1'
  lost: '0' | '1'
  junk: '0' | '1'
  last_lead_status: string
  kanban_order: string
  client_id: string | null       // si fue convertido a cliente
  status_name: string            // nombre del status (incluido en JOIN)
  source_name: string            // nombre de la fuente (incluido en JOIN)
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/leads` | Todos los leads |
| `GET` | `/api/leads/{id}` | Lead por ID |
| `POST` | `/api/leads` | Crear lead |
| `PUT` | `/api/leads/{id}` | Actualizar lead |
| `DELETE` | `/api/leads/{id}` | Eliminar lead |

---

### 6.9 Staff

**Base path:** `/api/staff`

#### Tipo
```typescript
export interface PerfexStaff {
  staffid: string
  email: string
  firstname: string
  lastname: string
  facebook: string
  linkedin: string
  phonenumber: string
  skype: string
  password: string               // siempre vacío en respuesta API
  datecreated: string
  profile_image: string | null
  last_ip: string
  last_login: string
  last_activity: string
  last_password_change: string
  new_pass_key: string | null
  new_pass_key_requested: string | null
  admin: '0' | '1'
  role: string                   // id del rol
  active: '0' | '1'
  default_language: string
  direction: string
  media_path_slug: string | null
  is_not_staff: '0' | '1'
  hourly_rate: string
  two_factor_auth_enabled: '0' | '1'
  email_signature: string
  fullname: string               // firstname + lastname (campo virtual)
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/staff` | Todos los staff |
| `GET` | `/api/staff/{id}` | Staff por ID |

> ⚠️ Staff es **solo lectura** vía API. Crear/editar staff se hace desde el admin de Perfex.

---

### 6.10 Tickets (Soporte)

**Base path:** `/api/tickets`

#### Tipo
```typescript
export type TicketStatus   = 1 | 2 | 3 | 4 | 5
export type TicketPriority = 1 | 2 | 3 | 4

// Status: 1=Open, 2=In progress, 3=Answered, 4=On hold, 5=Closed
export const TICKET_STATUS: Record<TicketStatus, string> = {
  1: 'Abierto',
  2: 'En progreso',
  3: 'Respondido',
  4: 'En espera',
  5: 'Cerrado',
}

// Priority: 1=Low, 2=Medium, 3=High, 4=Urgent
export const TICKET_PRIORITY: Record<TicketPriority, string> = {
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Urgente',
}

export interface PerfexTicket {
  ticketid: string
  adminreplying: '0' | '1'
  userid: string
  contactid: string
  email: string
  name: string
  department: string             // id del departamento
  priority: string               // usar TicketPriority
  status: string                 // usar TicketStatus
  service: string | null
  ticketkey: string
  subject: string
  message: string
  admin: string | null           // staff_id del admin asignado
  date: string
  project_id: string | null
  lastreply: string
  client_read: '0' | '1'
  admin_read: '0' | '1'
  assigned: string               // staff_id del asignado
  replies: TicketReply[]
}

export interface TicketReply {
  id: string
  ticketid: string
  admin: string | null
  contact: string | null
  message: string
  date: string
  attachment: string | null
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/tickets` | Todos los tickets |
| `GET` | `/api/tickets/{id}` | Ticket por ID |
| `GET` | `/api/tickets/client/{client_id}` | Tickets de un cliente |
| `POST` | `/api/tickets` | Crear ticket |
| `PUT` | `/api/tickets/{id}` | Actualizar ticket |
| `DELETE` | `/api/tickets/{id}` | Eliminar ticket |

---

### 6.11 Payments (Pagos)

**Base path:** `/api/payments`

#### Tipo
```typescript
export interface PerfexPayment {
  id: string
  invoiceid: string
  amount: string
  paymentmode: string            // id del modo de pago
  paymentmethod: string
  date: string
  daterecorded: string
  note: string
  transactionid: string
  name: string                   // nombre del modo de pago (JOIN)
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/payments` | Todos los pagos |
| `GET` | `/api/payments/{id}` | Pago por ID |
| `GET` | `/api/payments/invoice/{invoice_id}` | Pagos de una factura |

---

### 6.12 Contracts (Contratos)

**Base path:** `/api/contracts`

#### Tipo
```typescript
export interface PerfexContract {
  id: string
  content: string
  description: string
  subject: string
  client: string                 // client_id
  datestart: string
  dateend: string
  contract_type: string          // id del tipo de contrato
  project_id: string
  addedfrom: string
  dateadded: string
  isexpirynotified: '0' | '1'
  not_visible_to_client: '0' | '1'
  hash: string
  signed: '0' | '1'
  signature: string | null
  marked_as_signed: '0' | '1'
  acceptance_firstname: string | null
  acceptance_lastname: string | null
  acceptance_email: string | null
  acceptance_date: string | null
  acceptance_ip: string | null
  short_link: string | null
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/contracts` | Todos los contratos |
| `GET` | `/api/contracts/{id}` | Contrato por ID |
| `GET` | `/api/contracts/client/{client_id}` | Contratos de un cliente |
| `POST` | `/api/contracts` | Crear contrato |
| `PUT` | `/api/contracts/{id}` | Actualizar contrato |
| `DELETE` | `/api/contracts/{id}` | Eliminar contrato |

---

### 6.13 Proposals (Propuestas)

**Base path:** `/api/proposals`

#### Tipo
```typescript
export type ProposalStatus = 1 | 2 | 3 | 4 | 5 | 6

// 1=Draft, 2=Sent, 3=Open, 4=Revised, 5=Declined, 6=Accepted
export const PROPOSAL_STATUS: Record<ProposalStatus, string> = {
  1: 'Borrador',
  2: 'Enviada',
  3: 'Abierta',
  4: 'Revisada',
  5: 'Rechazada',
  6: 'Aceptada',
}

export interface PerfexProposal {
  id: string
  subject: string
  content: string
  addedfrom: string
  datecreated: string
  total: string
  subtotal: string
  total_tax: string
  adjustment: string
  discount_percent: string
  discount_total: string
  discount_type: string
  status: string                 // usar ProposalStatus
  open_till: string
  date: string
  currency: string
  proposal_to: string
  address: string
  email: string
  phone: string
  allow_comments: '0' | '1'
  rel_id: string
  rel_type: 'lead' | 'customer'
  pipeline_order: string
  is_expiry_notified: '0' | '1'
  acceptance_firstname: string | null
  acceptance_lastname: string | null
  acceptance_email: string | null
  acceptance_date: string | null
  acceptance_ip: string | null
  signature: string | null
  short_link: string | null
  hash: string
  items: InvoiceItem[]
}
```

| Método | URL | Descripción |
|--------|-----|-------------|
| `GET` | `/api/proposals` | Todas las propuestas |
| `GET` | `/api/proposals/{id}` | Propuesta por ID |
| `POST` | `/api/proposals` | Crear propuesta |
| `PUT` | `/api/proposals/{id}` | Actualizar propuesta |
| `DELETE` | `/api/proposals/{id}` | Eliminar propuesta |

---

### 6.14 Currencies, Taxes, Payment Modes

Son recursos de solo lectura que se usan para poblar selects en formularios.

```typescript
export interface PerfexCurrency {
  id: string
  symbol: string
  name: string
  decimal_separator: string
  thousand_separator: string
  placement: 'before' | 'after'
  isdefault: '0' | '1'
  currencyid: string
}

export interface PerfexTax {
  id: string
  name: string
  taxrate: string
}

export interface PerfexPaymentMode {
  id: string
  name: string
  description: string
  show_on_pdf: '0' | '1'
  invoices_only: '0' | '1'
  expenses_only: '0' | '1'
  selected_by_default: '0' | '1'
  active: '0' | '1'
}
```

| Recurso | URL GET |
|---------|---------|
| Monedas | `/api/currencies` |
| Impuestos | `/api/taxes` |
| Modos de pago | `/api/payment-modes` |

---

## 7. Manejo de errores

```typescript
// src/lib/perfex.ts — versión con manejo de errores robusto

export class PerfexError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string
  ) {
    super(message)
    this.name = 'PerfexError'
  }
}

export async function perfexFetch<T>(
  path: string,
  options: PerfexRequestOptions = {}
): Promise<T> {
  const { method = 'GET', body } = options

  let res: Response

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        authtoken: TOKEN,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body ? new URLSearchParams(body as Record<string, string>).toString() : undefined,
      cache: 'no-store',
    })
  } catch (err) {
    throw new PerfexError(
      `Network error: ${err instanceof Error ? err.message : 'unknown'}`,
      0,
      path
    )
  }

  if (res.status === 401) {
    throw new PerfexError('Token inválido o API deshabilitada', 401, path)
  }

  if (res.status === 404) {
    throw new PerfexError('Recurso no encontrado', 404, path)
  }

  if (!res.ok) {
    throw new PerfexError(`HTTP ${res.status}`, res.status, path)
  }

  const data = await res.json()

  // Perfex a veces devuelve 200 con { status: false, message: '...' }
  if (data && typeof data === 'object' && 'status' in data && data.status === false) {
    throw new PerfexError(data.message ?? 'Error de Perfex', 400, path)
  }

  return data as T
}
```

---

## 8. Patrones de uso en Next.js

### 8.1 Server Component — lista de proyectos
```tsx
// src/app/dashboard/proyectos/page.tsx
import { perfexFetch } from '@/lib/perfex'
import type { PerfexProject } from '@/lib/types'

export default async function ProyectosPage() {
  const proyectos = await perfexFetch<PerfexProject[]>('/api/projects')

  return (
    <ul>
      {proyectos.map((p) => (
        <li key={p.id}>
          <span>{p.name}</span>
          <span>{PROJECT_STATUS[Number(p.status) as ProjectStatus]}</span>
        </li>
      ))}
    </ul>
  )
}
```

### 8.2 API Route — proxy thin para el cliente
```typescript
// src/app/api/clients/route.ts
import { perfexFetch } from '@/lib/perfex'
import type { PerfexClient } from '@/lib/types'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const clients = await perfexFetch<PerfexClient[]>('/api/clients')
    return NextResponse.json(clients)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 }
    )
  }
}
```

### 8.3 Server Action — crear cliente
```typescript
// src/app/actions/clients.ts
'use server'

import { perfexFetch } from '@/lib/perfex'
import { revalidatePath } from 'next/cache'

export async function createClientAction(formData: FormData) {
  const data = {
    company:     formData.get('company') as string,
    phonenumber: formData.get('phonenumber') as string,
    email:       formData.get('email') as string,
    vat:         formData.get('vat') as string,
    country:     '44', // Chile
  }

  const result = await perfexFetch<{ status: boolean; id: string }>('/api/clients', {
    method: 'POST',
    body: data as Record<string, unknown>,
  })

  revalidatePath('/dashboard/clientes')
  return result
}
```

### 8.4 Estructura de archivos recomendada

```
src/
├── lib/
│   ├── perfex.ts          ← cliente base + PerfexError
│   ├── types.ts           ← todos los tipos TypeScript
│   ├── clients.ts         ← funciones para /api/clients
│   ├── contacts.ts        ← funciones para /api/contacts
│   ├── invoices.ts        ← funciones para /api/invoices
│   ├── projects.ts        ← funciones para /api/projects
│   ├── tasks.ts           ← funciones para /api/tasks
│   ├── leads.ts           ← funciones para /api/leads
│   └── tickets.ts         ← funciones para /api/tickets
├── app/
│   ├── api/               ← solo si se necesita exponer al browser
│   │   └── [...]/route.ts
│   ├── dashboard/
│   │   ├── clientes/
│   │   ├── proyectos/
│   │   ├── facturas/
│   │   └── tareas/
│   ├── layout.tsx
│   └── page.tsx
└── actions/               ← Server Actions para mutations
    ├── clients.ts
    ├── projects.ts
    └── tasks.ts
```

---

## 9. Notas importantes

### POST y PUT — formato del body
Perfex **no acepta JSON** en POST/PUT. El body debe ir como `application/x-www-form-urlencoded`:

```typescript
body: new URLSearchParams({ company: 'Acme', phonenumber: '+56912345678' }).toString()
```

### Items en facturas/cotizaciones
Al crear una factura con items se usa un formato especial:

```
newitems[0][description]=Servicio X
newitems[0][rate]=100000
newitems[0][qty]=1
newitems[0][unit]=
newitems[0][taxname][0]=IVA|19
```

### IDs numéricos como strings
Todos los IDs en las respuestas de Perfex son **strings** aunque sean numéricos. Nunca usar `===` sin convertir primero: `Number(project.status)`.

### Paginación
La API de Perfex **no tiene paginación nativa**. Devuelve todos los registros. Para datasets grandes, implementar paginación del lado del frontend (`.slice()`).

### Rate limiting
No hay rate limiting documentado, pero evitar hacer múltiples llamadas en paralelo sin control. Usar `Promise.all` solo cuando sea necesario.

### Custom Fields
Perfex soporta campos personalizados. Si el Perfex tiene custom fields configurados, aparecen en las respuestas como campos extra. Se acceden igual que los campos normales.

### Módulos instalados en board.wiwo.me
Los siguientes módulos están instalados y pueden tener endpoints extra:
- `goals` — objetivos/metas
- `prchat` — chat interno
- `project_management_enhancements` — mejoras en proyectos
- `surveys` — encuestas
- `openai` — integración con OpenAI
- `form_sync` — sincronización de formularios
- `flexibackup` — respaldos

---

## 10. Checklist de implementación

- [ ] Habilitar API en Perfex: **Setup → Settings → API → Enable = Yes**
- [ ] Generar token: **Setup → Staff → [usuario] → API Token**
- [ ] Agregar variables de entorno al `.env.local`
- [ ] Crear `src/lib/perfex.ts` con el cliente base
- [ ] Crear `src/lib/types.ts` con todos los tipos
- [ ] Crear funciones por recurso en `src/lib/*.ts`
- [ ] Usar Server Components para lecturas
- [ ] Usar Server Actions para escrituras (POST/PUT/DELETE)
- [ ] Nunca exponer `PERFEX_TOKEN` al browser (sin prefijo `NEXT_PUBLIC_`)
