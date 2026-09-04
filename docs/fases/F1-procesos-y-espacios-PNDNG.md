# F1 — Procesos y Espacios

El trabajo diario. Al cerrar F1, una persona del equipo puede pasar una jornada completa en `ops-v2`
sin volver al panel viejo.

Es la fase que decide si el proyecto sirve. Todo lo demás es alcance.

## Qué se construye

`[x]` construido y en `main`. `[ ]` pendiente.

### Estructura

- `[x]` El armazón del panel: barra lateral, área de contenido, detalle en diálogo centrado.
- `[ ]` **Buscador global (⌘K).** No hay componente ni ruta en `src/`. La API sí lo sirve desde que
  se cerró F0: `GET /search` cruza Procesos, Espacios, Clientes y Personas.
- `[ ]` Cronómetro activo visible en toda la navegación: hoy `CronometroAbierto.tsx` vive dentro de
  `/inicio` y no se ve desde ninguna otra pantalla.
- `[ ]` Enlace "Abrir en el panel clásico". No hay una sola aparición de `board.wiwo.me` en `src/`.

### Procesos (tareas)

- `[x]` **Lista** con la tabla genérica: filtros, orden, paginación, selector de columnas, presets.
- `[x]` **Tablero** con arrastre, columnas desde `lookups`, paginación por columna.
- `[ ]` **Detalle editable**: estado, prioridad, asignados, seguidores, fechas, etiquetas, campos
  personalizados, comentarios, lista de verificación, tiempo, adjuntos. Hoy `DetalleTarea.tsx` es un
  diálogo de lectura con dos contadores. **Es el trabajo más grande que queda de la fase**, y la API
  ya sirve todo: escritura de comentarios, de checklist, de campos personalizados, subida de
  adjuntos y `PATCH /tasks/{id}` con `followers`.
- `[x]` **Creación rápida**: sólo lo obligatorio.
- `[x]` Acciones: marcar completado, reabrir, arrancar y detener cronómetro, acciones masivas.

### Espacios (proyectos)

- `[x]` Lista con la tabla genérica.
- `[x]` Detalle con sus Procesos, Hitos y miembros — más gantt, tiempos, discusiones, notas,
  archivos y actividad, que no estaban en el plan.
- `[x]` Tablero de Hitos.

### Inicio

- `[x]` "Mis Procesos": lo asignado a quien mira, agrupado por vencimiento, y cada título abre su
  Proceso.

### API (carril A)

`[x]` Terminada, y bastante más allá del alcance de la fase: los recursos `staff`, `lookups`,
`clients`, `projects`, `tasks` y `files` con lectura y escritura, las acciones de tarea, los `PATCH`
parciales, la subida de adjuntos y los subrecursos del Proceso.

## Qué se reusa

| De dónde | Qué |
|---|---|
| `wiwo-board/application/views/admin/tables/tasks.php` | Columnas, joins y permisos de la tabla de Procesos |
| `wiwo-board/application/views/admin/tables/projects.php` | Ídem para Espacios |
| `wiwo-board/assets/js/main.js:4312` (`init_kanban`) | Especificación funcional del Tablero: carga por columna, columnas conectables, altura |
| `wiwo-board/application/views/admin/tasks/view_task_template.php` | Inventario de lo que muestra el detalle de un Proceso |
| Modelos de Perfex (`Tasks_model`, `Projects_model`) | Toda la lógica de negocio, llamada desde la API |

## Decisiones que se toman acá

**Los formularios gigantes no se portan como pantalla-formulario.** `view_task_template.php` son 78 KB
de campos. En su lugar:

1. **Crear = mínimo.** El diálogo pide lo obligatorio. El resto se completa en el detalle — que es lo
   que la gente ya hace hoy.
2. **Detalle = edición en sitio, bloque a bloque**, cada uno con su `PATCH` parcial. Nunca un envío de
   200 campos.

**Optimismo sólo donde se siente**: mover una tarjeta, marcar completado, arrancar el cronómetro,
cambiar de estado. Un formulario de creación no necesita optimismo; necesita un botón deshabilitado.

**El estado de la tabla vive en la URL.** Una vista filtrada es un enlace que se puede pegar en un
chat y reproduce exactamente lo que el otro tiene que ver. El panel actual no da eso, y es una de las
mejoras que más se nota sin ser una función nueva.

## Criterios de aceptación

