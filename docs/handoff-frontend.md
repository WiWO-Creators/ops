# Handoff — qué falta para que `ops-v2` esté al 100%

Fecha: 2026-08-26. Basado en el código de `ops-v2` (HEAD `b82eff9`) y de `wiwo-board`
(HEAD `5e6ee78`), no en los documentos de planificación.

Regla de lectura: `docs/contrato-api.md` manda sobre las fichas de `docs/modulos/`, y el código
manda sobre los dos.

---

## 1. Dónde está parado el proyecto

**API (`wiwo-board/modules/api/`): terminada para los catorce recursos.** Lectura, escritura,
permisos y visibilidad verificados contra el código real del panel. No es el cuello de botella.

**Frontend: F0 cerrado y F1 a medias.** Lo que existe hoy en el panel:

| Pantalla | Ruta | Estado |
|---|---|---|
| Acceso equipo (con 2FA) | `/colab` | Completo |
| Acceso portal cliente | `/` | Completo |
| Inicio | `/inicio` | Completo (Mi trabajo, cronómetro abierto, accesos) |
| Procesos — lista | `/procesos` | Completo (filtros, orden, paginación, acciones de fila, masivas, CSV) |
| Procesos — tablero | `/procesos/tablero` | Completo (arrastre nativo, paginación por columna) |
| Espacios — lista | `/espacios` | Completo |
| Espacios — detalle | `/espacios/[id]` | Completo y profundo: tareas, hitos, gantt, tiempos, discusiones, notas, archivos, actividad, ventas, contratos |
| Clientes | `/clientes`, `/clientes/[id]` | Completo en lectura |
| Equipo | `/equipo` | Completo |
| Portal del cliente | `/portal/*` | Construido entero (12 pantallas), **sin desplegar** |
| Taller de componentes | `/taller` | Completo |

Escrituras que ya funcionan desde la interfaz: crear y editar Espacio, copiarlo, eliminarlo, crear
Proceso, mover tarjeta en el tablero, acciones de fila y masivas sobre Procesos, arrancar y detener
cronómetro, alta y edición de timesheets, comentarios de actividad de Espacio.

---

## 2. Bloqueantes de F1 — sin esto no se cierra la fase

