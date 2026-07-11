import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL, SITE_CODE } from '../../core/config/public-config';
import { SelectedLeadFile } from './lead-files';
import {
  ApiErrorBody,
  LeadCompleteRequest,
  LeadCompleteResponse,
  LeadCreateResponse,
  LeadSubmissionRequest,
  LeadSubmitResult,
  LeadUploadDescriptor,
} from './lead-submission.types';

const UPLOAD_CONCURRENCY = 3;

export class LeadSubmissionApiError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly details: { field: string; message: string }[];
  readonly status: number;

  constructor(input: {
    message: string;
    code: string;
    requestId: string;
    details: { field: string; message: string }[];
    status: number;
  }) {
    super(input.message);
    this.name = 'LeadSubmissionApiError';
    this.code = input.code;
    this.requestId = input.requestId;
    this.details = input.details;
    this.status = input.status;
  }
}

export type LeadSubmitPhase = 'creating' | 'uploading' | 'completing';

export interface LeadSubmitProgress {
  phase: LeadSubmitPhase;
  uploaded: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class LeadSubmissionService {
  private readonly http = inject(HttpClient);

  /**
   * Create → parallel PUTs (concurrency 3) → complete.
   * Skips upload/complete when create returns status `accepted`.
   */
  async submit(
    body: LeadSubmissionRequest,
    files: SelectedLeadFile[],
    onProgress?: (progress: LeadSubmitProgress) => void,
  ): Promise<LeadSubmitResult> {
    onProgress?.({ phase: 'creating', uploaded: 0, total: files.length });

    const created = await this.create(body);

    if (created.status === 'accepted') {
      return {
        lead_id: created.lead_id,
        submission_id: created.submission_id,
        status: 'accepted',
        duplicate: created.duplicate,
        request_id: created.request_id,
        file_count: 0,
      };
    }

    if (created.status !== 'awaiting_upload') {
      throw new LeadSubmissionApiError({
        message: 'Unexpected submission status from the API.',
        code: 'unexpected_status',
        requestId: created.request_id,
        details: [],
        status: 0,
      });
    }

    if (!created.submission_token || created.uploads.length === 0) {
      throw new LeadSubmissionApiError({
        message: 'The API did not return upload instructions for the attached files.',
        code: 'missing_uploads',
        requestId: created.request_id,
        details: [],
        status: 0,
      });
    }

    const fileByClientId = new Map(files.map((f) => [f.clientFileId, f]));
    onProgress?.({ phase: 'uploading', uploaded: 0, total: created.uploads.length });

    let uploadedCount = 0;
    const completedFiles = await this.mapPool(created.uploads, UPLOAD_CONCURRENCY, async (upload) => {
      const selected = fileByClientId.get(upload.client_file_id);
      if (!selected) {
        throw new LeadSubmissionApiError({
          message: 'A file selected for upload is missing from the form state.',
          code: 'file_mismatch',
          requestId: created.request_id,
          details: [],
          status: 0,
        });
      }

      const etag = await this.putFile(upload, selected.file);
      uploadedCount += 1;
      onProgress?.({
        phase: 'uploading',
        uploaded: uploadedCount,
        total: created.uploads.length,
      });
      return { file_id: upload.file_id, etag };
    });

    onProgress?.({
      phase: 'completing',
      uploaded: created.uploads.length,
      total: created.uploads.length,
    });

    const completed = await this.complete(created.submission_id, created.submission_token, {
      files: completedFiles,
    });

    return {
      lead_id: completed.id,
      submission_id: completed.submission_id,
      status: 'accepted',
      duplicate: completed.duplicate,
      request_id: completed.request_id,
      file_count: completed.file_count,
    };
  }

  private create(body: LeadSubmissionRequest): Promise<LeadCreateResponse> {
    return firstValueFrom(this.http.post<LeadCreateResponse>(this.submissionUrl(), body)).catch(
      (error: unknown) => {
        throw this.toApiError(error);
      },
    );
  }

  private complete(
    submissionId: string,
    submissionToken: string,
    body: LeadCompleteRequest,
  ): Promise<LeadCompleteResponse> {
    const url = `${this.submissionUrl()}/${encodeURIComponent(submissionId)}/complete`;
    return firstValueFrom(
      this.http.post<LeadCompleteResponse>(url, body, {
        headers: { 'X-Submission-Token': submissionToken },
      }),
    ).catch((error: unknown) => {
      throw this.toApiError(error);
    });
  }

  private async putFile(upload: LeadUploadDescriptor, file: File): Promise<string | undefined> {
    const headers = new Headers();
    for (const [key, value] of Object.entries(upload.headers ?? {})) {
      headers.set(key, value);
    }

    let response: Response;
    try {
      response = await fetch(upload.upload_url, {
        method: upload.method || 'PUT',
        headers,
        body: file,
      });
    } catch {
      throw new LeadSubmissionApiError({
        message: 'File upload failed. Please check your connection and try again.',
        code: 'upload_network_error',
        requestId: '',
        details: [],
        status: 0,
      });
    }

    if (!response.ok) {
      throw new LeadSubmissionApiError({
        message: `File upload failed (${response.status}). Please try again.`,
        code: 'upload_failed',
        requestId: '',
        details: [],
        status: response.status,
      });
    }

    const etag = response.headers.get('etag') ?? response.headers.get('ETag');
    return etag?.replaceAll('"', '') || undefined;
  }

  private submissionUrl(): string {
    return `${API_BASE_URL}/v1/public/sites/${SITE_CODE}/lead-submissions`;
  }

  private async mapPool<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const run = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    };

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
    await Promise.all(runners);
    return results;
  }

  private toApiError(error: unknown): LeadSubmissionApiError {
    if (error instanceof LeadSubmissionApiError) {
      return error;
    }

    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiErrorBody | null;
      if (body?.error) {
        return new LeadSubmissionApiError({
          message: body.error.message || 'Request failed',
          code: body.error.code || 'request_failed',
          requestId: body.request_id || '',
          details: body.error.details ?? [],
          status: error.status,
        });
      }

      const unreachable = error.status === 0;
      return new LeadSubmissionApiError({
        message: unreachable
          ? 'Cannot reach the API. Check API_BASE_URL and that kolss-platform-api is running.'
          : error.message || 'Request failed',
        code: unreachable ? 'network_error' : 'http_error',
        requestId: '',
        details: [],
        status: error.status,
      });
    }

    return new LeadSubmissionApiError({
      message: 'Unexpected error while submitting the form',
      code: 'unknown_error',
      requestId: '',
      details: [],
      status: 0,
    });
  }
}
