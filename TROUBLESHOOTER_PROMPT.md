# Troubleshooter System - Agent Prompt

This document provides a prompt template for AI agents to update and maintain the troubleshooter system when new features are added to AmpedFieldOps.

## System Overview

The troubleshooter system validates all functionality in AmpedFieldOps through automated tests. It consists of:

1. **Backend Test Infrastructure** (`backend/src/lib/troubleshooter/`)
   - Test runner engine (`testRunner.ts`)
   - Route scanner for auto-discovery (`routeScanner.ts`)
   - Test data management (`testData.ts`)
   - Test helpers (`testHelpers.ts`)
   - Test suites (`testSuites/*.test.ts`)

2. **Backend API** (`backend/src/routes/troubleshooter.ts`)
   - `POST /api/troubleshooter/run` - Execute tests
   - `GET /api/troubleshooter/routes` - Get discovered routes
   - `GET /api/troubleshooter/suites` - Get test suites

3. **Frontend Interface** (`src/components/pages/Troubleshooter.tsx`)
   - Web UI for running tests and viewing results
   - Accessible via `/troubleshooter` route (admin only)

## When to Update the Troubleshooter

Update the troubleshooter when:
- New API routes/endpoints are added
- New features/modules are introduced
- Existing functionality changes significantly
- New integrations are added
- Database schema changes affect business logic

## How to Update the Troubleshooter

### 1. Adding Tests for New Routes/Features

When new routes are added:

1. **Create a new test suite file** in `backend/src/lib/troubleshooter/testSuites/`
   - Follow the pattern: `featureName.test.ts`
   - Export a `runTests` function: `export async function runTests(context: TestContext): Promise<TestResult[]>`
   - Use test helpers from `testHelpers.ts`:
     - `runTest()` - Execute a test with error handling
     - `apiRequest()` - Make API calls during tests
     - `skipTest()` - Mark a test as skipped

2. **Register the test suite** in `backend/src/routes/troubleshooter.ts`:
   - Import the test suite module
   - Add to `createTestRunner()` function:
     ```typescript
     runner.registerSuite({
       name: 'FeatureName',
       category: 'CategoryName', // e.g., 'CRUD', 'Integration', 'Business Logic'
       runTests: featureTests.runTests,
     });
     ```

3. **Update route scanner** (if needed) in `backend/src/lib/troubleshooter/routeScanner.ts`:
   - Add new route mapping to `routeMap` if route file name doesn't match standard pattern

### 2. Test Structure Guidelines

Each test suite should:
- **Test CRUD operations** (Create, Read, Update, Delete) for entities
- **Test authentication/authorization** (permission checks, role-based access)
- **Test error handling** (invalid inputs, missing data, unauthorized access)
- **Test business logic** (validations, calculations, state transitions)
- **Clean up test data** (data is automatically cleaned via testData.ts, but verify)

### 3. Test Categories

Use appropriate categories:
- **Auth** - Authentication and authorization tests
- **CRUD** - Create, Read, Update, Delete operations
- **Security** - Permission checks, access control
- **Configuration** - Settings, preferences
- **Integration** - External services (Xero, Email, etc.)
- **Business Logic** - Calculations, validations, workflows
- **System** - Health checks, infrastructure

### 4. Example Test Suite Template

```typescript
import { TestResult, TestContext } from '../types';
import { runTest, apiRequest } from '../testHelpers';
import { createTestHelper } from '../testData'; // If needed

export async function runTests(context: TestContext): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let createdId: string | null = null;

  // Setup test data if needed
  // ...

  // Test create
  results.push(
    await runTest(
      'Create resource',
      'CRUD',
      async () => {
        const response = await apiRequest('/api/resource', {
          method: 'POST',
          body: { /* test data */ },
          token: context.adminToken,
          expectedStatus: 201,
        });
        if (!response.id) {
          throw new Error('Creation failed - no ID returned');
        }
        createdId = response.id;
      },
      'resource-create'
    )
  );

  // Test read
  results.push(
    await runTest(
      'Get resource',
      'CRUD',
      async () => {
        const response = await apiRequest(`/api/resource/${createdId}`, {
          token: context.adminToken,
          expectedStatus: 200,
        });
        if (!response.id) {
          throw new Error('Resource not found');
        }
      },
      'resource-get'
    )
  );

  // Test update
  // ...

  // Test delete
  // ...

  return results;
}
```

### 5. Route Auto-Discovery

The route scanner automatically discovers routes from `backend/src/routes/*.ts` files. It:
- Parses route definitions (`router.get()`, `router.post()`, etc.)
- Extracts middleware (authenticate, requireRole, requirePermission)
- Maps routes to API paths

If you add a new route file with non-standard naming, update the `routeMap` in `routeScanner.ts`.

### 6. Frontend Updates

The frontend Troubleshooter page (`src/components/pages/Troubleshooter.tsx`) automatically:
- Loads test categories from the backend
- Displays all test suites and results
- Filters by category
- Exports results (JSON/CSV)

No frontend changes needed unless UI improvements are desired.

## Testing the Troubleshooter

1. **Access the troubleshooter**:
   - Navigate to `/troubleshooter` (admin only)
   - Or use API: `POST /api/troubleshooter/run`

2. **Run all tests**:
   - Click "Run Tests" button
   - Review results and fix any failures

3. **Run specific category**:
   - Select category from dropdown
   - Click "Run Tests"

4. **Export results**:
   - Click "Export JSON" or "Export CSV"
   - Results include all test details, errors, and timing

## Common Issues and Solutions

### Issue: Test fails with "Network error"
- **Solution**: Ensure backend is running and accessible at the configured URL
- Check `env.BACKEND_URL` or `env.PORT` in testHelpers.ts

### Issue: Test creates data that isn't cleaned up
- **Solution**: Verify test data uses `TEST_` prefix
- Check that `cleanupTestData()` in testData.ts handles your entity type

### Issue: Permission tests fail
- **Solution**: Ensure test users are created with correct permissions
- Check `getDefaultPermissions()` in testData.ts for role permissions

### Issue: Route not discovered by scanner
- **Solution**: Check route file name matches pattern in `routeMap`
- Verify route syntax matches expected pattern (router.get/post/etc.)

## Maintenance Checklist

When adding new features, ensure:
- [ ] Test suite created for new feature
- [ ] Test suite registered in troubleshooter.ts
- [ ] Route mapping updated if needed
- [ ] Test data cleanup verified
- [ ] Tests cover CRUD operations
- [ ] Tests cover error cases
- [ ] Tests cover permission checks
- [ ] All tests pass
- [ ] Documentation updated (this file)

## Prompt Template for AI Agents

```
Update the AmpedFieldOps troubleshooter system to include tests for the new [FEATURE_NAME] feature.

The new feature includes:
- [List of new routes/endpoints]
- [List of new entities/models]
- [List of new business logic/validations]

Tasks:
1. Create a new test suite file: backend/src/lib/troubleshooter/testSuites/[featureName].test.ts
2. Implement tests for:
   - Create operations
   - Read operations
   - Update operations
   - Delete operations
   - Permission checks
   - Error handling
3. Register the test suite in backend/src/routes/troubleshooter.ts
4. Update route scanner if needed (if new route file doesn't match standard naming)
5. Verify test data cleanup handles new entity types
6. Run the troubleshooter to verify all tests pass

Follow the existing test suite patterns and use the test helpers from testHelpers.ts.
Ensure tests use the TEST_ prefix for test data and clean up after execution.
```

