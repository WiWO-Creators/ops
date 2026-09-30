import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

/**
 * Escalas de `docs/sistema-de-diseno.md` que no admiten valores sueltos: capas de `z-index` con
 * nombre (`globals.css`) y tamaños de texto de la escala. Los `vmin` de la carteleria no caen aca:
 * escalan con la pantalla a proposito.
 */
const ESCALAS_SIN_ARBITRARIOS = [
  {
    selector: 'Literal[value=/(^|[\\s:"\'`])-?z-\\[/]',
    message: '`z-[…]` no: usa una capa con nombre de `globals.css` (`z-superposicion`, `z-aviso`…) o la escala numérica para apilados locales.'
  },
  {
    selector: 'TemplateElement[value.raw=/(^|[\\s:"\'`])-?z-\\[/]',
    message: '`z-[…]` no: usa una capa con nombre de `globals.css` (`z-superposicion`, `z-aviso`…) o la escala numérica para apilados locales.'
  },
  {
    selector: 'Literal[value=/text-\\[[\\d.]+(px|rem)\\]/]',
    message: '`text-[Npx|Nrem]` no: usa la escala (`text-menor`, `text-sm`, `text-micro`…) o agrega un token en `globals.css`.'
  },
  {
    selector: 'TemplateElement[value.raw=/text-\\[[\\d.]+(px|rem)\\]/]',
    message: '`text-[Npx|Nrem]` no: usa la escala (`text-menor`, `text-sm`, `text-micro`…) o agrega un token en `globals.css`.'
  }
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),

  {
    rules: {
      // `nada de any` de las convenciones, subido de aviso a error.
      '@typescript-eslint/no-explicit-any': 'error',
      // El idiom `const { password, ...publico } = staff` es como se quita un campo de un objeto:
      // la variable descartada no se usa a proposito. Sin esto, la forma correcta de NO exponer una
      // contraseña genera un aviso, y los avisos que se ignoran entrenan a ignorar los demas.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },

  {
    // `no-restricted-syntax` no se acumula entre bloques: el que sigue la redeclara entera para sus
    // archivos, asi que repite estas escalas.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...ESCALAS_SIN_ARBITRARIOS]
    }
  },

  {
    // Guardrail de `docs/sistema-de-diseno.md`: el pulso que no para es de lo que se desmonta
    // (`componentes/estado/`) o de las excepciones decididas ahi: la pildora de estado del Proyecto y
    // el punto de la llamada en curso. `/pantalla` es carteleria y anima a proposito.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/componentes/estado/**',
      'src/componentes/proyecto/CabeceraProyecto.tsx',
      'src/componentes/proyecto/MenuEstadoProyecto.tsx',
      'src/componentes/teletrabajo/MiniLlamada.tsx',
      'src/app/pantalla/**'
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/animate-(pulse|ping)/]',
          message: '`animate-pulse`/`animate-ping` solo en `src/componentes/estado/` o en las excepciones de docs/sistema-de-diseno.md § Guardrails.'
        },
        {
          selector: 'TemplateElement[value.raw=/animate-(pulse|ping)/]',
          message: '`animate-pulse`/`animate-ping` solo en `src/componentes/estado/` o en las excepciones de docs/sistema-de-diseno.md § Guardrails.'
        },
        ...ESCALAS_SIN_ARBITRARIOS
      ]
    }
  },

  {
    // El mock es JavaScript plano que corre en Node, no en el navegador.
    files: ['mock/**/*.js', 'pruebas/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  }
])

export default eslintConfig
