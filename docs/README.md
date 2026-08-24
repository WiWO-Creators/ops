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
| [fases/](fases/) | Una por fase: qué se construye, criterios de aceptación, riesgos |

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| [F0](fases/F0-cimientos-PNDNG.md) | Contrato, API base, proyecto Next, sistema de diseño | En curso — la API está terminada |
| [F1](fases/F1-procesos-y-espacios-PNDNG.md) | Procesos y Espacios — el trabajo diario | PNDNG |
| [F2](fases/F2-crm-PNDNG.md) | Prospectos, Clientes, escritura en la API | PNDNG |
| [F3](fases/F3-ventas-PNDNG.md) | Facturas, presupuestos, propuestas, pagos, gastos | PNDNG |
| [F4](fases/F4-tickets-tablero-ia-PNDNG.md) | Tickets, dashboard completo, IA | PNDNG |

Al cerrar una fase se renombra `-PNDNG` → `-CMPLTD` y se escribe dentro **lo que se aprendió**: lo
que el plan decía mal, lo que resultó distinto, la deuda consciente.

## Fuera de alcance

Lo siguiente **se queda en el panel viejo**, con un enlace directo desde la barra superior. No es una
omisión: es una decisión de retorno.

- **Portal del cliente** (77 vistas en `themes/perfex`) — otra audiencia, otra autenticación, otro
  riesgo. Se queda en Perfex indefinidamente.
- **Ajustes** (27 archivos de `admin/settings/includes/`) — se usan una vez por trimestre.
  Reescribirlos es el peor retorno del proyecto.
- **Automatización, informes avanzados, base de conocimiento, encuestas, contratos, suscripciones** —
  hasta que alguien los pida por su nombre.
- App móvil y modo sin conexión.

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
