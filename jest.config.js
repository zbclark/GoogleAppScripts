module.exports = {
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: 'coverage',
  //setupFilesAfterEnv: ['<rootDir>/setupTests.js'],
  testMatch: ['**/apps-scripts/**/*.(test|spec).js'],
};