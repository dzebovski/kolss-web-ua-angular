import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL, SITE_CODE } from '../../core/config/public-config';
import {
  ApiErrorBody,
  LeadCreateResponse,
  LeadSubmissionRequest,
  LeadSubmitResult,
} from './lead-submission.types';

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

@Injectable({ providedIn: 'root' })
export class LeadSubmissionService {
  private readonly http = inject(HttpClient);

  async submit(body: LeadSubmissionRequest): Promise<LeadSubmitResult> {
    const created = await this.create(body);
    return {
      lead_id: created.lead_id,
      submission_id: created.submission_id,
      status: 'accepted',
      duplicate: created.duplicate,
      request_id: created.request_id,
    };
  }

  private create(body: LeadSubmissionRequest): Promise<LeadCreateResponse> {
    return firstValueFrom(this.http.post<LeadCreateResponse>(this.submissionUrl(), body)).catch(
      (error: unknown) => {
        throw this.toApiError(error);
      },
    );
  }

  private submissionUrl(): string {
    return `${API_BASE_URL}/v1/public/sites/${SITE_CODE}/lead-submissions`;
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
