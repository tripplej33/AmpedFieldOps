import { TestResult } from './types';
import { env } from '../../config/env';

/**
 * Helper function to run a test and capture the result
 */
export async function runTest(
  name: string,
  category: string,
  testFn: () => Promise<void>,
  id?: string
): Promise<TestResult> {
  const startTime = Date.now();
  const testId = id || `${category}-${name}-${Date.now()}`;

  try {
    await testFn();
    const duration = Date.now() - startTime;
    return {
      id: testId,
      name,
      category,
      status: 'passed',
      duration,
      message: 'Test passed',
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      id: testId,
      name,
      category,
      status: 'failed',
      duration,
      message: error.message || 'Test failed',
      error: {
        message: error.message || 'Unknown error',
        stack: error.stack,
        details: error.details,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Helper to make API requests during testing
 */
export async function apiRequest(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    token?: string;
    expectedStatus?: number | number[];
  } = {}
): Promise<any> {
  const { method = 'GET', body, token, expectedStatus } = options;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const baseUrl = env.BACKEND_URL || `http://localhost:${env.PORT}`;
  const response = await fetch(`${baseUrl}${endpoint}`, config);
  const data = await response.json().catch(() => ({}));

  if (expectedStatus !== undefined) {
    const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!expectedStatuses.includes(response.status)) {
      throw new Error(`Expected status ${expectedStatuses.join(' or ')}, got ${response.status}: ${JSON.stringify(data)}`);
    }
  }

  if (!response.ok && expectedStatus === undefined) {
    throw new Error(`API request failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Skip a test (returns a skipped result)
 */
export function skipTest(name: string, category: string, reason: string, id?: string): TestResult {
  return {
    id: id || `${category}-${name}-${Date.now()}`,
    name,
    category,
    status: 'skipped',
    duration: 0,
    message: reason,
    timestamp: new Date().toISOString(),
  };
}

