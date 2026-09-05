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

export interface WorkerJobPayload {
  job_id: string;
  extractor_id: string;
  extractor_version: string;
  status: 'SUCCEEDED' | 'NEEDS_REVIEW' | 'FAILED';
  row_count: number;
  movement_count: number;
  page_count: number;
  warning_codes: string[];
  checks: WorkerCheck[];
  artifacts: WorkerArtifact[];
  reused: boolean;
}

export interface WorkerProcessRequest {
  content: Buffer;
  fileName: string;
  defaultYear?: number;
  extractorId?: string;
  requestId?: string;
}
