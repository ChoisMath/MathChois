import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // 대문자 이름은 JSX 컴포넌트로 쓰인다(코어 규칙은 JSX 사용을 인식하지 못함) — `{ icon: Icon }` 같은 인자 포함
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      // React Compiler 전용 진단. 이 프로젝트는 컴파일러를 쓰지 않고, 필기 onChange 핸들러들은
      // ref 기반으로 의존성을 일부러 좁혀 두었다(S-Pen 입력 중 핸들러 재생성 방지).
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])
