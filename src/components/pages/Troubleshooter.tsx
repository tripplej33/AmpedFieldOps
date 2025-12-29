import { useState, useEffect } from 'react';
import Header from '@/components/layout/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  Download,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface TestResult {
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

interface TroubleshooterResult {
  success: boolean;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  timestamp: string;
}

export default function Troubleshooter() {
  const { hasPermission } = useAuth();
  const [results, setResults] = useState<TroubleshooterResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());

  // Check if user has admin permission
  useEffect(() => {
    if (!hasPermission('can_manage_users')) {
      toast.error('Access denied. Admin permissions required.');
      window.location.href = '/';
    }
  }, [hasPermission]);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const suites = await api.getTroubleshooterSuites();
      const uniqueCategories = Array.from(new Set(suites.map(s => s.category)));
      setCategories(['all', ...uniqueCategories]);
    } catch (error: any) {
      console.error('Failed to load categories:', error);
      toast.error('Failed to load test categories');
    }
  };

  const runTests = async (category?: string) => {
    setIsRunning(true);
    setResults(null);
    setExpandedTests(new Set());

    try {
      const result = await api.runTroubleshooter(category);
      setResults(result);
      
      if (result.success) {
        toast.success(`All tests passed! (${result.passed}/${result.totalTests})`);
      } else {
        toast.error(`Tests completed with ${result.failed} failure(s)`);
      }

      // Auto-expand failed tests
      const failedTestIds = result.results
        .filter(r => r.status === 'failed')
        .map(r => r.id);
      setExpandedTests(new Set(failedTestIds));
    } catch (error: any) {
      console.error('Failed to run troubleshooter:', error);
      toast.error('Failed to run troubleshooter: ' + (error.message || 'Unknown error'));
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunAll = () => {
    runTests(selectedCategory === 'all' ? undefined : selectedCategory);
  };

  const toggleTestExpansion = (testId: string) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId);
    } else {
      newExpanded.add(testId);
    }
    setExpandedTests(newExpanded);
  };

  const exportResults = (format: 'json' | 'csv', errorsOnly: boolean = false) => {
    if (!results) return;

    // Filter to errors only if requested
    const dataToExport = errorsOnly
      ? {
          ...results,
          results: results.results.filter(r => r.status === 'failed'),
          totalTests: results.results.filter(r => r.status === 'failed').length,
          passed: 0,
          failed: results.failed,
          skipped: 0,
        }
      : results;

    if (format === 'json') {
      const dataStr = JSON.stringify(dataToExport, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      const filename = errorsOnly
        ? `troubleshooter-errors-${new Date().toISOString()}.json`
        : `troubleshooter-results-${new Date().toISOString()}.json`;
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } else if (format === 'csv') {
      const csvRows = [
        ['Test Name', 'Category', 'Status', 'Duration (ms)', 'Message', 'Error'],
        ...dataToExport.results.map(r => [
          r.name,
          r.category,
          r.status,
          r.duration.toString(),
          r.message,
          r.error?.message || '',
        ]),
      ];

      const csvContent = csvRows.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      const dataBlob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      const filename = errorsOnly
        ? `troubleshooter-errors-${new Date().toISOString()}.csv`
        : `troubleshooter-results-${new Date().toISOString()}.csv`;
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const filteredResults = results?.results.filter(r => 
    selectedCategory === 'all' || r.category === selectedCategory
  ) || [];

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'skipped':
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    const variants = {
      passed: 'default',
      failed: 'destructive',
      skipped: 'secondary',
    } as const;

    return (
      <Badge variant={variants[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Header title="Troubleshooter" subtitle="Run diagnostic tests to verify system functionality" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Controls */}
          <Card className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={selectedCategory}
                  onValueChange={setSelectedCategory}
                  disabled={isRunning}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleRunAll}
                disabled={isRunning}
                className="flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running Tests...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Tests
                  </>
                )}
              </Button>

              {results && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => exportResults('json')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportResults('csv')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* Summary Stats */}
          {results && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Total Tests</div>
                <div className="text-2xl font-bold mt-1">{results.totalTests}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Passed</div>
                <div className="text-2xl font-bold text-green-500 mt-1">
                  {results.passed}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Failed</div>
                <div className="text-2xl font-bold text-red-500 mt-1">
                  {results.failed}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">Duration</div>
                <div className="text-2xl font-bold mt-1">
                  {(results.duration / 1000).toFixed(2)}s
                </div>
              </Card>
            </div>
          )}

          {/* Results Table */}
          {results && (
            <Card>
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Test Results</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Test Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No tests found for selected category
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredResults.map((test) => {
                        const isExpanded = expandedTests.has(test.id);
                        return (
                          <>
                            <TableRow
                              key={test.id}
                              className={cn(
                                'cursor-pointer hover:bg-muted/50',
                                test.status === 'failed' && 'bg-red-500/5'
                              )}
                              onClick={() => toggleTestExpansion(test.id)}
                            >
                              <TableCell>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(test.status)}
                                  {test.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{test.category}</Badge>
                              </TableCell>
                              <TableCell>{getStatusBadge(test.status)}</TableCell>
                              <TableCell>{test.duration}ms</TableCell>
                              <TableCell className="max-w-md truncate">
                                {test.message}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${test.id}-details`}>
                                <TableCell colSpan={6} className="bg-muted/30">
                                  <div className="p-4 space-y-3">
                                    <div>
                                      <div className="text-sm font-medium mb-1">Full Message</div>
                                      <div className="text-sm text-muted-foreground">
                                        {test.message}
                                      </div>
                                    </div>
                                    {test.error && (
                                      <div>
                                        <div className="text-sm font-medium mb-1 text-red-500">
                                          Error Details
                                        </div>
                                        <div className="text-sm text-muted-foreground font-mono bg-background p-3 rounded border overflow-x-auto">
                                          <div className="mb-2">
                                            <strong>Message:</strong> {test.error.message}
                                          </div>
                                          {test.error.stack && (
                                            <div className="mt-2">
                                              <strong>Stack:</strong>
                                              <pre className="whitespace-pre-wrap mt-1">
                                                {test.error.stack}
                                              </pre>
                                            </div>
                                          )}
                                          {test.error.details && (
                                            <div className="mt-2">
                                              <strong>Details:</strong>
                                              <pre className="whitespace-pre-wrap mt-1">
                                                {JSON.stringify(test.error.details, null, 2)}
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    <div className="text-xs text-muted-foreground">
                                      Run at: {new Date(test.timestamp).toLocaleString()}
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {/* Empty State */}
          {!results && !isRunning && (
            <Card className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Test Results</h3>
              <p className="text-muted-foreground mb-4">
                Click "Run Tests" to execute the troubleshooter and verify system functionality.
              </p>
              <Button onClick={handleRunAll} className="flex items-center gap-2 mx-auto">
                <Play className="h-4 w-4" />
                Run Tests
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

