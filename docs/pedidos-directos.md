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

## Pedidos nuevos (07/09/2026)

Tanda que el usuario pidió por chat el 07/09: seis pedidos, casi todos de la ficha de la Tarea y del
kanban. Se repartieron en diez frentes —uno por rama, con `feature-aislada`— porque tres de ellos
compartían archivos y otros tres destaparon una pieza de API que faltaba. Ninguno era pérdida de
datos: los adjuntos, los links y las áreas seguían en la base, y lo que faltaba era la pantalla.

| Ítem | Back | Front | Notas |
|---|---|---|---|
| Los adjuntos de la Tarea vuelven a verse | ✅ ya existía | ✅ `main` (`d9c6b79`) | `DetalleTarea.tsx` había reemplazado la sección "Archivos" por el árbol de Drive, que es **otro almacén** y está vacío para toda Tarea anterior al backfill: el contador decía 9 y abajo no se veía nada. El nuevo `PanelAdjuntos` lista, sube, descarga y borra, **debajo** del árbol, que sigue siendo el camino a incentivar. Ahí aparecen también los links viejos de Drive, que son filas de `tblfiles` con `external='gdrive'` |
| Área de la compañía y Link de Drive editables | ✅ ya existía (`PATCH /custom-fields/values`) | ✅ `main` (`8167cf5`) | Renderizador **genérico** de los diez tipos de campo personalizado (`CamposPersonalizados.tsx` + `dominio/campos-personalizados.ts`), no un campo a mano: la base tiene 29 definiciones. Nace acá `esquemaDeCamposPersonalizados()`, que `convenciones.md` nombraba desde el día uno y no existía. Trampa real: los 513 "Link de Drive" están guardados como HTML (`<a href=…>`) porque los escribió `custom_fields_hyperlink()` del panel viejo, y la API rechaza ese marcado al escribir: se desenvuelven al leer |
| Los mismos campos, visibles en la ficha sin abrir el editor | ✅ `main` (`6a7fd02`) | ✅ `main` (`2057579`) | `RecursoProcesos::ver()` validaba el `include` y después lo tiraba fijando `['description']`: una línea. Reusa `CamposPersonalizados::paraLote()`, así ficha y listado no pueden divergir (verificado comparando los dos JSON en 41 Tareas). De paso murió el rodeo por el que la edición leía los valores con un `PATCH values: {}` |
| Buscar personas aunque no estén en el Espacio | ✅ `main` (`987e94f`) | ✅ `main` (`2ddadd8`, `ee65bf1`) | El síntoma que reportó el usuario —"a un usuario le sale una persona y a otro no"— no era del buscador: cada pantalla leía de una fuente distinta y `GET /staff` exige `staff.view`, que tienen 19 de 184 personas. Nace `GET /staff/asignables`, sin ese permiso y con proyección mínima (**no** se aflojó `/staff`: expone correo, teléfono y tarifa). Front: fuente única en `datos/asignables.ts`, memoizada por pestaña. Verificado con dos cuentas: 185 personas en ambas, listas idénticas. "Eso lo terminará agregando" ya lo hacía el back (`asegurarMiembrosDelEspacio()`) |
| En el kanban, "+" para sumar tareas a un hito | ✅ ya existía | ✅ `main` (`00771f1`) | El "+" abre un diálogo con los dos caminos: crear una Tarea nueva ya colgada del hito, o sumar una de las que no tienen hito. La columna sintética "Sin categorizar" no lo lleva: no es un hito |
| En el kanban, abrir el modal de la tarea | — | ✅ `main` (`00771f1`) | El modal existía y era único, pero solo lo montaba `PanelTareas`. Ahora también `vistas.tsx` y `PanelHitos`; **no** en `TableroFiltrable`, que daría dos diálogos con el mismo `?tarea={id}`. Se enlaza solo el título: un `<a>` envolviendo la tarjeta compite con el `dragstart` |
| Elegir la fecha en que se completó una Tarea | ✅ `main` (`987e94f`) | ✅ `main` (`d8d38ca`) | `completed_at` en `PATCH /tasks/{id}` → `datefinished`, con tres rechazos (`no_completado`, `futura`, `anterior_al_inicio`). `mark-complete` sigue fechando con la hora de ahora: corregir es un segundo paso explícito, así ni las masivas ni el arrastre heredan una fecha inventada. Si no se toca la fecha, un clic sigue siendo una sola escritura. Al día elegido se le pone **mediodía**, no 23:59: con el desfase de reloj del contenedor el cierre se corría un día entero |
| Tareas sin fecha de entrega | ✅ ya existía | ✅ `main` (`1665bd6`, `efccf17`) | No había bloqueo: crear sin vencimiento ya funcionaba en la API y en los dos formularios. El defecto era de lectura —el plazo vacío se leía con el mismo guion que un dato faltante— y se arregló en el presentador `Fecha` (`comoVencimiento`), que cubre las siete superficies que muestran plazos |

