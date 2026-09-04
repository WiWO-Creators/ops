# Pedidos directos del usuario

Lista corta de pedidos que el usuario fue dando por chat, fuera del encargo de
[brechas del board](encargo-brechas-del-board-PNDNG.md). A diferencia de ese documento, esta lista
no se cierra: se va agregando a medida que aparecen pedidos nuevos, y cada fila se actualiza cuando
cambia de estado. Back = `wiwo-board`. Front = `ops-v2`.

## Estado (04/09/2026)

| Ítem | Back | Front | Notas |
|---|---|---|---|
| Aplicar filtros al tablero kanban | ✅ `main` | ✅ `main` | |
| Guardar selección de filtros (presets) | ✅ `main` | ✅ `main` | |
| Imágenes de clientes y proyectos | ✅ `main` | ✅ `main` | |
| Renombrar "Notas" a "Meeting Paper" | ✅ `main` | ✅ `main` | |
| Tabla de tareas con orden automático (pendientes y recientes primero) | ✅ `main` | ✅ `main` | |
| Asignar área y cargo a cada persona (directores derivan) | ✅ `main` (`4d53671`/`ef1e814`) | ✅ `main` (`8c65fe1`) | Back: cargo Director + catálogo de áreas + auto-follower del director en las tareas de su gente. Front: columnas/filtros en Equipo, ficha de persona, pantalla `/equipo/mi-area` |
| Mover tareas en el tablero kanban (drag&drop) | ✅ `main` | ✅ `main` | Ya existía en ambos repos cuando se revisó. De paso se encontró y corrigió un bug real: reordenar dentro de la misma columna no exigía permiso (`51b1993`) |
| Borrar funciones de venta y contrato | ✅ `main` (`b854567`) | ✅ `main` (`be6dd27`) | Front lo había sacado antes; back se emparejó borrando `Escritura/Cotizacion.php`, `RecursoContratos.php`, `RecursoVentas.php` (recortado, no borrado — ver commit), `comparar-ventas.php`, `comparar-contratos.php`, etc. |
| Proyectos en Drive: carpeta por Cliente > Proyecto > Tarea | ✅ `main` (`67ff192`) | ✅ `main` (`0e537b5`, `9f35aa3`) | Carpeta real en unidad compartida, con permisos editor/comentador sincronizados con encargados y revisores y editables a mano. Back: `modules/wiwo_core/drive_hierarchy.php`, `modules/api/Escritura/Drive.php`, migración `131_version_131.php`. Front: `ArbolDrive.tsx`, subida/borrado/permisos (`06638f1`), árbol dentro de la Tarea (`ea9dbc2`) |
| Patente de proyecto (código `XXX-123` único, usado como nombre de carpeta en Drive) | ✅ `main` (`67ff192`) | ✅ `main` | Formato `LETRAS-NNN`, en `modules/wiwo_core/patentes.php`. Front la muestra desde `recursos.ts` y el árbol de Drive |
| Avisar a quién no se le pudo dar acceso a Drive (sin cuenta de Google) | ✅ `main` (`dfdacf4`) | ✅ `main` (`3c1c313`) | El reconciliador guarda y reintenta los correos sin cuenta de Google (`e40ee0f`); la API expone el estado del permiso y ya no tira 500 al compartir (`6310b51`); la página lo muestra (`d0298e9`) |
| Entrar con Google en `/colab` (staff) | ✅ `main` (`2b03f01`) | ✅ `main` (`2744af2`) | `POST /auth/google` + dominios permitidos (`21f6f3a`); pantalla de administración para configurar el login (`d92e161`) y Google como puerta principal con la contraseña plegada (`b754eed`). Consent screen del proyecto va en **External**: son tres dominios de tres organizaciones |
| Portal del cliente con enlace de acceso de un solo uso | ✅ `main` (`513eae2`) | ✅ `main` (`1d1d152`) | El staff genera el enlace y el contacto elige su contraseña (`624edc5`); sin correos y sin módulo de ventas. Documentado en el commit `90c5c4d` |
| Teletrabajo con LiveKit propio | ✅ `main` | ✅ `main` (`07bf172`) | `livekit.wiwo.me` detrás de Apache/cPanel, proxy de Cloudflare en gris. El front explica por qué no se prendió el micrófono o la cámara |
| Rol **superadmin** con acceso a todo; las pantallas de administración dejan de colgar de `is_admin` | ✅ `main` (`86f2749`) | ✅ `main` (`8770bb1`) | **Urgente, es de seguridad.** Hoy la compuerta de "Avisos por correo" y "Acceso con Google" es `is_admin` de Perfex (`layout.tsx:114-119` y las rutas de `modules/api/`), y esa bandera está marcada en demasiado staff. La compuerta real tiene que quedar en el back, no sólo escondiendo el enlace |
| Detalle de la tarea como modal centrado, no como cajón lateral | — | ✅ `main` (`03b9b8a`) | El cajón es angosto y la descripción no se lee. `CajonTarea.tsx` sobre `superposiciones/Cajon.tsx` pasa a `superposiciones/Dialogo.tsx`, conservando el estado en la URL (`?tarea={id}`), y `PanelTareas.tsx:265` queda consistente |
| En el Inicio, las tareas de "Mi trabajo" cliqueables | — | ✅ `main` (`03b9b8a`) | Hoy los títulos bajo "VENCIDOS" son texto muerto. Abren la tarea con el mismo `?tarea={id}` (`app/(panel)/inicio/page.tsx:157`) |
| Ficha del colaborador: sus tareas, resumen, horas trabajadas, archivos e historial de cambios | ✅ `main` (`1b5c872`) | ✅ `main` (`18503e7`) | Hay base: `componentes/equipo/FichaPersona.tsx` y `PanelTrabajoPersona.tsx`. Reusa `PanelTiempos`/`GraficoHoras` (horas), `PanelActividad` (log), `PanelArchivos`/`ArbolDrive` (archivos). Duda abierta: los archivos cuelgan de tarea, proyecto y cliente, no de la persona |
| En el listado general, círculo con la foto en vez del nombre del asignado | — | ✅ `main` (`29d60a4`) | Los nombres se cortan con "…" cuando hay varios. Grupo de avatares con "+N", nombre accesible por tooltip y lector de pantalla, e iniciales cuando no hay foto. `columnas-tareas.tsx` + `presentadores/Avatar.tsx` |
| Presets de filtros también en tablas y tarjetas de proyecto | 🔄 en curso | 🔄 en curso | Segunda vuelta sobre los presets. Worktrees vivos `wiwo-board-wt-presets` (`feat/presets-tableros`) y `ops-v2-wt-presets` (`feat/presets-filtros`), otra sesión trabajando: cambios en `TablaRecurso.tsx`, `TablaProyectos.tsx`, `TarjetasProyectos.tsx` y `recursos.ts`, todavía sin commitear |

