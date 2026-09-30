import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

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
        }
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
