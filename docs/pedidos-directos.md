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
| Rol **superadmin** con acceso a todo; las pantallas de administración dejan de colgar de `is_admin` | ✅ `main` (`86f2749`) | ✅ `main` (`8770bb1`) | Era urgente y de seguridad: la compuerta de "Avisos por correo" y "Acceso con Google" era `is_admin` de Perfex, marcada en demasiado staff. Ahora la compuerta vive en el back —las rutas de configuración exigen el rol— y el menú sólo lo acompaña. La migración `0080` marcó una sola cuenta y la `0090` sumó a Javier, Samanta y Vicente |
| Un superadmin reparte y retira administrador y superadministrador | ✅ `main` (`f154e10`) | ✅ `main` (`4d802ad`) | Diálogo "Roles" en la ficha de Equipo, visible sólo para quien ya es superadministrador. Quitárselo a otro está permitido a propósito; lo que se frena es quitárselo uno mismo y quedarse sin ninguno activo, guard que ahora cubre también la baja y el borrado. En el alta se rechaza: `staff_model->add()` no conoce la columna |
| Detalle de la tarea como modal centrado, no como cajón lateral | — | ✅ `main` (`03b9b8a`) | El cajón es angosto y la descripción no se lee. `CajonTarea.tsx` sobre `superposiciones/Cajon.tsx` pasa a `superposiciones/Dialogo.tsx`, conservando el estado en la URL (`?tarea={id}`), y `PanelTareas.tsx:265` queda consistente |
| En el Inicio, las tareas de "Mi trabajo" cliqueables | — | ✅ `main` (`03b9b8a`) | Hoy los títulos bajo "VENCIDOS" son texto muerto. Abren la tarea con el mismo `?tarea={id}` (`app/(panel)/inicio/page.tsx:157`) |
| Ficha del colaborador: sus tareas, resumen, horas trabajadas, archivos e historial de cambios | ✅ `main` (`1b5c872`) | ✅ `main` (`18503e7`) | Hay base: `componentes/equipo/FichaPersona.tsx` y `PanelTrabajoPersona.tsx`. Reusa `PanelTiempos`/`GraficoHoras` (horas), `PanelActividad` (log), `PanelArchivos`/`ArbolDrive` (archivos). Duda abierta: los archivos cuelgan de tarea, proyecto y cliente, no de la persona |
| En el listado general, círculo con la foto en vez del nombre del asignado | — | ✅ `main` (`29d60a4`) | Los nombres se cortan con "…" cuando hay varios. Grupo de avatares con "+N", nombre accesible por tooltip y lector de pantalla, e iniciales cuando no hay foto. `columnas-tareas.tsx` + `presentadores/Avatar.tsx` |
| Presets de filtros también en tablas y tarjetas de proyecto | ✅ `main` (`9b1a181`/`2b9f430`) | ✅ `main` (`b7dbd0c`/`f3feff1`) | Segunda vuelta sobre los presets: `PresetsFiltro.tsx` lo consume desde `TablaRecurso.tsx`, `TableroFiltrable.tsx`, `TarjetasProyectos.tsx` y `PanelTiempos.tsx`. Back: filtros en el listado de hitos y presets para más vistas |

## Pedidos nuevos (04/09/2026)

Tanda que el usuario pidió por chat el 04/09. Los ocho que no son de IA se construyeron el mismo
día, uno por rama, con `feature-aislada`. Los tres de IA los tomó otra sesión en paralelo.

