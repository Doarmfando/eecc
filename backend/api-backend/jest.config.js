/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\.(spec|e2e-spec)\.ts$',
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  // Se excluyen los puntos de entrada: `main.ts` y los scripts de `cli/` son
  // arranque y efectos, no lógica; medirlos solo bajaría el listón para el resto.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/cli/**',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 80, functions: 85, lines: 85, statements: 85 },
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
