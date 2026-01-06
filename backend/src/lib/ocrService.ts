/**
 * OCR Service Client
 * Communicates with the OCR service to process document images
 */
import FormData from 'form-data';
import fs from 'fs';
import { env } from '../config/env';
import { log } from './logger';

export interface OCRResult {
  success: boolean;
  confidence: number;
  document_type: string;
  extracted_data: {
    document_number?: string;
    date?: string;
    amount?: number;
    total_amount?: number;
    tax_amount?: number;
    vendor_name?: string;
    vendor_address?: string;
    line_items?: any[];
    raw_text?: string;
  };
  raw_text: string;
  error?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  tesseract_available: boolean;
}

class OCRServiceClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = env.OCR_SERVICE_URL || 'http://ocr-service:8000';
  }

  /**
   * Process an image file through OCR
   */
  async processImage(filePath: string): Promise<OCRResult> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), {
        filename: filePath.split('/').pop() || 'image.jpg',
        contentType: 'image/jpeg',
      });

      const response = await fetch(`${this.baseUrl}/process`, {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OCR service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return result as OCRResult;
    } catch (error: any) {
      log.error('OCR processing failed', error, { filePath });
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Check if OCR service is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const health = await response.json() as HealthResponse;
        return health.status === 'healthy' && health.tesseract_available === true;
      }
      return false;
    } catch (error) {
      log.warn('OCR service health check failed', { error: (error as Error).message });
      return false;
    }
  }
}

export const ocrService = new OCRServiceClient();