| Ítem | Back | Front | Notas |
|---|---|---|---|
| Iteraciones en la tarea (contador visible y marcable) | ✅ `main` (`2cc2e14`) | ✅ `main` (`1dea4b8`) | La tabla `tblwiwo_task_iterations` ya existía y sólo la escribía el panel de Perfex: ahora la API expone `GET|POST /tasks/{id}/iterations` y el detalle muestra la lista con motivo y autor. Permisos: los mismos que para **ver** la tarea, no `tasks.edit` — es el criterio del panel |
| Alertas de tareas atrasadas (desviación) | ✅ `main` (`d5a1877`) | ✅ `main` (`5196cd5`) | `desviacion_dias` es campo derivado del Proceso; el atraso se muestra como tipografía, no como insignia (la píldora ya la ocupan estado y prioridad) |
| ETA: tiempo estimado, estimación y variación | ✅ `main` (`d5a1877`/`76986ef`) | ✅ `main` (`5196cd5`) | El ETA sale del **tipo de Proceso**, con días configurables por Espacio en `tblwiwo_eta_por_tipo`. Reusa `tbltask_types` y `tblproject_task_types`, que ya existían. `76986ef` abrió `task_type` a la escritura: sin eso el ETA nunca se calculaba |
| Panel del head del Proyecto: configurar SLA | ✅ `main` (`d5a1877`) | ✅ `main` (`5196cd5`) | Pestaña "Configuración" del Espacio, visible al creador (`addedfrom`), Directores, admin y superadmin, con las tres capas de compuerta. El SLA compara el cierre real contra la fecha comprometida |
| Panel del head del Proyecto: configurar aprobación | ✅ `main` (`d5a1877`) | ✅ `main` (`5196cd5`) | La aprobación la da **el cliente desde el portal, antes de empezar**, y recién ahí arranca el reloj del ETA. Interruptor por Espacio en `tblproject_settings` |
| Cliente: correo | ✅ `main` (`f0dea90`) | ✅ `main` (`cbcf721`) | **Sólo el motor, apagado**: cola, interruptor `wiwo_correo_cliente_modo` en `apagado` y un único productor (el enlace de acceso al portal). No hay consumidor: nadie vacía la cola |
| Crear proyecto desde una configuración: hitos y tareas predefinidos, con personas | ✅ `main` (`bd32727`) | ✅ `main` (`d6e3b3e`) | Plantillas propias por Director. Los items guardan posiciones relativas, así que al crear con otra duración esperada las fechas se escalan solas; la pantalla muestra la vista previa antes de confirmar |
| Link para compartir una tarea: interno muestra todo, externo sólo lectura | ✅ `main` (`2e3ed35`) | ✅ `main` (`74a1cbe`) | `/tarea/[token]`, anónimo y sin login. La proyección pública es una **lista blanca explícita de nueve claves**, nunca el objeto del staff podado. Generar uno nuevo invalida el anterior |
| Tarjetas con orbe: resumen por IA barata, una vez al día | — | — | **Otra sesión**: fuera del alcance de esta tanda |
| Chat con IA dentro del proyecto para preguntar sobre el board | — | — | **Otra sesión** |
| Escribir una tarea con IA | — | — | **Otra sesión** |

### Lo que quedó fuera, a propósito

- **Comentarios en el enlace público de una tarea.** El core no tiene marca de "comentario público"
  (el portal ni siquiera muestra comentarios de tareas) e inventarla exigía una columna en tabla de
  Perfex —deuda de merge, prohibida— o una tabla y un endpoint de marcado fuera de alcance.
  Publicarlos todos era la fuga más grande posible. Documentado en el contrato cómo sumarlos.
- **Reutilizar un tipo de Proceso de otro Espacio desde la interfaz.** La API lo acepta, pero no hay
  endpoint que liste el catálogo global, así que un selector no tendría de dónde sacar las opciones.
  El alta es por nombre. Se agrega el día que exista `GET /task-types`.

**Leyenda:** ✅ hecho y mergeado · 🔄 en curso · 🟡 hay base aprovechable, falta el pedido · ❌ sin empezar

## Cómo verificar lo hecho

Con `board-api` (contenedor podman, puerto 8091) y `ops-v2` (`pnpm dev`, puerto 3000) levantados,
login en `/colab` con el usuario de prueba local (ver memoria de la cuenta). Rutas relevantes:
`/procesos/tablero` (kanban con filtros y drag&drop), `/equipo` y `/equipo/mi-area` (cargo/área),
`/archivos` y la pestaña de archivos de una Tarea (árbol de Drive, subida y permisos).

De la tanda del 04/09: pestaña **Configuración** de un Proyecto (tipos con ETA y el interruptor de
aprobación), detalle de una Tarea (bloque de ETA/desviación/aprobación, lista de iteraciones, botón
Compartir), `/espacios/plantillas`, `/administracion/correo` (cola nueva, sólo superadmin) y
`/tarea/{token}` **en una ventana sin sesión**.

El camino que prueba el hilo del ETA es uno solo y hay que recorrerlo entero: configurar un tipo con
ETA → pedir aprobación de una Tarea → entrar al portal como contacto → aprobar → volver al panel y
ver que el ETA aparece. Mientras la aprobación está pendiente el ETA es `—` a propósito: el reloj
todavía no arrancó.

Para el árbol de Drive hacen falta las dos constantes de unidad compartida en `app-config.php`:
sin ellas el módulo entero lanza `RuntimeException`.

## Reglas

Mismas del [encargo de brechas](encargo-brechas-del-board-PNDNG.md#reglas-del-encargo): todo lo que
agrega algo nuevo se construye con `feature-aislada` (worktree propio, rama propia, pausa para
revisión, merge). Nada de trabajar directo sobre el clon principal.
