# F0 — Cimientos

Contrato, API base, proyecto Next y sistema de diseño. Ninguna pantalla de negocio.

Al terminar F0, los cuatro carriles ya corrieron en paralelo y existe una aplicación que autentica
contra la API real, con su sistema de diseño catalogado, aunque todavía no muestre un solo Proceso.

## Qué se construye

### S0 — Contrato (serial, bloquea todo)

- [`contrato-api.md`](../contrato-api.md) congelado, con el JSON exacto de los seis recursos.
- `mock/` sirviendo esas respuestas.
- `wiwo-board/modules/api/README.md` **apuntando** a `docs/contrato-api.md`, no repitiéndolo: dos
  copias de un contrato divergen, y cuando divergen nadie sabe cuál manda.

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
- `src/app/(acceso)/page.tsx` (portal) y `src/app/(acceso)/colab/page.tsx` (equipo).
- `src/datos/cliente.ts`.
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
11. ~~`grep -rn "backdrop-filter" src/` no devuelve nada.~~ **Derogado.** Hoy devuelve
    `src/estilos/vidrio.css` y está bien que lo haga: ver *Lo que se aprendió*.
12. `/taller` navegable, con cada componente en claro y oscuro.
13. `pruebas/breakpoints.test.js` y `pruebas/marca.test.js` en verde.

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

### Tres criterios que envejecieron mal

1. **El criterio 11 falla a propósito.** `grep -rn "backdrop-filter" src/` devuelve
   `src/estilos/vidrio.css`, que lo usa en `.panel-vidrio`. No es una regresión: el sistema de
   diseño aceptó la excepción y la dejó escrita
   (`docs/sistema-de-diseno.md`: "la única superficie del sistema con `backdrop-filter` es
   `.panel-vidrio`, con su propia excepción"). La regla que sigue viva es la de superficies siempre
   visibles —barra superior, barra lateral—, y `pruebas/marca.test.js` la verifica sobre `neo.css` y
   `globals.css`, no sobre todo `src/`.
2. **La ruta de login nunca fue `(acceso)/entrar/page.tsx`.** Son dos: `(acceso)/page.tsx` para el
   portal del cliente y `(acceso)/colab/page.tsx` para el equipo. Son dos sujetos distintos, con dos
   cookies distintas, y por eso son dos pantallas.
3. **`src/datos/claves.ts` no existe** y no llegó a existir. Lo que el plan imaginaba ahí terminó
   repartido entre `src/datos/sesion.ts`, `sobre-sesion.ts` y `servidor.ts`.

### El aislamiento se puede medir, y da más de lo esperado

`pre_controller_constructor` **no es un hook nativo de CodeIgniter**: se dispara únicamente desde
`App_Controller.php:18`. Al extender `CI_Controller` en vez de `App_Controller`, la API se saltea
`_app_init()` entero — el `SELECT * FROM tblmodules`, el `require_once` del archivo init de **cada
módulo activo**, `autologin()` leyendo cookies y varias escrituras de sesión.

Eso importa más de lo que parece: el panel local se cayó entero porque a `modules/backup` le faltaba
su `vendor/`. Un módulo activo roto tumba el panel; la API no entra a ese ciclo.

Medido: **40 peticiones autenticadas de API dejan 0 filas en `tblsessions`; 10 del panel dejan 10.**

### Verificar contra el código real, no contra la propia consulta

Las tres herramientas CLI (`verificacion permisos|visibilidad|escrituras`) no comparan textos de SQL
—eso probaría que dos cadenas son iguales— sino **resultados**: pueblan la sesión, llaman a la función
real de Perfex y cotejan conjuntos de ids y filas.

| Comparación | Resultado |
|---|---|
| `puede()` vs `staff_can()`, 179 staff × 72 pares | 12.888 comparaciones, 0 diferencias |
| Visibilidad vs el `WHERE` original | 66.013 filas cotejadas, 0 diferencias |
| Escrituras, misma tarea por los dos caminos con rollback | 6 comparaciones, 0 diferencias |

Ese acople con la sesión existe **sólo** en las herramientas, que son CLI y no alcanzables por HTTP.

### Lo que el plan decía mal

1. **`log_activity()` no era aislado.** Termina en `staff_helper.php:305`, que usa `app_object_cache`
   —una librería que carga `_app_init()`— y falla con "Call to a member function get() on null". Se
   reemplazó por un `INSERT` propio.
2. **La visibilidad por fila no era un riesgo teórico**: 163 de 179 staff la tienen restringida. Uno
   sin `tasks/view` ve 262 de 2.580 procesos. Sin ese filtro, la API le habría mostrado los 2.580.
3. **Devolver 403 donde el panel filtra es tan malo como exponer de más.** Son tres reglas distintas:
   Procesos y Espacios nunca deniegan el listado; Clientes deniega sólo si no hay `view` ni clientes
   asignados ni `create`; Staff deniega directo.
4. **`dev` no es un entorno de pruebas.** Sólo `main` tiene workflow de despliegue, y `dev` quedó 8
   commits atrás. No hay staging: se prueba en local o se prueba en producción.
5. **Mover una tarjeta son dos operaciones**, y el reordenamiento toca la columna entera.

### Deuda tomada a sabiendas

- **La API no notifica a nadie.** Ni campana, ni tiempo real, ni correo, ni a los contactos del
  cliente. El panel no muestra ninguna señal de que faltó. La campana serían ~150 líneas y 11
  criterios; el correo, entre 450 y 700. *(Después de F0 se construyó la infraestructura —
  `Escritura/Aviso.php` y `/notifications`— pero ninguna escritura la llama: la deuda sigue abierta,
  sólo que ahora es más barata de saldar.)*
- Una fila de `tblsessions` por petición es inevitable sin editar la configuración del panel; se
  destruye después, con guarda por ausencia de cookie.
- 10 clases de pasarelas de pago se instancian en cada petición, por el autoload. Piso duro.
