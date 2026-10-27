import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', '.local/**', 'drizzle/**', 'next-env.d.ts', 'coverage/**'] },
  {
    // Module boundary rules (docs/system-architecture.md section 3).
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@/platform/db*', 'postgres', 'drizzle-orm*'], message: 'UI components must not access the database.' },
          { group: ['@/modules/*/service*'], message: 'UI components must not call services directly; pass data in from pages.' },
        ],
      }],
    },
  },
  {
    files: ['src/modules/**/*.ts', 'src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@/app/*', '@/ui/*'], message: 'Domain and platform code must not import UI or routes.' }],
      }],
    },
  },
];

export default config;
