import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Generate a JSA (Job Safety Analysis) PDF document
 */
export async function generateJSAPDF(data: any, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Job Safety Analysis (JSA)', { align: 'center' });
      doc.moveDown();

      // Job Information
      doc.fontSize(14).text('Job Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Job Description: ${data.job_description || 'N/A'}`);
      doc.text(`Location: ${data.location || 'N/A'}`);
      doc.text(`Date: ${data.date || 'N/A'}`);
      doc.text(`Prepared By: ${data.prepared_by || 'N/A'}`);
      doc.moveDown();

      // Hazards and Controls
      if (data.hazards && Array.isArray(data.hazards)) {
        doc.fontSize(14).text('Hazards and Control Measures', { underline: true });
        doc.fontSize(12);
        data.hazards.forEach((hazard: any, index: number) => {
          doc.text(`${index + 1}. Hazard: ${hazard.description || 'N/A'}`);
          doc.text(`   Risk Level: ${hazard.risk_level || 'N/A'}`);
          doc.text(`   Control Measures: ${hazard.control_measures || 'N/A'}`);
          doc.moveDown(0.5);
        });
      }

      // Sign-offs
      doc.moveDown();
      doc.fontSize(14).text('Sign-offs', { underline: true });
      doc.fontSize(12);
      doc.text(`Prepared By: ${data.prepared_by_name || 'N/A'}`);
      if (data.prepared_by_date) {
        doc.text(`Date: ${data.prepared_by_date}`);
      }
      doc.moveDown();
      doc.text(`Approved By: ${data.approved_by_name || 'N/A'}`);
      if (data.approved_by_date) {
        doc.text(`Date: ${data.approved_by_date}`);
      }

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate an Electrical Code of Compliance certificate PDF
 */
export async function generateCompliancePDF(data: any, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Electrical Code of Compliance', { align: 'center' });
      doc.moveDown();

      // Certificate Information
      doc.fontSize(14).text('Certificate Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Certificate Number: ${data.certificate_number || 'N/A'}`);
      doc.text(`Issue Date: ${data.issue_date || 'N/A'}`);
      doc.moveDown();

      // Installation Details
      doc.fontSize(14).text('Installation Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Location: ${data.location || 'N/A'}`);
      doc.text(`Description: ${data.description || 'N/A'}`);
      if (data.installation_date) {
        doc.text(`Installation Date: ${data.installation_date}`);
      }
      doc.moveDown();

      // Testing Results
      if (data.testing_results) {
        doc.fontSize(14).text('Testing Results', { underline: true });
        doc.fontSize(12);
        if (typeof data.testing_results === 'string') {
          doc.text(data.testing_results);
        } else if (Array.isArray(data.testing_results)) {
          data.testing_results.forEach((result: any, index: number) => {
            doc.text(`${index + 1}. ${result.test || 'N/A'}: ${result.result || 'N/A'}`);
          });
        }
        doc.moveDown();
      }

      // Compliance Standards
      if (data.compliance_standards && Array.isArray(data.compliance_standards)) {
        doc.fontSize(14).text('Compliance Standards', { underline: true });
        doc.fontSize(12);
        data.compliance_standards.forEach((standard: string) => {
          doc.text(`• ${standard}`);
        });
        doc.moveDown();
      }

      // Inspector Details
      doc.fontSize(14).text('Inspector Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Inspector Name: ${data.inspector_name || 'N/A'}`);
      doc.text(`License Number: ${data.inspector_license || 'N/A'}`);
      if (data.inspection_date) {
        doc.text(`Inspection Date: ${data.inspection_date}`);
      }
      doc.moveDown();

      // Sign-offs
      doc.fontSize(14).text('Sign-offs', { underline: true });
      doc.fontSize(12);
      doc.text(`Inspector: ${data.inspector_name || 'N/A'}`);
      if (data.inspector_signature_date) {
        doc.text(`Date: ${data.inspector_signature_date}`);
      }

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate an Electrical Safety Certificate PDF
 */
export async function generateSafetyCertificatePDF(data: any, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Electrical Safety Certificate', { align: 'center' });
      doc.moveDown();

      // Certificate Information
      doc.fontSize(14).text('Certificate Information', { underline: true });
      doc.fontSize(12);
      doc.text(`Certificate Number: ${data.certificate_number || 'N/A'}`);
      doc.text(`Issue Date: ${data.issue_date || 'N/A'}`);
      if (data.expiry_date) {
        doc.text(`Expiry Date: ${data.expiry_date}`);
      }
      doc.moveDown();

      // Installation Details
      doc.fontSize(14).text('Installation Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Location: ${data.location || 'N/A'}`);
      doc.text(`Description: ${data.description || 'N/A'}`);
      doc.moveDown();

      // Safety Checks
      if (data.safety_checks && Array.isArray(data.safety_checks)) {
        doc.fontSize(14).text('Safety Checks', { underline: true });
        doc.fontSize(12);
        data.safety_checks.forEach((check: any, index: number) => {
          doc.text(`${index + 1}. ${check.check || 'N/A'}: ${check.status || 'N/A'}`);
          if (check.notes) {
            doc.text(`   Notes: ${check.notes}`);
          }
        });
        doc.moveDown();
      }

      // Inspector Details
      doc.fontSize(14).text('Inspector Details', { underline: true });
      doc.fontSize(12);
      doc.text(`Inspector Name: ${data.inspector_name || 'N/A'}`);
      doc.text(`License Number: ${data.inspector_license || 'N/A'}`);
      if (data.inspection_date) {
        doc.text(`Inspection Date: ${data.inspection_date}`);
      }
      doc.moveDown();

      // Sign-offs
      doc.fontSize(14).text('Sign-offs', { underline: true });
      doc.fontSize(12);
      doc.text(`Inspector: ${data.inspector_name || 'N/A'}`);
      if (data.inspector_signature_date) {
        doc.text(`Date: ${data.inspector_signature_date}`);
      }

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate PDF based on document type
 */
export async function generateDocumentPDF(
  documentType: 'jsa' | 'electrical_compliance' | 'electrical_safety_certificate',
  data: any,
  outputPath: string
): Promise<void> {
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  switch (documentType) {
    case 'jsa':
      return generateJSAPDF(data, outputPath);
    case 'electrical_compliance':
      return generateCompliancePDF(data, outputPath);
    case 'electrical_safety_certificate':
      return generateSafetyCertificatePDF(data, outputPath);
    default:
      throw new Error(`Unknown document type: ${documentType}`);
  }
}