**El criterio real**: una persona del equipo pasa **un día laboral completo** trabajando sólo en
`ops-v2`, sin abrir el panel viejo para su trabajo de Procesos.

Desglosado en pasos verificables — cada uno se confirma además en la base de Perfex, no sólo en
pantalla:

1. `[x]` Crear un Proceso dentro de un Espacio, con asignado, fecha de vencimiento, prioridad y
   etiquetas.
2. `[x]` Moverlo entre columnas del tablero; recargar y comprobar que la posición persiste.
3. `[x]` Arrancar el cronómetro, detenerlo con una nota, y ver el tiempo registrado.
4. `[ ]` Comentar, adjuntar un archivo y descargarlo. **Bloqueado por el detalle**: la API acepta las
   tres cosas, la pantalla no las ofrece. Lo único que ya se sube desde la interfaz son archivos de
   Drive e imágenes de entidad.
5. `[ ]` Completar una lista de verificación y marcar el Proceso como completado. Lo segundo sí; lo
   primero espera al detalle.
6. `[x]` Filtrar la lista y **reproducir la vista pegando la URL**.
7. `[x]` Ver el mismo Proceso en el panel viejo y comprobar que todos los campos coinciden.
8. `[ ]` Un cambio hecho por otra persona en el panel viejo aparece en `ops-v2` sin recargar.
   **No hay tiempo real**: `package.json` no tiene `pusher-js` y nada abre un canal. El único uso de
   sockets en el repo es LiveKit, y es para Teletrabajo.
9. `[x]` Un staff sin permiso de edición no ve las acciones de edición, y la API responde 403.

**Rendimiento**, en el Mac de referencia:

10. `[x]` La tabla con 5.000 filas hace scroll fluido.
11. `[x]` Una columna del tablero con más de 1.000 tarjetas carga por páginas, no entera.
12. ~~`grep -rn "backdrop-filter" src/` sigue sin devolver nada.~~ **Derogado en F0**: `vidrio.css`
    lo usa con la excepción que aceptó `sistema-de-diseno.md`.

**Calidad**

13. `[x]` `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
14. `[x]` `pruebas/tabla.test.js` cubre `construirConsulta()` y `podarPorPermisos()`.
15. `[ ]` `pruebas/campos-personalizados.test.js`: llega con el detalle, que es donde se editan.

**Resumen: tres cosas cierran la fase** — el detalle de Proceso editable (que arrastra los criterios
4, 5 y 15), el buscador ⌘K y el tiempo real.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Modelos de Perfex que leen `$this->input->post()` internamente → escrituras vacías silenciosas | Rellenar `$_POST` en el borde del controlador y llamar al modelo tal cual. Un curl de verificación por endpoint de escritura |
| R2 | Modelos que hacen `redirect()`, `echo` o `die()` | `grep -n "redirect(\|die(\|echo " <Modelo>.php` antes de llamarlo desde la API |
| R3 | `rel_type`/`rel_id` polimórfico: una tarea puede colgar de algo que no es un proyecto | El bloque `project` sólo aparece con `rel_type === "project"`. La interfaz maneja el caso de tarea sin Espacio |
| R4 | Los `id` de estado no siguen el orden de visualización | Ordenar **siempre** por `order`, nunca por `id`. Las columnas salen de `lookups`, no de una constante |
| R5 | Una escritura desde `ops-v2` diverge de la que hace el panel (notificaciones o registro de actividad que no se disparan) | Nunca reimplementar: llamar al modelo. Verificar en el paso 7 de aceptación |
| R6 | El alcance se expande hacia el resto de las 584 vistas | La lista de fuera de alcance del [README](../README.md) se defiende. Lo que no está en F1, no está |

## Deuda consciente

- Editor de texto enriquecido: sigue siendo `AreaTexto` a secas. La descripción de Perfex es HTML;
  escribirla en texto plano degrada lo que ya había.
- Sin vista de calendario ni línea de tiempo en Procesos. El Gantt existe, pero sólo dentro del
  detalle de Espacio.
- Sin gráficos en el Inicio: es una lista, no un tablero de indicadores.
- Preferencias de columnas: no se persisten en ningún lado, ni en `localStorage`. Lo que sí se
  guarda en el servidor son los presets de filtro (`GET|POST /filter-presets`).
- El cronómetro abierto y el enlace "Abrir en el panel clásico" siguen sin estar en el armazón: son
  dos ítems chicos que nadie tomó, no una decisión.

## Lo que se aprendió

_(Se completa al cerrar la fase.)_
