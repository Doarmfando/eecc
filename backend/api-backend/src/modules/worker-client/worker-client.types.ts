export interface WorkerArtifact {
  kind: 'XLSX' | 'CSV';
  name: string;
  byte_size: number;
  checksum: string;
}

export interface WorkerCheck {
  code: string;
  status: string;
}

/** Un aviso que se puede ubicar: dónde mirar, nunca qué dice el documento. */
export interface WorkerWarningPage {
  code: string;
  page: number;
}

export interface WorkerJobPayload {
  job_id: string;
  extractor_id: string;
  extractor_version: string;
  status: 'SUCCEEDED' | 'NEEDS_REVIEW' | 'FAILED';
  row_count: number;
  movement_count: number;
  page_count: number;
  warning_codes: string[];
  /** Ausente en un worker anterior a los avisos con página. */
  warning_pages?: WorkerWarningPage[];
  checks: WorkerCheck[];
  artifacts: WorkerArtifact[];
  reused: boolean;
}

export interface WorkerProcessRequest {
  content: Buffer;
  fileName: string;
  /** Etiqueta ya saneada para la columna `Archivo` del Excel (ADR-0012). */
  sourceFileName?: string;
  defaultYear?: number;
  extractorId?: string;
  pdfPassword?: string;
  /**
   * Páginas que admite la membresía de quien sube. El worker las cuenta antes de
   * extraer y rechaza con `PDF_PAGE_LIMIT_EXCEEDED`; sin valor, no hay límite.
   */
  maxPages?: number;
  requestId?: string;
}
