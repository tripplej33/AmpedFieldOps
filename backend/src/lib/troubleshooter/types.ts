export interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  message: string;
  error?: {
    message: string;
    stack?: string;
    details?: any;
  };
  timestamp: string;
}

export interface TestSuite {
  name: string;
  category: string;
  tests: TestFunction[];
}

export type TestFunction = () => Promise<TestResult>;

export interface TestContext {
  adminToken: string;
  managerToken: string;
  userToken: string;
  testData: {
    userIds: string[];
    clientIds: string[];
    projectIds: string[];
    timesheetIds: string[];
    activityTypeIds: string[];
    costCenterIds: string[];
  };
}

export interface DiscoveredRoute {
  method: string;
  path: string;
  file: string;
  middleware: string[];
}

export interface TroubleshooterRunResult {
  success: boolean;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  timestamp: string;
}

