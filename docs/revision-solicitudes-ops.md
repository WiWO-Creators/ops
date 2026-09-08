# Revisión de las cinco solicitudes de WiWO Ops

Los cambios agregan presencia agrupada por cliente, proyecto y tarea; colores y filtros de estados; selección masiva de proyectos; compatibilidad con enlaces heredados y corrección del generador de patentes.

Rama en ambos repositorios: `feat/solicitudes-ops`.

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-solicitudes-ops`.
- API: `/home/wiwo/ops.wiwo/wiwo-board-wt-solicitudes-ops`.

No están integrados en `main` ni desplegados. Para comprobar el flujo completo, el frontend debe apuntar a una instancia de la API con los cambios de esta rama. El mock sirve para revisar presentación y filtros, pero no implementa todas las escrituras ni la auditoría real.

## 1. Estado del proyecto

1. Abrir `/espacios/{id}` con un proyecto en desarrollo.
2. Comprobar insignia roja con pulso suave.
3. Cambiarlo a finalizado: debe verse verde con pulso.
4. Activar la preferencia del sistema de reducir movimiento: el color y texto se mantienen, pero el pulso se detiene.

## 2. Auditoría en vivo

1. Con una cuenta autorizada, abrir `/auditoria`.
2. Con otra cuenta, abrir un cliente, luego uno de sus proyectos y una tarea.
3. Comprobar que aparece bajo cliente → proyecto → tarea, con su nombre y actividad. Una tarea abierta desde el listado o dentro de un proyecto debe mostrar el mismo contexto.
4. Usar teclado, clics, desplazamiento o formularios: la actividad debe renovar la presencia, sin necesidad de guardar cambios. Se envía como máximo un latido de interacción por intervalo configurado; cambios de contexto se notifican al ocurrir.
5. Dejar de interactuar: al vencer la ventana de presencia informada por el servidor, la persona desaparece. Una pestaña oculta no renueva presencia.
6. Abrir una sección general: debe aparecer como actividad general, sin inventar un cliente o proyecto.
7. Comprobar tareas sin proyecto, nombres repetidos y lista vacía. Las ramas se distinguen por identificador, no por nombre.

## 3. Tareas, completados y enlaces

1. Abrir `/procesos`, `/procesos/tablero` y la pestaña Tareas de `/espacios/{id}`.
2. Verificar bordes de estado: completado verde, en proceso amarillo, por iniciar naranjo. El texto del estado sigue visible.
3. Elegir `Cambios`, guardar y recargar: debe persistir. Comprobar también el selector masivo y el arrastre del tablero.
4. Completar una tarea: debe salir de la vista activa. Pulsar `Completados` arriba: debe aparecer allí. Pulsarlo nuevamente vuelve a las tareas activas.
5. Probar filtros adicionales y paginación. El botón conserva otros filtros y vuelve a la primera página. Un filtro explícito de estados también puede incluir completados.
6. Abrir una tarea existente: debe mostrar la sección `Enlaces`, aunque esté vacía. Si no tiene enlaces, indica que se pueden agregar al editar cuando hay permiso.
7. Probar un enlace antiguo y confirmar su destino, incluidos parámetros de URL con `&`. Se admiten enlaces guardados como HTML con saltos de línea y entidades. Los protocolos peligrosos no se convierten en enlaces navegables.

No se contó con el enlace concreto reportado en producción: verificar ese ejemplo antes de aprobar la integración.

## 4. Selección masiva de proyectos

1. Abrir `/espacios` en vista Tabla con permiso de edición.
2. Marcar las casillas del borde izquierdo de dos proyectos. Deben aparecer seleccionados y mostrarse una única barra de acciones.
3. Elegir un estado y pulsar `Aplicar a seleccionados`. Confirmar el resultado y los nuevos estados tras el refresco.
4. Repetir con `Archivar`: deben salir de la vista activa. Usar el filtro de archivados y `Desarchivar` para recuperarlos.
5. Probar la casilla de cabecera: selecciona solo la página visible. Cambiar de página o filtro no debe ejecutar acciones sobre la selección oculta.
6. Sin selección no hay acciones disponibles; sin permiso de edición no aparecen casillas.
7. Probar una selección con un proyecto no editable: la API mantiene sus permisos y la interfaz informa qué identificadores quedaron sin confirmar.
8. Si falla el refresco de la lista, restablecer la conexión y pulsar `Reintentar`: debe volver a cargar.

## 5. Patentes e identificadores

1. Abrir una tarea sin patente: mientras no tenga una asignada, debe mostrar su ID numérico (`#id`).
2. En un proyecto que ya tenga 99 tareas numeradas, crear otra: la nueva patente debe terminar en `100`, sin truncarse a `10`. Repetir la comprobación del límite 999 → 1000.
3. Volver a abrir tareas existentes: sus patentes deben conservarse.

La reparación de registros está preparada, pero no se ejecutó contra la base de datos. Desde el worktree de la API:

```bash
# Cuenta las tareas sin patente, sin escribir.
php index.php repair_task_patentes index

# Asigna solo las faltantes mediante el generador corregido.
php index.php repair_task_patentes index apply
```

Una segunda ejecución no debe modificar patentes existentes. Cualquier fallo se informa por ID y produce salida distinta de cero. No se reasignan IDs de tareas.

## Verificación automática

- `npm test`: 768 pruebas correctas.
- `npm run typecheck`: correcto.
- PHP: comprobaciones de estados, contexto de presencia y patentes correctas; sintaxis de los 13 archivos PHP modificados/nuevos correcta.
- ESLint de archivos modificados y detector visual: sin incidencias.
- Compilación de producción: correcta después del ajuste móvil final.
- Navegador: selección de varias filas, selección de página, cuerpo de las solicitudes y fallo parcial simulado correctos; botón Completados probado en ambos sentidos; pulso y preferencia de movimiento reducido comprobados.
- Árbol de auditoría revisado en escritorio y móvil con datos simulados. La prueba PHP comprueba la resolución de relaciones del servidor. Capturas locales en `output/playwright/`.

La revisión manual y la reparación de datos existentes siguen pendientes. `feature-aislada` exige aprobación antes de integrar la rama.
