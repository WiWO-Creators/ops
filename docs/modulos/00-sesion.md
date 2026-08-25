# Sesión y acceso

## Qué resuelve

Entrar al sistema con las credenciales de Perfex, sostener la sesión sin que el navegador vea nunca
un token, y salir. Es el módulo del que dependen todos los demás.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Entrar | `/entrar` | Correo y contraseña |
| Segundo factor | `/entrar` (paso 2) | Código de 6 dígitos, cuando la cuenta lo tiene activo |
| Sesión vencida | superposición | Aparece sobre la pantalla actual cuando el refresco falla |

## Endpoints que consume

| Método | Ruta | Cuándo |
|---|---|---|
| `POST` | `/auth/login` | Envío del formulario |
| `POST` | `/auth/2fa` | Envío del código |
| `POST` | `/auth/refresh` | Automático, ante `401 token_expired` |
| `POST` | `/auth/logout` | Salir. `?all=1` cierra todas las sesiones |
| `GET` | `/me` | Al montar el panel |
| `GET` | `/health` | Diagnóstico; no requiere token |

## Campos

`POST /auth/login` con `{email, password}` devuelve una de dos cosas:

```jsonc
// 201 — sin segundo factor
{"data": {
  "access_token": "…", "expires_in": 3600,
  "refresh_token": "…", "refresh_expires_in": 2592000,
  "staff": { /* la misma forma que /me */ }
}}

// 200 — con segundo factor
{"data": {"two_factor_required": true, "challenge_token": "…", "method": "email" | "app"}}
```

El `challenge_token` vive **300 segundos y se usa una sola vez**. `POST /auth/2fa` con
`{challenge_token, code}` devuelve `201` con el mismo par de tokens.

`GET /me` devuelve el staff más tres cosas que el frontend necesita:

| Campo | Para qué |
|---|---|
| `permissions` | `{tasks, projects, customers, staff}`, cada uno con `["view","create","edit","delete"]`. Un administrador recibe las cuatro capacidades en las cuatro áreas |
| `secciones_habilitadas` | Qué mostrar en la barra lateral. Hoy `["procesos","espacios"]` |
| `locale` | `"es"` |

## Acciones y escrituras

Ninguna sobre datos de negocio. Solo emisión y revocación de tokens en `tblapi_tokens`.

## Permisos

Este módulo los **lee**, no los aplica. `permissions` de `/me` sirve para ocultar controles. El
backend filtra de todas formas.

## Reglas del panel que hay que replicar

- Una cuenta desactivada da `403 forbidden` en el login, no `401`. Y ese `403` **no cuenta** para el
  límite de intentos.
- Límite de intentos solo en `/auth/login`: ventana de 15 minutos, 20 fallos por IP, 8 por correo. Un
  login exitoso borra los intentos de ese correo. No hay cabecera `Retry-After`: el mensaje de espera
  lo redacta el frontend.

## Estado de la API

✅ Existe. Dos detalles operativos que decide este módulo:

**El transporte del token.** El header estándar es `Authorization: Bearer <access_token>`, pero bajo
CGI/FastCGI —como corre PHP detrás de cPanel— Apache no propaga `Authorization`. Por eso la API acepta
también `X-Api-Key` con el mismo token. `GET /health` informa cuál de los dos llegó
(`auth_header_visible`, `api_key_visible`): se consulta una vez al desplegar y se configura el BFF en
consecuencia. No es algo que se resuelva probando en producción a ciegas.

**El refresco es una sección crítica.** Reusar un refresh token ya usado **revoca todas las sesiones
del staff** — es la defensa contra el robo de tokens. Si dos peticiones vencidas refrescan en
paralelo, la segunda usa un token ya consumido y deja al usuario afuera de todas sus pestañas. Por eso
`src/datos/refresco.ts` mantiene **un solo refresco en vuelo**: las demás peticiones esperan a esa
promesa y reintentan con el token nuevo. Es una condición de corrección, no una optimización.

## Criterios de aceptación

1. Login sin segundo factor entra al panel; con segundo factor pide el código y entra.
2. Un `challenge_token` reusado o vencido a los 300 s da error claro y vuelve al paso 1.
3. Con el access token vencido y **cinco peticiones en vuelo**, se emite **un solo**
   `POST /auth/refresh` y las cinco se completan. Verificable contando peticiones en el log del BFF.
4. Un `401 token_revoked` lleva a `/entrar` sin bucle de redirecciones.
5. `document.cookie` en el navegador **no contiene** ningún token: la cookie es `httpOnly`.
6. Salir con `?all=1` deja afuera a la otra pestaña en su siguiente petición.
7. 9 intentos fallidos con el mismo correo dan `429 rate_limited` con mensaje entendible.
