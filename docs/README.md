# ops-v2

Frontend nuevo del sistema operativo de WiWO. Reemplaza la interfaz del panel de administración de
`wiwo-board` (Perfex CRM sobre CodeIgniter 3), que pasa a funcionar únicamente como backend a través
de una API REST nueva.

No es un rediseño del panel actual: es una interfaz nueva sobre los mismos datos y las mismas reglas
de negocio.

## Por qué existe

El panel actual son 584 vistas PHP con markup inline, Bootstrap 3, jQuery y un monolito de 273 KB
(`assets/js/main.js`). No hay un solo componente reutilizable — el único del repo es
`resources/js/components/filters/AppFilters.vue`. Cada cambio visual toca PHP, y cada pantalla es una
recarga completa.

Dos objetivos concretos:

1. **Una interfaz que se pueda evolucionar.** Componentes reales, tablas y tableros dirigidos por
   definiciones declarativas en vez de 47 archivos PHP casi iguales.
2. **IA de primera clase.** Perfex ya sabe hablar con un LLM (`application/services/ai/` +
   `modules/openai/`). Lo que falta es la capa de presentación: streaming al navegador, contexto por
   entidad, búsqueda en lenguaje natural. En una MPA de CodeIgniter eso es posible pero doloroso.

## Cómo se conecta

```
navegador ──► ops-v2 (Next.js)  ──►  wiwo-board / modules/api  ──►  MySQL
              cookie httpOnly       Bearer + JSON + permisos       (la misma base de siempre)
              BFF en /api/bff        de Perfex intactos
```

`ops-v2` **no tiene base de datos propia** y **no duplica ninguna regla de negocio**. Todo lo que
escribe pasa por la API, que a su vez llama a los modelos de Perfex. Esa es la propiedad que hace que
el rollback sea decirle a la gente que vuelva al otro dominio, sin migrar nada.

## Documentos

| Documento | Qué contiene |
|---|---|
| [convenciones.md](convenciones.md) | Cómo se escribe el código acá. Leer antes de tocar nada |
| [glosario.md](glosario.md) | Los renombres de dominio. **Intocables** |
| [contrato-api.md](contrato-api.md) | El contrato REST. Fuente de verdad compartida con el backend |
| [sistema-de-diseno.md](sistema-de-diseno.md) | Tokens, tipografía, reglas de marca, guardrails |
| [flujo-de-trabajo.md](flujo-de-trabajo.md) | Los carriles paralelos y cómo no pisarse |
| [encargo-brechas-del-board-PNDNG.md](encargo-brechas-del-board-PNDNG.md) | Lo que el board hace y Ops no, ya priorizado por el usuario. Punto de partida del trabajo por tandas |
| [handoff-frontend.md](handoff-frontend.md) | Lo que queda del frontend que no está en ninguna fase: el detalle de Proceso, dos huecos de la API y la operación |
| [pedidos-directos.md](pedidos-directos.md) | Pedidos sueltos del usuario por chat, con estado en back y front. Se va agregando, no se cierra |
| [fases/](fases/) | Una por fase: qué se construye, criterios de aceptación, riesgos |
| [modulos/](modulos/) | Una ficha por módulo: pantallas, endpoints, campos, escrituras, permisos y reglas del panel a replicar. Es lo único que hace falta leer para armar un módulo |
| [referencia/censo-del-board.md](referencia/censo-del-board.md) | El censo medido del board en producción: qué módulos tienen filas reales y cuáles están vacíos. Es el dato que decide qué se construye |
| [referencia/](referencia/) | Material de apoyo. Incluye el esquema de Perfex, **cuyos endpoints no existen**: el contrato vigente es `contrato-api.md` |

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| [F0](fases/F0-cimientos-CMPLTD.md) | Contrato, API base, proyecto Next, sistema de diseño | **Terminada** |
| [F1](fases/F1-procesos-y-espacios-PNDNG.md) | Procesos y Espacios — el trabajo diario | Casi entera. Faltan el buscador global (⌘K), el detalle de Proceso editable y el tiempo real |
| [F2](fases/F2-crm-PNDNG.md) | Prospectos, Clientes, escritura en la API | A la mitad. Clientes está construido y escribe; Prospectos no tiene ni una pantalla |
| [F3](fases/F3-ventas-CANCELADA.md) | Facturas, presupuestos, propuestas, pagos, gastos | **Cancelada** |
| [F4](fases/F4-tickets-tablero-ia-PNDNG.md) | Tickets, dashboard completo, IA | PNDNG |

