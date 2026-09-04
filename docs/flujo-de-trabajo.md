# Flujo de trabajo

Cómo se construye el sistema en el menor tiempo posible sin que los frentes se bloqueen entre sí.

## El principio: el contrato es la costura

Backend y frontend sólo avanzan en simultáneo si **nadie espera al otro para saber qué construir**.
Eso exige una sola cosa: congelar el contrato antes de empezar, y tener un **mock** que lo sirva.

Con el mock, el frontend no espera a que Perfex tenga endpoints, y el backend no espera a que la
interfaz decida qué campos quiere. Sin el mock, cualquier plan "paralelo" es en realidad secuencial
con pasos escondidos.

La parte obligatoriamente serial es cortísima. Todo lo demás va en paralelo.

```
   S0  CONTRATO  (serial — bloquea todo)
        │
        ├──────────────┬──────────────┬──────────────┐
        │              │              │              │
     CARRIL A       CARRIL B       CARRIL C       CARRIL D
     API Perfex     Cimientos      Sistema de     Definiciones
                    ops-v2         diseño         declarativas
        │              │              │              │
        │              │              └──────┬───────┘
        │              │                     │
        │              │            motor de Tabla y Tablero
        │              │                     │
        │              └──────────┬──────────┘
        │                         │
        │                  pantallas contra el MOCK
        │                         │
        └─────────────────────────┤
                                  │
                    INTEGRACIÓN: cambiar API_BASE
                                  │
                            FASE 1 cerrada
```

## S0 — Contrato

Una sola persona o agente. Un solo entregable: [contrato-api.md](contrato-api.md) congelado, más el
mock que lo sirve.

Incluye el JSON exacto de los seis recursos de Fase 1 (`staff`, `lookups`, `clients`, `projects`,
`tasks`, `files`), la forma de `login` / `2fa` / `refresh` / `me`, las convenciones de consulta y los
endpoints de acción.

**Sin el mock, S0 no está cerrado.**

## Los cuatro carriles

| Carril | Alcance | Depende de | Terminado cuando |
|---|---|---|---|
| **A — API Perfex** | `modules/api/`, `tbl_api_tokens`, `ApiController`, CORS, `TokenGuard`, `auth/*`, `/me`, `/health`, y luego los recursos en orden de dependencia: staff → lookups → clients → projects → tasks → files | S0 | `tools/smoke.sh` en verde |
| **B — Cimientos** | Proyecto Next 16, tsconfig estricto, ESLint, tokens y fuentes copiados, `@theme`, BFF `[...ruta]`, cookie de sesión, `/entrar`, `cliente.ts`, `claves.ts` | S0 (sólo la forma de auth) | Login contra el mock, `pnpm build` en verde |
| **C — Sistema de diseño** | Los ~22 componentes mínimos, `neo.css`, las reglas de lint, y `/taller` | **Nada** | `/taller` navegable, lint en verde |
| **D — Definiciones** | Leer las 47 vistas de `admin/tables/` y los 5 kanbans, y destilar los objetos `DefinicionTabla` y `DefinicionTablero` de Fase 1 | S0 (nombres de campo) | 5 definiciones de tabla y 5 de tablero, tipadas |

**El carril C no depende de nada**: arranca el día 1, en paralelo con S0. Es la propiedad más
aprovechable del plan — el sistema de diseño se construye contra `/taller`, no contra pantallas que
todavía no existen.

**El carril D es arqueología**, no código de runtime: leer PHP y escribir objetos. También puede
empezar temprano, y es el trabajo más fácil de repartir entre varias personas (una tabla cada una).

## Puntos de encuentro

Son los únicos momentos donde algo espera a algo.

1. **C + D → motor de Tabla y Tablero.** Necesita el `<Tabla>` del carril C y las definiciones del D.
2. **B + (C+D) → pantallas.** Con cimientos, componentes y definiciones, las pantallas de Fase 1 se
   escriben contra el mock.
3. **A → integración.** Cambiar `API_BASE` del mock a la API real. Si el contrato se respetó, es una
   variable de entorno. **Si duele acá, S0 se hizo mal.**

## Cómo no pisarse

Un git worktree por carril, con rama propia, según la convención ya usada en el repositorio:

```
wiwo-board-wt-api-v1      feat/api-v1        # carril A  (otro repo)
ops-v2-wt-cimientos       feat/cimientos     # carril B
ops-v2-wt-diseno          feat/diseno        # carril C
ops-v2-wt-definiciones    feat/definiciones  # carril D
```

Los carriles B, C y D tocan carpetas **disjuntas**, así que los merges son mecánicos:

| Carril | Carpetas |
|---|---|
| B | `src/app/`, `src/datos/`, `src/lib/` |
| C | `src/estilos/`, `src/componentes/`, `src/app/taller/` |
| D | `src/definiciones/`, `src/dominio/` |

`src/tabla/` y `src/tablero/` son del punto de encuentro 1: no se tocan antes.

**Limpieza**: la skill `feature-aislada` borra su worktree al terminar. No dejar worktrees ni ramas
huérfanas ocupando disco (ya hay una: `frontend-wt-responsive-solido`, sin `.git`).

## Camino crítico

**El camino crítico es A, la API — no la interfaz.** Es lo único que no se puede simular
indefinidamente, y lo único que toca un sistema en producción.

Con varias personas o agentes:

- **Uno en S0**, sin excepción. Es corto y bloquea todo.
- **Dos en A**: uno en infraestructura (módulo, tokens, guard, CORS) y otro en recursos y
  transformers, en cuanto `ApiController` compile.
- **Uno en C** desde el día 1.
- **Uno en B y D** (ambos livianos, comparten poco).

Con una sola persona por vez, el orden que minimiza tiempo muerto es:

```
S0 → C → A-infraestructura → B → A-recursos → D → pantallas
```

`C` va segundo porque es lo único que no depende de nadie: mientras se decide cualquier otra cosa,
los componentes ya se pueden construir.

## Reglas de integración

- **Integrar temprano, no al final.** En cuanto exista un endpoint real, se apunta a él aunque el
  resto siga en el mock. La deriva entre mock y API se descubre con el primer endpoint, no con el
  último.
- **El contrato manda sobre el código.** Si la API devuelve algo distinto a
  [contrato-api.md](contrato-api.md), se arregla la API o se actualiza el documento — pero no se
  parchea el frontend en silencio.
- **Un cambio de contrato se anuncia** y actualiza documento y mock en el mismo commit.

## Qué se verifica en cada merge

Frontend: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

Backend: `tools/smoke.sh`, más la garantía estructural — `git diff --stat` no muestra **ningún**
archivo fuera de `modules/api/`. Ver [fases/F0](fases/F0-cimientos-CMPLTD.md).
