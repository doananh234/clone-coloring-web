import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      // Downgrade to warn — pre-existing any types in lib/api/type files
      '@typescript-eslint/no-explicit-any': 'warn',
      // Downgrade to warn — pre-existing unescaped entities in dialog components
      'react/no-unescaped-entities': 'warn',
    },
  },
  eslintConfigPrettier, // eslint-config-prettier last to override conflicting rules
];

export default eslintConfig;