Al cerrar una fase se renombra `-PNDNG` → `-CMPLTD` y se escribe dentro **lo que se aprendió**: lo
que el plan decía mal, lo que resultó distinto, la deuda consciente.

> **F3 se canceló y parte de su backend se borró.** `estimates`, `proposals` y `contracts` salieron
> de la API en el commit `b854567` de `wiwo-board`: hoy responden `404`. Sobreviven `invoices`,
> `payments` y `expenses` —construidos, sin pantalla— y los tres borrados siguen legibles en modo
> lectura bajo `/portal/*`, que lee las tablas directo. El detalle, en
> [fases/F3-ventas-CANCELADA.md](fases/F3-ventas-CANCELADA.md).

## El dato que ordena las prioridades

Los dos dumps de producción —`wiwo_board_db_full_20260819` y el del 12/08, 137 tablas, 122 clientes,
2.580 tareas, 179 staff— tienen **cero filas** en:

`tblinvoices` · `tblestimates` · `tblproposals` · `tblitemable` · `tblexpenses` ·
`tblinvoicepaymentrecords` · `tbltickets`

**Esos módulos de Perfex nunca se usaron.** Los únicos con datos reales son `tblleads` (81 filas) y
`tblcontracts` (29).

Tres consecuencias, y las tres están en los papeles porque explican decisiones que de otro modo
parecen arbitrarias:

1. **Por eso los módulos nuevos nacen ocultos.** `secciones_habilitadas` de `GET /me` es la lista
   fija `["procesos","espacios","salas"]` (`modules/api/controllers/V1.php:2245`): construir la
   pantalla de facturas antes de que alguien emita una factura es el peor retorno del proyecto.
2. **Por eso su verificación tuvo que sembrar datos con rollback** en vez de cotejar contra
   producción. "0 diferencias sobre 0 filas" no verifica nada. Los comparadores que quedan fabrican
   sus propios casos dentro de una transacción que siempre revierte, e informan `filas_dejadas` y
   `rollback_limpio` para probar que no quedó nada.
3. **Por eso F3 terminó cancelada.** Cotizaciones, propuestas y contratos se borraron del backend
   (`b854567`): mantener 2.000 líneas de PHP verificadas contra un fixture, para un módulo que
   producción nunca usó, no se paga. De los módulos nuevos verificados contra filas reales sólo
   queda Prospectos.

Cuando se decida qué construir después de F1, este es el dato que manda: **la interfaz de Prospectos
tiene 81 filas esperándola; la de Facturas, ninguna.**

## Fuera de alcance

Lo siguiente **se queda en el panel viejo**, con un enlace directo desde la barra superior. No es una
omisión: es una decisión de retorno.

- **Los 27 archivos de `admin/settings/includes/`** — se usan una vez por trimestre y reescribirlos
  es el peor retorno del proyecto. **Ajustes ya salió de esta lista y está construido**: `GET|PATCH
  /settings` expone 17 opciones editables de las 573 de `tbloptions` (Procesos, Cronómetro, Listados
  y equipo) más 6 de sólo lectura, y el front las consume desde `/administracion/*`
  (`src/datos/ajustes.ts`). Ninguna de SMTP, credenciales ni claves de API entra, ni siquiera como
  lectura.
