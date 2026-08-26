# Portal del cliente

> Lo que ve el cliente, no lo que el equipo ve del cliente. Otra audiencia, otra autenticación y
> otro sujeto en el token.

## Qué resuelve

Que un contacto de cliente entre con su correo y vea, en solo lectura, el avance de sus proyectos y
todos los documentos que compartimos con él. Reemplaza a las 77 vistas de
`themes/perfex` del portal de Perfex, que sigue en pie hasta que este se despliegue.

## Lo que hay que entender antes de tocarlo

**El sujeto no es un staff con menos permisos.** Un contacto vive en `tblcontacts`, con ids que se
solapan con los de `tblstaff`: el contacto 183 y el empleado 183 no tienen nada que ver. Por eso el
token lleva `sujeto_tipo` y la sesión del navegador lleva `sujeto`, y por eso hay dos cookies
(`ops_sesion` y `ops_portal`) en vez de una con un campo adentro.

**El aislamiento se aplica en tres capas, no en una.** Cada una alcanza sola:

1. `Tokens::resolver()` filtra `sujeto_tipo = 'staff'` en la consulta, así que un token de contacto
   es indistinguible de uno inexistente para el panel. Ningún handler chequea nada porque no hace
   falta.
2. `V1::exigirContacto()` hace lo simétrico, y el `case 'portal'` es la única rama que lo llama.
3. El BFF tiene una lista blanca por sujeto: un contacto no puede pedir `clients` ni `projects`
   aunque tenga cookie válida, y el pedido ni siquiera sale hacia la API.

**Solo lectura por construcción.** El `case 'portal'` rechaza cualquier verbo distinto de `GET`
antes de mirar los segmentos, así que no depende de acordarse de no escribir un `case`.

**Un recurso ajeno responde 404, nunca 403.** Un 403 confirma que la factura existe y con qué id.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Acceso | `/` | Un solo paso: los contactos no tienen 2FA |
| Verificación | `/portal/verificar` | Para quien no verificó su correo |
| Inicio | `/portal` | Resumen de proyectos, novedades y accesos |
| Proyectos | `/portal/proyectos` · `/[id]` | Listado y detalle con pestañas dinámicas |
| Facturas | `/portal/facturas` · `/[id]` | Con líneas, pagos y saldo |
| Presupuestos | `/portal/presupuestos` · `/[id]` | Igual que facturas, otro catálogo de estados |
| Propuestas | `/portal/propuestas` · `/[id]` | Incluye las del prospecto de origen |
| Contratos | `/portal/contratos` · `/[id]` | Solo los visibles al cliente |
| Suscripciones | `/portal/suscripciones` | Solo el contacto primario |
| Soporte | `/portal/soporte` · `/[id]` | Hilo del ticket, sin responder |
| Archivos | `/portal/archivos` | Los del perfil del cliente |
| Anuncios | `/portal/anuncios` | Los dirigidos a clientes |
| Ayuda | `/portal/ayuda` · `/[slug]` | Base de conocimiento pública |
| Perfil | `/portal/perfil` | Datos del contacto y de la empresa |

## Endpoints que consume

Todos `GET` bajo `/portal/`, salvo el acceso.

| Ruta | Devuelve |
|---|---|
| `POST /auth/portal/login` | Par de tokens de contacto más sus datos |
| `/portal/me` | El contacto, sus permisos y sus secciones habilitadas |
| `/portal/company` | La empresa; facturación y envío solo si es primario |
| `/portal/lookups` | Subconjunto de catálogos: sin roles, sin equipo, sin departamentos |
| `/portal/{invoices,estimates,proposals,contracts,subscriptions,tickets}[/{id}]` | Ventas y soporte |
| `/portal/projects[/{id}]` | El detalle trae `tabs` con las pestañas habilitadas |
| `/portal/projects/{id}/{tasks,milestones,files,invoices,estimates,tickets}` | Pestañas |
| `/portal/{announcements,files,kb}` · `/portal/kb/{slug}` | Contenido |
| `/api/v1/files/{tipo}/{id}/download` | Descarga; sirve a los dos sujetos |

## Reglas de visibilidad que no son obvias

Todas verificadas contra `application/controllers/Clients.php` y comprobadas por
`modules/api/herramientas/comparar-portal.php`, que corre las consultas del portal viejo de verdad
y contrasta conjuntos de ids para cada contacto activo.

- Los estados **borrador** son distintos por documento: factura `6`, presupuesto `1`, propuesta `6`.
- Las **propuestas** incluyen las que quedaron atadas al prospecto del que se convirtió el cliente
  (`tblclients.leadid`).
- Las **suscripciones** tienen dos puertas y ninguna es un permiso de contacto: la opción global del
  portal y ser el contacto primario.
- Un contacto **no primario** ve solo sus propios tickets cuando `only_show_contact_tickets` está
  encendida.
- Una **tarea** visible dentro de un hito oculto no se muestra: son dos condiciones, no una.
- Las **pestañas** de un proyecto piden `view_*` **y** `available_features`; las de venta suman el
  permiso del contacto.

### Diferencia deliberada con el portal viejo

`Clients.php:688-690` concatena el filtro de borrador sin paréntesis, así que por precedencia de SQL
solo aplica a la rama del prospecto y el portal termina mostrándole al cliente sus propuestas en
borrador. Acá aplica a las dos ramas. Es un bug del portal, no una regla, y queda anotado porque el
comparador lo marcaría como divergencia.

## Qué NO hace

Ninguna escritura: crear o editar tareas, subir archivos, abrir discusiones, comentar, cambiar el
estado de un ticket, pagar o firmar. Todo eso sigue en el portal de Perfex.

Tampoco están todavía las pestañas de discusiones, actividad, timesheets y gantt de un proyecto: la
API las habilita en `tabs` pero el frontend las ignora en silencio, porque una pestaña que no lleva
a ningún lado es peor que ninguna.
