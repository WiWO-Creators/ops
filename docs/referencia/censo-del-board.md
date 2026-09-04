# Censo del board

Qué hay realmente adentro del board (Perfex CRM, `board.wiwo.me`), medido sobre los dumps de
producción, y qué reglas de negocio se dedujeron de ahí. Existe porque estos números no se
reproducen sin volver a medir: son el único retrato de qué funcionalidades el equipo usa de verdad
y cuáles nunca tocó. ops-v2 consume la API del board, así que decidir qué pantalla construir y qué
ignorar se resuelve con esta tabla, no con el menú de Perfex.

**Fuentes.** Dos volcados en la raíz del repo:

| Sigla | Archivo | Fecha |
|---|---|---|
| **D19** | `wiwo_board_db_full_20260819_161407.sql.gz` | 19/08/2026 16:14 |
| **D12** | `wiwoadmin_wiwo_board_db-20260812-154251.sql` | 12/08/2026 15:42 |

Salvo que se diga lo contrario, los números son de **D19**. Nunca abrir ninguno de los dos con un
editor ni volcarlos a una conversación (ver [Cómo reproducir los números](#cómo-reproducir-los-números)).

Tercera fuente, no derivada de la base: el CSV
`wiwo_board_proyectos_focal_personas_2026_08_19_01ae6395_9a46_4.csv` (raíz del repo, 76 KB, 274
filas de datos), curado a mano y del mismo momento que D19.

---

## Qué es el board en los hechos

Perfex es un CRM completo: facturación, presupuestos, tickets, gastos, catálogo, objetivos. En WiWO
**se usa como gestor de trabajo y nada más**. Lo que está vivo son proyectos, hitos, tareas,
personas, clientes y —marginalmente— leads y contratos.

Jerarquía real, con los nombres que usa el equipo:

| Nivel | Tabla | Qué es |
|---|---|---|
| Proyecto (campaña) | `tblprojects` | La unidad de trabajo; cuelga de un cliente |
| Hito | `tblmilestones` | Suele ser una semana ("SEMANA 1 \| 06/08/2026 - 10/08/2026") |
| Tarea | `tbltasks` | El ítem que la gente mueve |

Dos evidencias de que el uso es de trabajo y no comercial:

- De las 15.835 notificaciones, las que más pesan son tarea completada, alta como seguidor, cambio
  de estado y asignación. Ninguna es de venta.
- Los 5.726 seguidores sobre 2.580 tareas (2,22 por tarea) muestran que la gente mira "lo que
  sigo", no sólo "lo que tengo asignado".

El kanban de tareas del board **siempre agrupa por estado**, nunca por proyecto
(`wiwo-board/application/views/admin/tasks/kan_ban.php`, que itera `$task_statuses`).

---

## Lo que nunca se usó

Módulos que Perfex trae de fábrica, instalados y **en cero filas** (D19):

| Módulo | Tablas |
|---|---|
| Soporte / tickets | `tbltickets`, `tblticket_replies`, `tblticket_attachments` |
| Facturación | `tblinvoices`, `tblinvoicepaymentrecords`, `tblcreditnotes` |
| Presupuestos y propuestas | `tblestimates`, `tblestimate_requests`, `tblproposals` |
| Gastos | `tblexpenses`, `tblexpenses_categories` |
| Catálogo | `tblitems`, `tblservices`, `tblsubscriptions` |
| Objetivos | `tblgoals` |
| Departamentos | `tbldepartments`, `tblstaff_departments` |
| Novedades y anuncios | `tblnewsfeed_*`, `tblannouncements` |
| Discusiones y notas de proyecto | `tblprojectdiscussions`, `tblproject_notes` |
| Dependencias entre tareas | `tblproject_task_dependencies` |
| GDPR, consentimientos, bóveda | `tblgdpr_requests`, `tblconsents`, `tblvault` |

**No construir pantallas de ops-v2 para nada de esta lista.** Los endpoints existen en la API del
board y devuelven vacío.

Con datos, pero igualmente muertos:

| Qué | Dato | Por qué no cuenta |
|---|---|---|
| Tipos de tarea (módulo PME) | 817 tipos + 760 relaciones | Bug/Feature/Task autogenerados por proyecto: **ninguna tarea tiene tipo asignado**, todos `NULL` |
| Chat interno (`prchat`) | 20 mensajes | El módulo está desactivado en `tblmodules` |
| Base de conocimiento | 2 artículos | Dos artículos no son una base |
| Notas | 4 | Ídem |
| Calendario | 11 eventos | Uso anecdótico |
| Recordatorios | 6 | Ídem |
| Filtros guardados | 44 | Preferencias de listado, no datos |
| To-dos personales | 65 | Ídem |
| Encuestas (`surveys`) | 0 | Instalado, sin uso |
| Facturación electrónica (`einvoice`) | 0 | Depende de facturación, que está en cero |
| Login social | 174 auto-logins | Sustituido por el login con Google |
| Sesiones (`tblsessions`) | 540.567 | Basura de sesión; el board las limpia con un hook a las 24 h (`application/config/my_hooks.php`) |

**Portal de clientes.** Existe y casi nadie entra: `tblproject_settings` tiene **4.884 filas**, que
son 19 banderas de visibilidad por cada uno de 250 proyectos, creadas automáticamente al dar de
alta el proyecto — no las configuró nadie. Contactos con acceso real: **15 sobre 123 clientes**. El
portal de ops-v2 se diseñó desde cero (enlace de un solo uso), sin heredar nada de esto.

**Historial interno de Perfex**, sin equivalente ni valor fuera del board: `tblactivity_log`
(18.923), `tblnotifications` (15.835), `tbltask_recent_changes` (3.138), `tblproject_activity`
(7.606).

---

## Volumen por funcionalidad

Todos los conteos son de **D19** salvo la columna marcada D12.

| Funcionalidad | Tabla(s) | Filas D19 | D12 | Detalle |
|---|---|---:|---:|---|
| Clientes | `tblclients` | — | 121 | 106 activos; sólo 1 con carpeta de Drive |
| Contactos de cliente | `tblcontacts` | — | 13 | todos con email |
| Grupos de cliente | `tblcustomer_groups` | — | 88 asignaciones | el único campo de cliente bien cargado |
| Personas del equipo | `tblstaff` | 179 | 179 | 104 distintas figuran asociadas a algún proyecto |
| Proyectos | `tblprojects` | 274 | 267 | ver el censo de focales abajo |
| Hitos | `tblmilestones` | 268 | 268 | con color y orden propios |
| Tareas | `tbltasks` | 2.580 | 2.476 | 2.097 cuelgan de un proyecto, 143 del cliente, 340 de nada |
| Asignaciones de tarea | `tbltask_assigned` | 3.781 | 3.652 | **varios responsables por tarea es lo normal** |
| Seguidores de tarea | `tbltask_followers` | 5.726 | — | 2,22 por tarea (2,32 en las abiertas); sin pares repetidos, pero tampoco índice único |
| Comentarios | `tbltask_comments` | — | 246 | |
| Etiquetas (catálogo) | `tbltags` | 328 | — | taxonomía libre, sin color ni categoría |
| Etiquetas (asignaciones) | `tbltaggables` | 3.080 | — | 2.587 en tareas, 182 en proyectos, 8 en leads |
| Checklists | `tbltask_checklist_items` | 418 | 398 | sobre 86 tareas: 79 ítems en tareas abiertas, 339 en completadas; 155 con responsable; 2 plantillas |
| Registro de tiempo | `tbltaskstimers` | 220 | — | sobre 133 tareas y 26 personas; **3 cronómetros quedaron abiertos** |
| Adjuntos | `tblfiles` | 251 | 240 | 219 de tareas (103 colgados de un comentario, en 86 tareas), 29 de contratos (de 25 contratos), 3 de clientes |
| Campos personalizados | `tblcustomfields` / `…values` | 29 campos / 3.877 valores | — | detalle abajo |
| Roles | `tblroles` | 5 | — | `Employee` (sin permisos serializados), `Consultor/Director`, `Director`, `Gerencia`, `Consultor/Director PALTA` |
| Permisos por persona | `tblstaff_permissions` | 5.715 | — | detalle abajo |
| Notificaciones | `tblnotifications` | 15.835 | — | detalle abajo |
| Leads | `tblleads` | 82 | 79 | embudo de 9 etapas, 7 orígenes |
| Actividad de leads | `tbllead_activity_log` | 280 | — | |
| Contratos | `tblcontracts` | 30 | 29 | 8 renovaciones, 29 PDF adjuntos |
| Formularios web | `tblform_sync_form_configurations` | 2 | — | ver riesgos |

### Los 29 campos personalizados

Ordenados por uso real (`tblcustomfieldsvalues`):

| Campo | Entidad | Tipo | Valores |
|---|---|---|---:|
| Área de la compañía | tarea | multiselect | 2.440 |
| Link de Drive | tarea | link | 513 |
| N° de Cotización | proyecto | number | 264 |
| Unidad de Negocio | lead | select | 78 |
| Palabra Clave | proyecto | textarea | 68 |
| Fecha de Entrega / Título de la Tarea | lead | date / input | 50 c/u |
| Renovación automática, requiere OC, requiere código de OC, Status | contrato | select | 29 c/u |
| Unidad de Negocio | cliente | select | 27 |
| Tipo de importe (CLP/USD/UF) | contrato | select | 13 |
| Brief de campaña (problema, KPIs, tono, audiencia, relación con la marca, objetivo, mercado, a quién le vendemos, presupuesto, tipo de proyecto) | lead | varios | 1–14 c/u |
| Los mismos del brief, duplicados en cliente | cliente | varios | 1–5 c/u |

Los del proyecto son **sólo dos**: N° de Cotización y Palabra Clave. Los duplicados en cliente no
tienen uso.

### Reparto de los 5.715 permisos

| Módulo | Filas | ¿Significa algo? |
|---|---:|---|
| tasks | 1.148 | Sí |
| projects | 861 | Sí |
| proposals | 835 | No: 0 propuestas |
| knowledge_base / items / goals | 668 c/u | No: 2, 0 y 0 filas |
| reports | 334 | Parcial |
| leads | 173 | Sí |
| customers | 92 | Sí |

Más de la mitad son ruido: plantillas de rol que otorgan permisos sobre módulos vacíos. Un
inventario de permisos del board **no** describe lo que la gente realmente puede o necesita hacer.

### Reparto de las 15.835 notificaciones

| Evento | Filas |
|---|---:|
| Tarea marcada como completada | 1.323 |
| Alta como seguidor | 919 + 767 |
| Cambio de estado de la tarea | 858 |
| Asignación de tarea | 744 + 441 |
| Alta como miembro de un proyecto | 390 |

Perfex además manda correo en cada uno de esos eventos, con plantillas en `tblemailtemplates`.

### Censo de proyectos y focales (CSV + D19)

El CSV y D19 son del mismo momento y **coinciden fila por fila**: 274 proyectos, mismos ids,
estados y fechas, y `personas_asociadas_board` es exactamente `tblproject_members` en los 274 casos.

| | |
|---|---|
| Proyectos | 274. Por ambiente: `mgc` 192, sin clasificar 64, `wiwo` 14, `palta` 4 |
| Estados | En progreso 212, Terminado 47, No iniciado 11, Cancelado 3, En pausa 1 |
| Focales | 64 personas; **104 proyectos tienen más de un focal**; **13 proyectos sin focal** |
| Personas asociadas | 104 distintas, todas activas en `tblstaff`; de 1 a 15 por proyecto, promedio 3,1; 4 focales no figuran entre las asociadas de su propio proyecto |
| Carga por persona | mediana 3 proyectos, p90 24, máximo 46 |
| Nombres de proyecto | 20 repetidos |

**Regla dura: `focal` no sale de la base.** No es un campo personalizado (los de proyecto son sólo
N° de Cotización y Palabra Clave), no es `addedfrom` (coincide en 248 de 274), no son los
`customer_admins` del cliente (8 de 274) ni los creadores de las tareas (105 de 274). Es una columna
curada a mano: **el CSV es la única fuente de los focales**. Si se pierde, el dato se pierde.

**Corolario:** el ancla de un proyecto es `project_id`, nunca el nombre — hay 20 nombres repetidos.

### El embudo comercial

`tblleads_status`, en orden: Customer, Stand by, Coordinando reunión, Generando propuesta,
Propuesta enviada, Negociación, Ganados, Perdidos / Abandonados. Hay una novena fila, `Generando
Propuesta`, **duplicada con distinta capitalización**, que corresponde a la cuarta.

`tblleads_sources` (7 filas, 6 nombres): ClienteStock, Facebook, Google, Lead (duplicado), PR,
Referido.

Campos propios del lead: `name`, `title`, `company`, `email`, `website`, ciudad/país/dirección,
`assigned`, `source`, `lastcontact`, `dateassigned`, `last_status_change`, `from_form_id` (el
formulario web que lo creó).

### Contratos

`tblcontracts` (30) con `subject`, `client`, `project_id`, `datestart`, `dateend`, `contract_type`,
`contract_value`, `content` (el texto), `signed`, `signature`, `isexpirynotified`. Más
`tblcontract_renewals` (8) y 29 PDF en `tblfiles`. El board avisa cuando un contrato está por vencer
y permite firmarlo en línea.

---

## Reglas de negocio del board

Decisiones de producto tomadas sobre el board que siguen valiendo en ops-v2.

### Visibilidad de proyectos

1. **"Tarea asociada" = asignada a esa persona o creada por ella.** Ésas son las dos condiciones
   que hacen visible un proyecto.
2. **No hay salida automática.** Si a alguien le reasignan su última tarea del proyecto, sigue
   viéndolo hasta que un humano lo saque.
3. Aplica a **todos los proyectos, incluidos los existentes**.
4. **Los administradores de la empresa ven todos los proyectos**, definidos como una lista
   explícita de cuentas — no como un rol genérico de admin. La cuenta técnica del desarrollador
   queda fuera de esa lista.

### El focal manda

El focal es el administrador y creador del proyecto: hace todo y ve todo dentro de él. Las personas
asociadas al proyecto **no ven nada por omisión**; es el focal quien reparte permisos (sólo sus
tareas, las de todos, etc.). Un miembro sin permiso explícito no es un miembro con acceso total: si
un sistema no distingue esos dos estados, sumar a alguien equivale a abrirle el proyecto entero.

### Área de empresa

Campo **multiselect** de la tarea — 803 tareas tienen dos o tres áreas a la vez, así que no se puede
modelar como valor único. Los 16 valores reales: PR, TechLab, Influencer, CX SAC, Content Studio,
Digital Creators, Creatividad, Storytelling, Analytics, Wiwo, Palta, HL, iLuk, Aima, Foundaxis e
Inteligencia.

La tarea lleva además **Link de Drive** (un enlace, 513 valores).

### Jerarquía y kanban

Proyecto → Hito → Tarea. El **kanban de tareas siempre agrupa por estado**; agruparlo por proyecto
dentro de un proyecto da una sola columna y no sirve para nada.

### Tablero de Hitos

Es la vista con la que el equipo planifica la semana. Cada columna es un hito, con su rango de
fechas en el título y el subtotal de tiempo registrado; cada tarjeta es una tarea de ese hito con
avatar del asignado, título, estado, tiempo registrado y rango de fechas.

Dos detalles que no se leen del código a primera vista:

- La columna `id = 0` es **"Sin categoría"**: las tareas sin hito. Se omite si está vacía.
- El color de la tarjeta: `#eff6ff` (celeste) = la tarea está asignada a quien mira; `#fef2f2`
  (rosado) = venció y no está completada.

### Personas duplicadas

Una persona cargada a mano en el directorio **no se fusiona** con su cuenta cuando después acepta la
invitación: si el match se hace sólo por identidad de cuenta y no por email, se crea una ficha
nueva y la vieja queda huérfana. Reconciliar es manual. La misma puerta está abierta del otro lado:
crear un empleado sobre alguien ya cargado como contacto también duplica.

**Regla para ops-v2: cualquier alta de persona busca primero por email.**

### Marca

Tokens de marca del board (`wiwo-board/assets/neo/wiwo.tokens.css`): `--wiwo-blue #4242FF`,
`--wiwo-green #3BFF00`, `--wiwo-beige #F8FAD7`, `--wiwo-ink #292929`, definidos en claro y oscuro.
Tipografía Plus Jakarta Sans, alojada en el propio servidor (`assets/neo/fonts/`).

---

## Riesgos con fecha de vencimiento

**Los adjuntos son sólo rutas.** `tblfiles` guarda `rel_id`, `rel_type`, `file_name`, `filetype`,
`staffid`, `dateadded`, `task_comment_id` y `external`/`external_link` — la ruta y los metadatos,
**nunca el contenido**. Los 251 binarios viven en el disco del servidor de `board.wiwo.me`, bajo las
carpetas que define `wiwo-board/application/config/constants.php`:

| Tipo | Constante | Ruta |
|---|---|---|
| Tareas | `TASKS_ATTACHMENTS_FOLDER` (`:163`) | `uploads/tasks/<taskid>/<file_name>` |
| Contratos | `CONTRACTS_UPLOADS_FOLDER` (`:159`) | `uploads/contracts/<contractid>/…` |
| Clientes | `CLIENT_ATTACHMENTS_FOLDER` (`:135`) | `uploads/clients/<clientid>/…` |

Ningún nombre de archivo se repite dentro del mismo objeto, así que el par (documento, nombre)
sirve de marca para no duplicar. **Si el servidor se apaga sin rescatar el disco, los 251 archivos
se pierden: el dump no los tiene.**

**Los formularios web siguen escribiendo al board.** El módulo `wiwo-board/modules/form_sync`
(FormSync 1.0.0, de terceros) recibe envíos externos y crea leads por tres endpoints públicos:

| Endpoint | Ubicación |
|---|---|
| `webhook/` | `modules/form_sync/controllers/Form_sync.php:2164` |
| `webhook_framer/` | `…:2294` |
| `webhook_webflow/` | `…:2429` |

Proveedores soportados en `modules/form_sync/providers/`: Framer, Webflow, Elementor, Google Forms,
más uno universal y uno de aplicación. Los webhooks están **excluidos del CSRF**
(`modules/form_sync/config/csrf_exclude_uris.php`): son superficie pública, y el secreto se
configura por formulario. Perfex trae además su propio web-to-lead nativo (`tblweb_to_lead`), aparte
de este módulo.

Uso real: **2 formularios configurados**, y las tablas de mapeo de campos y de registro están
vacías. Poco volumen, pero es una entrada de datos viva y pública: apagar el board sin migrar estos
webhooks corta la captación de leads en silencio.

**Los tres cronómetros abiertos.** De los 220 registros de tiempo, 3 quedaron corriendo sin cerrar.
Cualquier cálculo de horas debe tratarlos como abandonados y acotarlos, no sumar hasta hoy.

---

## Dónde vive cada cosa en el código del board

Rutas relativas a `/home/wiwo/ops.wiwo/wiwo-board/`, verificadas contra el árbol actual.

| Pieza | Archivo |
|---|---|
| Kanban de tareas (agrupado por estado) | `application/views/admin/tasks/kan_ban.php` |
| Tablero de hitos: columna = hito | `application/views/admin/projects/milestones_kan_ban.php` |
| Tablero de hitos: tarjeta = tarea | `application/views/admin/projects/_milestone_kanban_card.php` |
| Sección Hitos (botón "Nuevo hito", toggle a tabla) | `application/views/admin/projects/project_milestones.php` |
| Consulta paginada por columna de hito | `Projects_model::do_milestones_kanban_query()` — `application/models/Projects_model.php:410` |
| Suma de tiempo registrado del hito | `Projects_model::calc_milestone_logged_time()` — `application/models/Projects_model.php:526` |
| Drag & drop de tarea entre hitos | `assets/js/projects.js:878` → `POST projects/update_task_milestone` |
| Colores de la tarjeta de hito | `assets/css/style.css:3562` y `:3567` |
| Carpetas de subida de adjuntos | `application/config/constants.php:135`, `:159`, `:163` |
| Webhooks de formularios | `modules/form_sync/controllers/Form_sync.php:2164`, `:2294`, `:2429` |
| Exclusión de CSRF de los webhooks | `modules/form_sync/config/csrf_exclude_uris.php` |
| Proveedores de formularios | `modules/form_sync/providers/` |
| Limpieza de sesiones a las 24 h | `application/config/my_hooks.php` |
| Identidad visual (2.900 líneas de CSS/JS a medida) | `assets/neo/` |

---

## Cómo reproducir los números

Ningún número de este documento sale de memoria. Todos se reproducen contra el dump **sin abrirlo
entero**:

```bash
cd /home/wiwo/ops.wiwo
zcat wiwo_board_db_full_20260819_161407.sql.gz | grep -a -m1 -A20 'CREATE TABLE `tbltags`'
zcat wiwo_board_db_full_20260819_161407.sql.gz | grep -a -m1 -A2 'INSERT INTO `tblcustomfields`'
```

**Nunca abrir el dump con un editor ni volcarlo a una conversación**: son 84 MB en texto plano
(18,6 MB comprimido). Siempre `zcat | grep -a` con `-m1` y un `-A<n>` acotado.