### Lo que quedó fuera, a propósito

- **Acciones masivas en el tablero.** Siguen solo en la vista de tabla: `AccionesMasivasTareas` depende
  de `ProveedorSeleccion` y de la selección por fila de `columnas-tareas.tsx`, y el tablero no tiene
  casillas. Es trabajo propio del motor de tablero, no un ajuste barato.
- **`AccionesPersona.tsx:87` sigue leyendo `GET /staff`.** Es el selector de heredero al dar de baja a
  alguien, dentro de `/equipo`, pantalla que ya exige `staff.view` para entrar: ahí `/staff` es la
  fuente correcta. Hay una prueba de regresión que barre `src/` y falla si alguna otra pantalla vuelve
  a pedir `GET /staff` con query.

## Pedidos nuevos (09/09/2026)

Tanda de siete pedidos que el usuario dio por chat el 09/09. Se repartieron en **siete frentes en
paralelo**, uno por rama con `feature-aislada`, y el merge lo hizo el coordinador en orden para que
no se pisaran en `controllers/V1.php` ni en `datos/recursos.ts`. La bitácora completa —reporte por
frente, con lo verificado y lo que no— quedó en el scratchpad de la sesión.

| Ítem | Back | Front | Notas |
|---|---|---|---|
| Permisos en siete escalones (`usuario < focal < lider < head < gerente < admin < superadmin`) | ✅ `main` (`99fc90d`) | ✅ `main` (`7529716`) | Migración `0270`, `tblwiwo_nivel_persona` + mapa `wiwo_permisos_niveles_por_rol` por rol de Perfex. **Cero regresión por construcción**: los escalones nuevos no reparten capacidades propias y `head` hereda el piso de lectura que tenía `admin`, así que el piso acumulado de cada persona sale byte a byte igual al de antes (probado en 9 perfiles). `admin` y `superadmin` **no** se asignan por la tabla nueva: sería una segunda puerta que se saltea los guards de `Escritura/Staff` |
| Focal por cliente, con visibilidad de todas sus áreas y Espacios | ✅ `main` (`23d0baa`) | ✅ `main` (`44a31ec`) | Migración `0300`, `tblwiwo_focales`. Nombrar focal **asegura** la fila en `tblcustomer_admins`, de donde ya sale la visibilidad; `otorgo_asignacion` recuerda si la creamos, para que revocar no le saque el cliente a quien ya estaba en la pestaña Equipo. Las áreas se **derivan** del campo personalizado `Area de la compañía` de las tareas (2.440 filas con dato), no de una tabla nueva |
| Ver que un cliente existe sin poder entrar a su data | ✅ `main` (`23d0baa`) | ✅ `main` (`44a31ec`) | `GET /clients/minimos`, sin `customers.view`, cuatro claves y ninguna más. Usa `company` y **no** `nombreVisible()`, que cae al nombre del contacto primario y habría filtrado el nombre de una persona por una ruta sin permiso |
| Semáforo con score de 1 a 100, solo para directores, gerentes y focals | ✅ `main` (`53a253d`) | ✅ `main` (`b68ba6a`, montado en `80a2d7f`) | Migración `0280`, foto diaria en `tblapi_score_cliente`. Tres señales —plazos 45, carga 30, vencimientos 25— y el promedio se hace **solo sobre las que tienen universo**, así un cliente con todo cerrado a tiempo da 100 y no queda castigado por no tener trabajo abierto. `lider` y `usuario` reciben 403; el focal, solo sus clientes, y sin la tabla de focales ve **cero** (falla cerrada). **Umbrales sin calibrar**: ver abajo |
| Cola de correo editable y compositor centralizado del admin | ✅ `main` (`c08e248`) | ✅ `main` (`2d76de5`) | POST/PATCH/DELETE sobre `client-mail-queue`, superadmin. Solo se toca lo `pendiente`: editar o descartar una fila `enviado` responde 409, porque es la constancia de un correo que salió. El token en claro sigue sin poder entrar en `payload_json`, y el filtro vive en `encolar()` —el único lugar que escribe esa columna— para que el invariante no dependa de que nadie se olvide |
| Alertas por correo: consumidor de la cola y digest diario de pendientes y atrasos | ✅ `main` (`bee3601`) | — | 11 archivos, todos en `wiwo_core`, **cero parches al core**. El digest y el aviso por tarea son mutuamente excluyentes **por construcción** (un `if/return`, no dos opciones que alguien pueda prender a la vez). Los dos motores se mergearon **apagados**. Ojo: el consumidor hoy no despacha nada — ver abajo |
| Leer la casilla corporativa: brief y puntaje por IA, sin guardar el original | ✅ `main` (`b5c34c3`) | ✅ `main` (`70f40d3`) | Migración `0290`. Reusa el cliente IMAP que ya existía. **El original no se borra al leer**: se mueve a `Procesados` y la purga es un interruptor aparte, apagado, con piso de 7 días. El cuerpo pasa por `Contexto::limpiar()` antes del prompt, y está probado con un correo que intenta dictar su propia ficha: el modelo no obedeció |
| Leer los Meeting Papers como contexto de WiBot | ✅ `main` (`4df266f`, cableado en `0f95706`) | — | Herramienta `actas_del_espacio`. El markdown se **deriva del HTML al leer**, sin columna nueva: una copia guardada se desincroniza el día que alguien edite el acta y WiBot citaría una versión que ya nadie ve. Un acta real pasa de 1.403 a 965 caracteres |

