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
    // El mock es JavaScript plano que corre en Node, no en el navegador.
    files: ['mock/**/*.js', 'pruebas/**/*.js'],
    rules: {
      'no-console': 'off'
    }
  }
])

export default eslintConfig