Estos cinco son los que impiden el criterio real de F1 ("una persona pasa un día laboral completo
sin abrir el panel viejo").

### 2.1 El detalle de Proceso no existe

`src/componentes/proyecto/DetalleTarea.tsx` es un cajón lateral de 247 líneas que muestra datos de
cabecera y **dos contadores** (`DetalleTarea.tsx:140-141`): cantidad de comentarios y avance de la
lista de verificación. No muestra ni permite editar ninguno de los dos.

Falta, y la API ya lo sirve todo:

- Comentarios: `GET /tasks/{id}/comments` + alta, edición y borrado.
- Lista de verificación: `GET /tasks/{id}/checklist` + marcar, agregar, reordenar.
- Cronómetros del proceso: `GET /tasks/{id}/timers`.
- Adjuntos: `GET /tasks/{id}/files` (la subida no existe en la API, ver 4.1).
- Descripción editable en sitio, asignados, seguidores, etiquetas, campos personalizados.
- La ruta `/procesos/[id]` como página. Hoy sólo hay cajón, y una vista de Proceso no se puede
  compartir por enlace.

Es el trabajo más grande que queda del panel y el que decide si la fase sirve.

### 2.2 No se puede subir un archivo en ninguna parte

`grep -rn 'type="file"' src/` no devuelve nada. Ni Procesos, ni Espacios, ni el portal. El criterio
4 de aceptación de F1 ("comentar, adjuntar un archivo y descargarlo") no se puede cumplir, y la
mitad del problema es de la API (ver 4.1).

### 2.3 No hay tiempo real

`package.json` no tiene `pusher-js`. El contrato ya define `GET /config/realtime` y el protocolo
(ping vacío al canal `notifications-channel-<staffId>`, invalidar y volver a pedir). Sin esto, el
criterio 8 de F1 —"un cambio hecho por otra persona aparece sin recargar"— queda sin cumplir, y dos
personas trabajando sobre el mismo Espacio ven datos viejos.

Nota: el ping lo emite **el panel viejo** cuando alguien escribe ahí. Las escrituras hechas desde
`ops-v2` no emiten nada (ver 4.2), así que el tiempo real sólo funciona en el sentido
panel → `ops-v2`.

### 2.4 No hay buscador global (⌘K)

Está en el alcance de F1 ("Estructura") y no hay ni componente ni ruta. La API no tiene un endpoint
de búsqueda transversal: hoy habría que abanicar `q=` sobre `tasks`, `projects`, `clients` y
`staff` desde el BFF, o pedir uno nuevo (ver 4.7).

### 2.5 El cronómetro activo no está en la barra superior

`src/app/(panel)/inicio/CronometroAbierto.tsx` vive dentro de `/inicio`. La ficha
[05-mi-trabajo](modulos/05-mi-trabajo.md) lo pide **presente en todo el panel**: quien está en
`/espacios/12` no ve que dejó un cronómetro corriendo. Mover el componente al `layout.tsx` del
panel, que ya resuelve `/me` una vez por navegación.

---

## 3. Deuda declarada de F1 que sigue abierta

Menor, pero conviene que quede escrita:

- **"Abrir en el panel clásico"**: la regla de `docs/modulos/README.md` dice *cada pantalla* lo
  lleva. Hoy aparece sólo en dos componentes de Cliente (`FichaCliente.tsx`,
  `ListaContactos.tsx`), y no hay constante con la URL de `board.wiwo.me` en `src/`. Falta en
  Procesos, Espacios, Equipo e Inicio.
- **Preferencias de columnas**: no se persisten en ningún lado, ni en `localStorage`. Se pierden en
  cada recarga.
- **Editor de texto enriquecido**: sigue siendo `AreaTexto` a secas. La descripción de Perfex es
  HTML; escribirla en texto plano degrada lo que ya había.
- **Sin vista de calendario ni línea de tiempo** en Procesos (el Gantt existe, pero sólo dentro del
  detalle de Espacio).

---

## 4. Lo que hay que agregar a la API

Ordenado por cuánto bloquea al frontend. El detalle de cada uno está en
[`contrato-api.md` § "Lo que no se construyó"](contrato-api.md#lo-que-no-se-construyó).

### 4.1 Subida de adjuntos — bloquea F1

No existe **ningún** endpoint de escritura de archivos. `files` es sólo lectura y descarga. Hace
falta como mínimo:

- `POST /tasks/{id}/files` y `POST /projects/{id}/files` (multipart), con la whitelist de
  extensiones del panel, el `413` propio y el `visible_to_customer`.
- Lo mismo para el comprobante de gasto y para la respuesta de ticket, si esos módulos se
  habilitan.

Ojo con la trampa ya documentada: `tblfiles.rel_type` tiene filas con `'tasks'` en plural.

### 4.2 Notificaciones — decisión de producto, no de código

**La API no notifica a nadie, en ninguna escritura**: ni campana, ni correo, ni Pusher. Está
apagado a propósito en `Nucleo/EfectosExternos.php` y cada comparador verifica que siga en cero.

Consecuencia práctica para el frontend: **ninguna pantalla puede decir "enviado", "notificado" o
"se le avisó al cliente"**. Y mientras siga así, quien complete un Proceso desde `ops-v2` tiene que
avisar por otro medio.

Costo estimado en los papeles: campana ~150 líneas y 11 criterios; correo entre 450 y 700 líneas.
Es la decisión más grande que queda pendiente y no la puede tomar el frontend.

### 4.3 `POST /files/{id}/link` — token de un solo uso

Sin esto, `<img src>` y `<a download>` no pueden pedir binarios directo (no mandan
`Authorization`) y todo tiene que pasar por el BFF. Funciona, pero encarece cada miniatura.

### 4.4 Preferencias de usuario

No hay recurso. Columnas visibles, orden por defecto y vistas guardadas no tienen dónde vivir. Un
`GET/PUT /me/preferencias` con un JSON opaco alcanza y desbloquea la deuda de 3.

### 4.5 Para habilitar los módulos ocultos (F2/F3)

`secciones_habilitadas` de `GET /me` está fija en `["procesos","espacios"]`
(`modules/api/controllers/V1.php:1415`). Habilitar una sección es editar esa lista, no desplegar
código. Antes de habilitarlas, la API necesita:

| Módulo | Falta en la API |
|---|---|
| Prospectos | `POST /leads/{id}/convertir` (la conversión a cliente sigue en el panel) |
| Facturas | PDF, envío por correo, recurrentes, notas de crédito, `tags`, `custom_fields` |
| Cotizaciones | PDF, envío, embudo y `POST /{id}/mover`, `custom_fields` |
| Propuestas | PDF, envío, embudo y `mover` |
| Contratos | Alta, borrado y subida de adjuntos |
| Gastos | Subida del comprobante, borrado, `tags`, `custom_fields` |
| Pagos | `PATCH /payments/{id}` (deliberadamente fuera) |
| Clientes | Alta y edición (por diseño siguen en el panel) |

El PDF y el envío por correo son los dos más caros: portar el generador arrastra TCPDF, sus fuentes
y las plantillas del panel.

### 4.6 Prioridad real de estos módulos

Los dos dumps de producción tienen **cero filas** en facturas, cotizaciones, propuestas, gastos,
pagos y tickets. Los únicos con datos reales son prospectos (81) y contratos (29). Si hay que elegir
qué interfaz construir después de F1, **Prospectos tiene 81 filas esperándola; Facturas, ninguna.**

### 4.7 Búsqueda transversal (opcional)

Para el ⌘K. Si no se construye, el BFF abanica `q=` sobre cuatro recursos y arma el resultado.
Empezar por el abanico: es más barato y se puede reemplazar sin tocar la interfaz.

---

## 5. Módulos sin interfaz en el panel

Siete módulos tienen API completa y **cero pantallas** en `(panel)`: prospectos, propuestas,
contratos, facturas, cotizaciones, pagos y gastos. La navegación no los ofrece
(`src/app/(panel)/layout.tsx:59-84`) y en `/inicio` aparecen dos como *próximamente*.

Tickets quedó **fuera de alcance**: el soporte vive en wiwo.center y el prefijo ya salió de la
lista blanca del BFF (`src/datos/rutas.ts`).

El portal del cliente está construido entero pero **sin desplegar** — es la pieza terminada más
grande que hoy no le sirve a nadie. Vale la pena decidir si se despliega antes que seguir sumando
módulos al panel.

---

## 6. Operación

- **Despliegue**: `.github/workflows/deploy.yml` publica `main` en `ops.wiwo.me` por SSH
  (`git pull` + `pnpm build` + `pm2 restart`). No hay staging: `dev` no tiene workflow.
- **Al integrar contra la API real**, la URL de descarga cambia: el mock sirve
  `/api/v1/files/{id}/download` y la API real usa `/api/v1/files/{tipo}/{id}/download`.
- **Al desplegar**, consultar `GET /api/v1/health`: si `auth_header_visible` es `false`, poner
  `API_CABECERA_TOKEN=x-api-key` en el `.env`.
- **Limpieza pendiente**: `wiwo-board-wt-api-v1`, `wiwo-board-wt-iteraciones-tarea`,
  `frontend-wt-responsive-solido` y `frontend-wt-tutorial-planificador-estable` quedaron como
  worktrees huérfanos (sin `.git` válido) ocupando disco en `~/ops.wiwo/`.

---

## 7. Orden sugerido

1. Detalle de Proceso completo (2.1). Es el que decide la fase.
2. Subida de adjuntos: endpoint en la API (4.1) y la interfaz encima (2.2).
3. Cronómetro a la barra superior (2.5) y "Abrir en el panel clásico" en todas las pantallas (3).
4. Tiempo real con `pusher-js` (2.3).
5. Decidir notificaciones (4.2). Hasta que se decida, ninguna pantalla puede prometer un aviso.
6. Buscador ⌘K (2.4), abanicando desde el BFF.
7. Recién ahí, Prospectos como primer módulo nuevo del panel (4.6).