### Integración con wiwo.center

**Fuera de alcance por decisión del usuario en esta tanda.** El soporte sigue viviendo en
[wiwo.center](https://wiwo.center) y Ops no lo consume.

### Lo que quedó abierto, y es decisión de negocio

- **Los umbrales del semáforo no están calibrados.** Con el dump de producción, **76 de los 79
  clientes con datos caen en rojo**. No es un error de la fórmula —1.099 de 1.848 Procesos cerrados
  se cerraron tarde y 345 de 628 abiertos ya están vencidos—, pero con esa realidad un semáforo de
  75/50 no discrimina nada. `UMBRAL_VERDE` y `UMBRAL_AMARILLO` son dos constantes de una línea en
  `Salud/ScoreCliente.php`.
- **El consumidor de la cola no despacha nada todavía.** `enlace_acceso_portal` quedó bloqueada a
  propósito y es la única plantilla que alguien encola. El motivo: el consumidor tendría que emitir
  su propio enlace, y `Tokens::emitirEnlace()` revoca los anteriores del mismo contacto, así que el
  enlace que el staff ya copió y mandó a mano dejaría de servir. Los tres caminos son: que el correo
  mande y ese enlace muera, que `emitirEnlace()` deje de revocar, o que la cola guarde con qué
  reusar el enlace vivo.
- **Nadie tiene el escalón `focal` todavía.** Ser focal de un cliente (la relación) y estar en el
  escalón `focal` (la escalera) son dos cosas: la primera se reparte en la pestaña Focales del
  cliente, la segunda en el diálogo "Escalón" de la ficha de la persona. Sin la segunda, un focal no
  ve el semáforo.
- **La casilla entrante no tiene credenciales.** Falta sembrar host, usuario y
  `CORREO_ENTRANTE_PASSWORD` en el `.env`, y **este servidor no tiene la extensión `imap` de PHP**:
  la lectura real nunca se pudo probar.

### Lo que quedó fuera, a propósito

- **Redirección de los correos de la corporación a la casilla.** Es trabajo de cPanel/Workspace, no
  de código: no se tocó.
- **El score de los correos entrantes no alimenta el semáforo.** `GET /correos-entrantes/by-client`
  expone el agregado y nadie lo consume: cómo se pondera un reclamo dentro del score es una decisión
  que no estaba tomada.
- **Sin verificación por HTTP contra el board.** Ningún frente pudo levantar la API real: no hay
  contenedor arriba y `levantar-board-podman.sh` empieza con `podman rm -f board-db`, que habría
  borrado la base que estaban usando los otros agentes. Lo que sí corrió —y contra el dump de
  producción real— fue el cálculo del score, las migraciones y la lógica de escritura.

## Cómo verificar lo hecho

Con `board-api` (contenedor podman, puerto 8091) y `ops-v2` (`pnpm dev`, puerto 3000) levantados,
login en `/colab` con el usuario de prueba local (ver memoria de la cuenta). Rutas relevantes:
`/procesos/tablero` (kanban con filtros y drag&drop), `/equipo` y `/equipo/mi-area` (cargo/área),
`/archivos` y la pestaña de archivos de una Tarea (árbol de Drive, subida y permisos).

De la tanda del 07/09: ficha de una Tarea (adjuntos debajo del árbol de Drive, Área de la compañía y
Link de Drive en lectura y en el editor, bloque de cierre con "Corregir"), pestaña **Hitos** en vista
tablero (el "+" de cada columna), `/procesos/tablero` y el tablero del Espacio (la tarjeta abre el
modal), y el selector de asignados **mirado con dos cuentas, una sin `staff.view`**: tienen que ver la
misma gente. Para los adjuntos históricos, ojo: en la base local no está el binario y la descarga da
404 de la propia API; en producción sí están.

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
