import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { DocumentScan, DocumentMatch } from '@/types';
import { CheckCircle, XCircle, Loader2, AlertCircle, FileText, DollarSign, Calendar, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface DocumentMatchModalProps {
  scan: DocumentScan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMatchConfirmed: () => void;
}

export default function DocumentMatchModal({
  scan,
  open,
  onOpenChange,
  onMatchConfirmed,
}: DocumentMatchModalProps) {
  const [matches, setMatches] = useState<DocumentMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (open && scan.status === 'completed') {
      loadMatches();
    }
  }, [open, scan.id]);

  const loadMatches = async () => {
    try {
      setIsLoading(true);
      const data = await api.getDocumentMatches(scan.id);
      setMatches(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('Failed to load matches');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMatch = async (matchId: string) => {
    try {
      setIsConfirming(matchId);
      await api.confirmDocumentMatch(scan.id, matchId);
      toast.success('Match confirmed and document linked');
      onMatchConfirmed();
    } catch (error: any) {
      toast.error(error.message || 'Failed to confirm match');
    } finally {
      setIsConfirming(null);
    }
  };

  const handleRejectAll = async () => {
    try {
      await api.rejectDocumentMatches(scan.id);
      toast.success('Matches rejected. You can manually link the document.');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject matches');
    }
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      purchase_order: 'Purchase Order',
      invoice: 'Invoice',
      bill: 'Bill',
      expense: 'Expense',
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Document Matches</DialogTitle>
          <DialogDescription>
            Review suggested matches for this document and confirm the correct match.
          </DialogDescription>
        </DialogHeader>

        {/* Extracted Data Summary */}
        {scan.extracted_data && (
          <Card className="p-4 mb-4 bg-muted/50">
            <h3 className="font-semibold mb-3">Extracted Information</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {scan.extracted_data.document_number && (
                <div>
                  <span className="text-muted-foreground">Document #: </span>
                  <span className="font-medium">{scan.extracted_data.document_number}</span>
                </div>
              )}
              {scan.extracted_data.date && (
                <div>
                  <span className="text-muted-foreground">Date: </span>
                  <span className="font-medium">{scan.extracted_data.date}</span>
                </div>
              )}
              {scan.extracted_data.total_amount && (
                <div>
                  <span className="text-muted-foreground">Amount: </span>
                  <span className="font-medium">${scan.extracted_data.total_amount.toFixed(2)}</span>
                </div>
              )}
              {scan.extracted_data.vendor_name && (
                <div>
                  <span className="text-muted-foreground">Vendor: </span>
                  <span className="font-medium">{scan.extracted_data.vendor_name}</span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Matches List */}
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading matches...</p>
          </div>
        ) : matches.length === 0 ? (
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No matches found</p>
            <p className="text-sm text-muted-foreground mt-2">
              You can manually link this document to a record
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {matches.map((match) => (
              <Card key={match.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{getEntityTypeLabel(match.entity_type)}</Badge>
                      <span className={`font-semibold ${getConfidenceColor(match.confidence_score)}`}>
                        {Math.round(match.confidence_score * 100)}% match
                      </span>
                    </div>

                    <div className="space-y-2 mt-3">
                      {match.entity_name && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{match.entity_name}</span>
                        </div>
                      )}
                      {match.entity_amount && (
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span>${match.entity_amount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>

                    {/* Match Reasons */}
                    {match.match_reasons && match.match_reasons.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Why this match:</p>
                        <ul className="space-y-1">
                          {match.match_reasons.map((reason, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                              <CheckCircle className="w-3 h-3 mt-0.5 text-green-500 flex-shrink-0" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => handleConfirmMatch(match.id)}
                    disabled={isConfirming === match.id}
                    className="ml-4"
                  >
                    {isConfirming === match.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Confirming...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Confirm Match
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleRejectAll}>
                <XCircle className="w-4 h-4 mr-2" />
                Reject All Matches
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
