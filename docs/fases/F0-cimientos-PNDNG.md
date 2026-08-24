# F0 — Cimientos

Contrato, API base, proyecto Next y sistema de diseño. Ninguna pantalla de negocio.

Al terminar F0, los cuatro carriles ya corrieron en paralelo y existe una aplicación que autentica
contra la API real, con su sistema de diseño catalogado, aunque todavía no muestre un solo Proceso.

## Qué se construye

### S0 — Contrato (serial, bloquea todo)

- [`contrato-api.md`](../contrato-api.md) congelado, con el JSON exacto de los seis recursos.
- `mock/` sirviendo esas respuestas.
- `wiwo-board/modules/api/README.md` como espejo del contrato.

### Carril A — API en Perfex

- Módulo `modules/api/` con la estructura definida en el plan.
- `install.php` creando `tbl_api_tokens` (patrón: `modules/goals/install.php`).
- `Http/ApiController.php`: CORS, guard, `_remap`, chequeo de permisos, `respond()`.
- `Auth/TokenGuard.php`: emitir, validar, rotar, revocar.
- `controllers/v1/`: `Auth`, `Me`, `Health`.
- `Transformers/Transformer.php` base.
- `tools/smoke.sh`.

### Carril B — Cimientos de `ops-v2`

- Proyecto Next 16 con App Router, TypeScript estricto, ESLint copiado de `devoperation`.
- `src/app/api/bff/[...ruta]/route.ts`: el proxy único, con lista blanca de prefijos.
- `src/app/api/sesion/route.ts`: login y logout, cookie `httpOnly` firmada.
- `src/app/(acceso)/entrar/page.tsx`.
- `src/datos/cliente.ts` y `claves.ts`.
- `src/dominio/glosario.ts`.

### Carril C — Sistema de diseño

- Tokens y fuentes copiados desde `devoperation-wt-m06-sistema-visual`, con sus encabezados de
  licencia.
- `src/estilos/neo.css` con los semánticos del diseño nuevo.
- `@theme` mapeando los semánticos.
- Los ~22 componentes mínimos.
- Las reglas de lint: `backdrop-filter`, `animation: infinite`, valores arbitrarios de color.
- `src/app/taller/` catalogando cada componente en sus estados, en claro y oscuro.

### Carril D — Definiciones

- `DefinicionTabla` y `DefinicionColumna` tipadas.
- `DefinicionTablero` tipada.
- Las 5 definiciones de tabla y 5 de tablero de Fase 1, destiladas de
  `wiwo-board/application/views/admin/tables/` y de `init_kanban()`.

## Qué se reusa

| De dónde | Qué |
|---|---|
| `devoperation-wt-m06-sistema-visual/packages/ui/src/styles/` | `tokens.css`, `colors.css`, `fonts.css`, `_breakpoints.scss` |
| `devoperation-wt-m06-sistema-visual/apps/web/public/fonts/neo/` | Las tres familias, subseteadas |
| `devoperation-wt-m06-sistema-visual/packages/ui/src/` | `breakpoints.test.ts`, `tokens.test.ts`, `dispositivo.ts` |
| `devoperation/eslint.config.mjs` | Configuración de lint |
| `wiwo-board/application/models/Authentication_model.php` | Login y 2FA, llamados tal cual |
| `wiwo-board/application/core/AdminController.php:62-70` | El poblado de `$GLOBALS['current_user']` |
| `wiwo-board/modules/goals/install.php` | Patrón de instalación de módulo |

## Criterios de aceptación

Ejecutados, no razonados.

**API**

1. `tools/smoke.sh` pasa entero: 401 sin token · 200 con token · 401 con token revocado · 403 con
   staff sin permiso · 204 en `OPTIONS` · headers CORS presentes con origen permitido y **ausentes**
   con origen no permitido · 404 en id inexistente · paginación coherente · refresh rotativo (el
   refresh viejo devuelve 401).
2. `GET /health` devuelve `auth_header_visible: true` en el VPS, no sólo en local.
3. Login con 2FA por correo y con aplicación, ambos verificados a mano.

**El panel no se rompió**

4. `git diff --stat` en `wiwo-board` no muestra **ningún** archivo fuera de `modules/api/`.
   Excepciones admitidas: una línea `SetEnvIf` en `.htaccess` (sólo si el header `Authorization` no
   se propaga) y `application/config/app-config.php`, que no se commitea. `routes.php`, `config.php`,
   `hooks.php`, `application/core/*` y `system/*` **sin cambios**. Ésa es la garantía estructural, no
   una promesa.
5. Smoke manual del panel con el módulo **desactivado** y luego **activado**, idéntico en ambos
   casos: login con y sin 2FA, tablero, listado de proyectos, listado de tareas, abrir tarea, subir
   adjunto, marcar completada, notificación en tiempo real.
6. Activar y desactivar `api` desde `admin/modules` no altera menús ni assets.

**Frontend**

7. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
8. Login real contra la API v1, y `/api/bff/me` devuelve el staff.
9. En DevTools, el token **no** aparece en `localStorage`, ni en `sessionStorage`, ni en ninguna
   cookie legible por JavaScript.
10. Cero peticiones a `fonts.googleapis.com` o `fonts.gstatic.com` en la pestaña de red.
11. `grep -rn "backdrop-filter" src/` no devuelve nada.
12. `/taller` navegable, con cada componente en claro y oscuro.
13. `pruebas/breakpoints.test.ts` y `pruebas/marca.test.ts` en verde.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Apache o FastCGI no propaga el header `Authorization` | Se detecta el día 1 con `/health`. Si falla: `SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1` en `.htaccess`, línea puramente aditiva |
| R2 | Una fila en `tbl_sessions` por petición de API | Techo aceptado; lo limpia el recolector de CodeIgniter. Medir `COUNT(*)` antes y después de 100 llamadas |
| R3 | `App_Controller` ejecuta `autologin()`, que lee la cookie → identidad mezclada | El guard **siempre** pisa `current_user` y `staff_user_id` con el dueño del token. Sin token, 401, sin importar la cookie |
| R4 | El contrato cambia a mitad de F0 | Se permite, pero se anuncia y se actualizan documento y mock en el mismo commit |
| R5 | Deriva silenciosa entre el mock y la API real | Integrar el primer endpoint real en cuanto exista, no todos al final |

## Deuda consciente

- Una fila de sesión por petición de API. Si molesta, driver de sesión nulo para `/api`.
- Sin límite de peticiones. Se agrega en F3, o antes si un token se filtra.
- Sin OpenAPI. El documento del contrato alcanza hasta pasar los 20 endpoints.

## Lo que se aprendió

_(Se completa al cerrar la fase. Lo que el plan decía mal, lo que resultó distinto, la deuda que se
tomó a sabiendas.)_