## Pedidos nuevos (04/09/2026) — sin empezar

Tanda que el usuario pidió por chat el 04/09. Ninguno está construido; la columna **Ya existe**
anota lo que el repo aporta hoy, para no arrancar de cero donde ya hay una base.

| Ítem | Back | Front | Ya existe |
|---|---|---|---|
| Iteraciones en la tarea (contador visible y marcable) | 🟡 base | 🟡 base | Back: tabla `tblwiwo_task_iterations` y panel de iteraciones en el modal de tarea (`modules/wiwo_core/wiwo_core.php`). API: `counts.iterations` en `RecursoProcesos.php:538`. Front: columna "Iteraciones" en `columnas-tareas.tsx:250`. Falta definir qué agrega la casilla del pedido |
| Alertas de tareas atrasadas (desviación) | 🟡 base | ❌ sin empezar | Back: `modules/wiwo_core/deadline_reminders.php` manda tres avisos por correo (temprano, 24 horas y el día). Falta la desviación como dato y su alerta dentro de ops-v2 |
| ETA: tiempo estimado de espera, estimación y variación | ❌ sin empezar | ❌ sin empezar | Perfex guarda `tbltasks.startdate`/`duedate`; no hay estimación ni variación calculada |
| Panel del head del Proyecto: configurar SLA | ❌ sin empezar | ❌ sin empezar | |
| Panel del head del Proyecto: configurar aprobación | ❌ sin empezar | ❌ sin empezar | |
| Cliente: correo | ❌ sin empezar | ❌ sin empezar | Hoy no se manda ningún correo al cliente: el portal entra por enlace de un solo uso, sin correos |
| Crear proyecto desde una configuración: hitos y tareas predefinidos, con personas | ❌ sin empezar | ❌ sin empezar | Plantilla de proyecto: hitos, tareas y responsables ya asignados al crear |
| Tarjetas con orbe: resumen por IA barata (tipo DeepSeek), una vez al día, en proyectos, tareas y clientes | ❌ sin empezar | 🟡 base | Front: el orbe ya existe con siete estados (`src/componentes/estado/Orbe.tsx`, `src/estilos/thinking-orb.css`). Falta el resumen: proveedor de IA, el trabajo diario que lo genera y dónde se guarda |
| Chat con IA dentro del proyecto para preguntar sobre el board | ❌ sin empezar | ❌ sin empezar | |
| Link para compartir una tarea: interno muestra todo, externo sólo lectura | ❌ sin empezar | ❌ sin empezar | Base parecida: el enlace de un solo uso del portal del cliente (`624edc5`) |
| Escribir una tarea con IA | ❌ sin empezar | ❌ sin empezar | |

**Leyenda:** ✅ hecho y mergeado · 🔄 en curso · 🟡 hay base aprovechable, falta el pedido · ❌ sin empezar

## Cómo verificar lo hecho

Con `board-api` (contenedor podman, puerto 8091) y `ops-v2` (`pnpm dev`, puerto 3000) levantados,
login en `/colab` con el usuario de prueba local (ver memoria de la cuenta). Rutas relevantes:
`/procesos/tablero` (kanban con filtros y drag&drop), `/equipo` y `/equipo/mi-area` (cargo/área),
`/archivos` y la pestaña de archivos de una Tarea (árbol de Drive, subida y permisos).

Para el árbol de Drive hacen falta las dos constantes de unidad compartida en `app-config.php`:
sin ellas el módulo entero lanza `RuntimeException`.

## Reglas

Mismas del [encargo de brechas](encargo-brechas-del-board-PNDNG.md#reglas-del-encargo): todo lo que
agrega algo nuevo se construye con `feature-aislada` (worktree propio, rama propia, pausa para
revisión, merge). Nada de trabajar directo sobre el clon principal.