- **Automatización e informes avanzados** — hasta que alguien los pida por su nombre. Base de
  conocimiento y suscripciones salieron de esta lista por el portal del cliente. Contratos también
  había salido, pero el recurso se borró con F3 y volvió a quedar afuera.
- App móvil y modo sin conexión.

### Lo que la API no hace, y no es un pendiente de conexión

No existe. Pedirlo devuelve `404`. Está en el contrato con su detalle
([contrato-api.md](contrato-api.md#lo-que-la-api-no-hace)), y acá para que no se descubra tarde:

- **`/estimates`, `/proposals` y `/contracts` enteros**: el recurso se borró con F3 (`b854567`).
  Los datos siguen ahí y el portal del cliente los lee, pero el panel no tiene por dónde pedirlos.
- **PDF byte a byte** (`GET /{id}/pdf`) y **envío por correo** (`POST /{id}/enviar`) de facturas.
- **Facturas recurrentes** del cron y **notas de crédito**.
- **Subida del comprobante de gasto** y **subida de adjuntos al responder un ticket**. La subida de
  adjuntos a Procesos y Espacios **sí existe** (`POST /tasks/{id}/files`, `POST /projects/{id}/files`);
  son estos dos casos los que quedaron afuera. La *lectura* y la *descarga* funcionan en todos.
- **`POST /leads/{id}/convertir`** — la conversión de prospecto a cliente. Fuera por decisión del
  usuario; sigue haciéndose en el panel.
- **Borrado de gastos** y `PATCH /payments/{id}`.

Y la que más pesa para la interfaz:

> **Ninguna escritura de la API avisa a nadie.** Ni correo, ni campana, ni Pusher. Es deuda
> consciente y medida: está apagado en `Nucleo\EfectosExternos`, y cada comparador cuenta las
> notificaciones y los intentos de correo para probar que siguen en cero.
>
> Lo que **sí** existe es la infraestructura: `Escritura/Aviso.php` escribe en la campana y encola
> correo detrás de su propio interruptor, y `/notifications` sirve la campana, el contador, las
> preferencias por persona y el visor de la cola. Lo que falta es que las escrituras la llamen y que
> el front muestre la campana: hoy el front sólo lee `/notifications/settings` y
> `/notifications/mail-queue` desde `/administracion/correo`.
>
> Mientras siga así, **la interfaz no puede decir "enviado", "notificado" ni "el cliente fue
> avisado"**, y quien complete un Proceso desde `ops-v2` tiene que avisar por otro medio.

## Levantar el entorno

La aplicación Next vive en la raíz del repositorio. No hay `apps/`.

```bash
pnpm install
cp .env.example .env      # ver abajo qué va en cada variable
pnpm dev                  # :3000
```

`.env.example` tiene seis variables: `API_BASE` (la API v1 de `wiwo-board`), `SESION_CLAVE` (32
bytes en hexadecimal para cifrar la cookie), `LIVEKIT_URL`, `LIVEKIT_API_KEY` y `LIVEKIT_API_SECRET`
(Teletrabajo; sin las tres la portada se ve pero las salas no abren) y `API_CABECERA_TOKEN`
(`authorization` o `x-api-key`, según lo que diga `GET /api/v1/health` en el servidor). **No hay
variables de Pusher**: el tiempo real todavía no está construido.

`API_BASE` apunta por defecto a la API real corriendo en podman (`http://localhost:8091/api/v1`).
El mock es el camino secundario, para trabajar sin backend:

```bash
pnpm mock                 # API simulada en :3001  (no necesita instalar nada)
pnpm test                 # pruebas del mock
```

El mock no tiene dependencias: sirve el contrato con `node:http` a secas, así que corre en un
repositorio recién clonado. Para usarlo, `API_BASE=http://localhost:3001/api/v1`. Cuentas de prueba
y casos límite que cubre, en [contrato-api.md](contrato-api.md#mock).
