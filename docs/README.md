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
| [fases/](fases/) | Una por fase: qué se construye, criterios de aceptación, riesgos |
| [modulos/](modulos/) | Una ficha por módulo: pantallas, endpoints, campos, escrituras, permisos y reglas del panel a replicar. Es lo único que hace falta leer para armar un módulo |
| [referencia/](referencia/) | Material de apoyo. Incluye el esquema de Perfex, **cuyos endpoints no existen**: el contrato vigente es `contrato-api.md` |

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| [F0](fases/F0-cimientos-PNDNG.md) | Contrato, API base, proyecto Next, sistema de diseño | En curso — **la API está terminada, los catorce recursos** |
| [F1](fases/F1-procesos-y-espacios-PNDNG.md) | Procesos y Espacios — el trabajo diario | PNDNG |
| [F2](fases/F2-crm-PNDNG.md) | Prospectos, Clientes, escritura en la API | PNDNG |
| [F3](fases/F3-ventas-PNDNG.md) | Facturas, presupuestos, propuestas, pagos, gastos | PNDNG |
| [F4](fases/F4-tickets-tablero-ia-PNDNG.md) | Tickets, dashboard completo, IA | PNDNG |

Al cerrar una fase se renombra `-PNDNG` → `-CMPLTD` y se escribe dentro **lo que se aprendió**: lo
que el plan decía mal, lo que resultó distinto, la deuda consciente.

> El backend de F2, F3 y F4 **ya está**: los ocho recursos que faltaban —`invoices`, `payments`,
> `estimates`, `proposals`, `expenses`, `contracts`, `leads` y `tickets`— están construidos y
> verificados. Lo que falta de esas fases es la interfaz. Ver la tabla de
> [modulos/README.md](modulos/README.md).

## El dato que ordena las prioridades

Los dos dumps de producción —`wiwo_board_db_full_20260819` y el del 12/08, 137 tablas, 122 clientes,
2.580 tareas, 179 staff— tienen **cero filas** en:

`tblinvoices` · `tblestimates` · `tblproposals` · `tblitemable` · `tblexpenses` ·
`tblinvoicepaymentrecords` · `tbltickets`

**Esos módulos de Perfex nunca se usaron.** Los únicos con datos reales son `tblleads` (81 filas) y
`tblcontracts` (29).

Tres consecuencias, y las tres están en los papeles porque explican decisiones que de otro modo
parecen arbitrarias:

1. **Por eso los ocho módulos nuevos nacen ocultos.** `secciones_habilitadas` de `GET /me` sigue
   siendo `["procesos","espacios"]`: construir la pantalla de facturas antes de que alguien emita una
   factura es el peor retorno del proyecto.
2. **Por eso su verificación tuvo que sembrar datos con rollback** en vez de cotejar contra
   producción. "0 diferencias sobre 0 filas" no verifica nada. Los comparadores de dinero, ventas,
   gastos y tickets fabrican sus propios casos dentro de una transacción que siempre revierte, e
   informan `filas_dejadas` y `rollback_limpio` para probar que no quedó nada.
3. **Por eso Prospectos y Contratos se verificaron contra las filas reales** —179 staff, 0
   diferencias en los dos— y son los dos únicos módulos nuevos donde el verde no depende de un
   fixture.

Cuando se decida qué construir después de F1, este es el dato que manda: **la interfaz de Prospectos
tiene 81 filas esperándola; la de Facturas, ninguna.**

## Fuera de alcance

Lo siguiente **se queda en el panel viejo**, con un enlace directo desde la barra superior. No es una
omisión: es una decisión de retorno.

- **Los 27 archivos de `admin/settings/includes/`** — se usan una vez por trimestre y reescribirlos
  es el peor retorno del proyecto. Lo que **sí** salió de esta lista es **Ajustes**, acotado: el
  usuario lo pidió por su nombre y la ola 1 expuso **17 opciones editables** de las 573 de
  `tbloptions` (Procesos, Cronómetro, Listados y equipo) más 6 de sólo lectura, con `GET|PATCH
  /settings`. Ninguna de SMTP, credenciales ni claves de API entra, ni siquiera como lectura.
- **Automatización e informes avanzados** — hasta que alguien los pida por su nombre. Contratos
  salió de esta lista: se pidió por su nombre y tiene ficha en
  [modulos/12-contratos.md](modulos/12-contratos.md). Base de conocimiento y suscripciones también
  salieron, por el portal del cliente.
- App móvil y modo sin conexión.

### Lo que la API no hace, y no es un pendiente de conexión

No existe. Pedirlo devuelve `404`. Está en el contrato con su detalle
([contrato-api.md](contrato-api.md#lo-que-la-api-no-hace)), y acá para que no se descubra tarde:

- **PDF byte a byte** (`GET /{id}/pdf`) y **envío por correo** (`POST /{id}/enviar`) de facturas,
  cotizaciones y propuestas.
- **Facturas recurrentes** del cron y **notas de crédito**.
- **Subida del comprobante de gasto** y **subida de adjuntos al responder un ticket**. La *lectura* y
  la *descarga* de los dos funcionan.
- **`POST /leads/{id}/convertir`** — la conversión de prospecto a cliente. Fuera por decisión del
  usuario; sigue haciéndose en el panel.
- **Embudo de propuestas y de cotizaciones**, y `POST /{id}/mover` sobre `pipeline_order`. El único
  embudo que existe es el de Prospectos.
- **Alta y borrado de contratos**, borrado de gastos, `PATCH /payments/{id}`, y alta y edición de
  clientes.

Y la que más pesa para la interfaz:

> **La API no notifica a nadie. En absoluto.** Ni correo, ni campana, ni Pusher, en **ninguna**
> escritura. Es deuda consciente y medida, no un olvido: está apagado en
> `Nucleo\EfectosExternos`, y cada comparador cuenta las notificaciones y los intentos de correo para
> probar que siguen en cero.
>
> El caso más ruidoso es Tickets: **responder un ticket no le avisa al cliente**. En el panel,
> responder es sobre todo avisar; acá el efecto es escribir una fila. Mientras siga así, **la interfaz
> no puede decir "enviado", "notificado" ni "el cliente fue avisado"**, y quien responda desde
> `ops-v2` tiene que avisarle por otro medio.

## Levantar el entorno

```bash
pnpm mock                 # API simulada en :3001  (no necesita instalar nada)
pnpm test                 # pruebas del mock
```

El mock no tiene dependencias: sirve el contrato con `node:http` a secas, así que corre en un
repositorio recién clonado. Cuentas de prueba y casos límite que cubre, en
[contrato-api.md](contrato-api.md#mock).

Cuando exista `apps/web` (carril B), se suma:

```bash
pnpm install
cp .env.example .env      # API_BASE, SESION_CLAVE, PUSHER_*
pnpm dev                  # :3000
```

Mientras la API real no exista, `API_BASE` apunta al mock.
