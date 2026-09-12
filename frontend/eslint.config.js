import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      // El proyecto no usa PropTypes en ningún componente (y no va a usarlos:
      // para tipar props en serio el camino es TypeScript, no esta runtime).
      // Con la regla encendida eran ~890 errores que tapaban por completo los
      // no-unused-vars, que sí marcan código muerto real — el import huérfano
      // de Galeria en Landing.jsx pasó desapercibido justo por eso.
      'react/prop-types': 'off',

      // `const { confirmPassword, ...payload } = formData` es el idiom de
      // React para SACAR un campo del payload: la variable nombrada se declara
      // justamente para no usarla. Sin esta opción se reporta como código
      // muerto y es exactamente lo contrario.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
]
