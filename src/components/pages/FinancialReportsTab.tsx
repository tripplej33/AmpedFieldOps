import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { Loader2, Download, TrendingUp, FileText, DollarSign, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function FinancialReportsTab() {
  const [isLoading, setIsLoading] = useState(false);
  const [reportType, setReportType] = useState<'profit-loss' | 'balance-sheet' | 'cash-flow' | 'aged-receivables' | 'aged-payables'>('profit-loss');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState<any>(null);

  const loadReport = async () => {
    setIsLoading(true);
    try {
      let data;
      switch (reportType) {
        case 'profit-loss':
          data = await api.getProfitLossReport({ date_from: dateFrom, date_to: dateTo });
          break;
        case 'balance-sheet':
          data = await api.getBalanceSheetReport({ date: reportDate });
          break;
        case 'cash-flow':
          data = await api.getCashFlowReport({ date_from: dateFrom, date_to: dateTo });
          break;
        case 'aged-receivables':
          data = await api.getAgedReceivablesReport({ date: reportDate });
          break;
        case 'aged-payables':
          data = await api.getAgedPayablesReport({ date: reportDate });
          break;
      }
      setReportData(data);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load report');
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const exportReport = () => {
    if (!reportData) return;
    
    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `financial-report-${reportType}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const needsDateRange = ['profit-loss', 'cash-flow'].includes(reportType);
  const needsSingleDate = ['balance-sheet', 'aged-receivables', 'aged-payables'].includes(reportType);

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <Card className="p-6 bg-card border-border">
        <div className="space-y-4">
          <div>
            <Label className="font-mono text-xs uppercase tracking-wider">Report Type</Label>
            <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profit-loss">Profit & Loss</SelectItem>
                <SelectItem value="balance-sheet">Balance Sheet</SelectItem>
                <SelectItem value="cash-flow">Cash Flow</SelectItem>
                <SelectItem value="aged-receivables">Aged Receivables</SelectItem>
                <SelectItem value="aged-payables">Aged Payables</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {needsDateRange && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">From Date</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="font-mono text-xs uppercase tracking-wider">To Date</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-2"
                />
              </div>
            </div>
          )}

          {needsSingleDate && (
            <div>
              <Label className="font-mono text-xs uppercase tracking-wider">Report Date</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="mt-2"
              />
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={loadReport}
              disabled={isLoading}
              className="bg-electric text-background hover:bg-electric/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
            {reportData && (
              <Button variant="outline" onClick={exportReport}>
                <Download className="w-4 h-4 mr-2" />
                Export JSON
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Report Results */}
      {isLoading && (
        <Card className="p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Generating report...</p>
        </Card>
      )}

      {!isLoading && reportData && (
        <Card className="p-6 bg-card border-border">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              {reportType === 'profit-loss' && 'Profit & Loss Statement'}
              {reportType === 'balance-sheet' && 'Balance Sheet'}
              {reportType === 'cash-flow' && 'Cash Flow Statement'}
              {reportType === 'aged-receivables' && 'Aged Receivables'}
              {reportType === 'aged-payables' && 'Aged Payables'}
            </h3>
            <div className="text-sm text-muted-foreground font-mono">
              {needsDateRange && `${dateFrom} to ${dateTo}`}
              {needsSingleDate && reportDate}
            </div>
          </div>

          <div className="overflow-x-auto">
            <pre className="bg-muted/30 p-4 rounded-lg text-sm font-mono overflow-x-auto">
              {JSON.stringify(reportData, null, 2)}
            </pre>
          </div>

          <div className="mt-4 p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Note: This is a simplified report view. In production, this would display formatted financial tables, charts, and graphs.
              Use the Export button to download the full report data.
            </p>
          </div>
        </Card>
      )}

      {!isLoading && !reportData && (
        <Card className="p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">No report generated yet. Select a report type and click "Generate Report".</p>
        </Card>
      )}
    </div>
  );
}

