import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_BASE_URL, SITE_CODE } from '../../core/config/public-config';
import { LeadForm } from './lead-form';
import {
  contentTypeForFilename,
  MAX_LEAD_FILES,
  validateAndBuildSelectedFiles,
} from './lead-files';
import { LeadSubmissionService } from './lead-submission.service';
import {
  EMPTY_LEAD_FORM,
  buildLeadSubmissionRequest,
  mapApiFieldToFormField,
} from './lead-submission.types';

const submissionUrl = () =>
  `${API_BASE_URL}/v1/public/sites/${SITE_CODE}/lead-submissions`;

type LeadFormHarness = LeadForm & {
  idempotencyKey: () => string;
  model: { set: (value: unknown) => void };
  status: () => string;
  submitLead: () => Promise<void>;
  selectedFiles: { set: (value: unknown) => void };
  botToken: { set: (value: string) => void };
};

describe('lead submission mapping', () => {
  it('builds a request with null optionals, bot_token, and files', () => {
    const request = buildLeadSubmissionRequest({
      model: {
        ...EMPTY_LEAD_FORM,
        name: '  Oleksandr Shevchenko  ',
        phone: ' +380501112233 ',
        email: '  ',
        city: '',
        projectDescription: '',
        privacyAccepted: true,
        website: '',
      },
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      privacyPolicyVersion: 'ua-v1',
      pageUrl: 'http://localhost:4201/',
      botToken: 'turnstile-token',
      files: [
        {
          client_file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          filename: 'plan.pdf',
          content_type: 'application/pdf',
          size_bytes: 1234,
        },
      ],
    });

    expect(request).toEqual({
      idempotency_key: '11111111-1111-4111-8111-111111111111',
      name: 'Oleksandr Shevchenko',
      phone: '+380501112233',
      email: null,
      city: null,
      project_description: null,
      privacy_accepted: true,
      privacy_policy_version: 'ua-v1',
      page_url: 'http://localhost:4201/',
      bot_token: 'turnstile-token',
      website: '',
      files: [
        {
          client_file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          filename: 'plan.pdf',
          content_type: 'application/pdf',
          size_bytes: 1234,
        },
      ],
    });
  });

  it('includes optional fields when provided', () => {
    const request = buildLeadSubmissionRequest({
      model: {
        ...EMPTY_LEAD_FORM,
        name: 'Olena',
        phone: '+380671112233',
        email: 'olena@example.com',
        city: 'Kyiv',
        projectDescription: 'Kitchen remodel',
        privacyAccepted: true,
        website: '',
      },
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      privacyPolicyVersion: 'ua-v1',
      botToken: '',
      files: [],
    });

    expect(request.email).toBe('olena@example.com');
    expect(request.city).toBe('Kyiv');
    expect(request.project_description).toBe('Kitchen remodel');
    expect(request.bot_token).toBe('');
    expect(request.files).toEqual([]);
  });

  it('maps API field names onto form model keys', () => {
    expect(mapApiFieldToFormField('project_description')).toBe('projectDescription');
    expect(mapApiFieldToFormField('privacy_accepted')).toBe('privacyAccepted');
    expect(mapApiFieldToFormField('unknown')).toBeNull();
  });
});

describe('lead file validation', () => {
  it('maps extensions to content types', () => {
    expect(contentTypeForFilename('a.PDF')).toBe('application/pdf');
    expect(contentTypeForFilename('shot.webp')).toBe('image/webp');
    expect(contentTypeForFilename('evil.exe')).toBeNull();
  });

  it('rejects more than max files and oversized files', () => {
    const existing = Array.from({ length: MAX_LEAD_FILES }, (_, i) => ({
      clientFileId: `00000000-0000-4000-8000-00000000000${i}`,
      file: new File(['x'], `f${i}.txt`, { type: 'text/plain' }),
      filename: `f${i}.txt`,
      contentType: 'text/plain',
      sizeBytes: 1,
    }));

    const tooMany = validateAndBuildSelectedFiles(
      [new File(['y'], 'extra.txt', { type: 'text/plain' })],
      existing,
    );
    expect(tooMany.error?.kind).toBe('too_many');

    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf', {
      type: 'application/pdf',
    });
    const tooLarge = validateAndBuildSelectedFiles([huge], []);
    expect(tooLarge.error?.kind).toBe('too_large');
  });
});

async function whenRequest(
  http: HttpTestingController,
  url: string,
): Promise<ReturnType<HttpTestingController['expectOne']>> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const matches = http.match(url);
    if (matches.length === 1) {
      return matches[0];
    }
    await Promise.resolve();
  }
  return http.expectOne(url);
}

describe('LeadSubmissionService orchestrator', () => {
  let service: LeadSubmissionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()],
    });
    service = TestBed.inject(LeadSubmissionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('posts to the absolute API_BASE_URL and skips upload when accepted', async () => {
    const phases: string[] = [];
    const pending = service.submit(
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        name: 'Oleksandr',
        phone: '+380501112233',
        email: null,
        city: null,
        project_description: null,
        privacy_accepted: true,
        privacy_policy_version: 'ua-v1',
        page_url: null,
        bot_token: '',
        website: '',
        files: [],
      },
      [],
      (p) => phases.push(p.phase),
    );

    const req = http.expectOne(submissionUrl());
    expect(req.request.url.startsWith(API_BASE_URL)).toBe(true);
    expect(req.request.url.includes(window.location.origin + '/v1')).toBe(false);
    req.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      submission_token: '',
      uploads: [],
      request_id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      lead_id: 'llllllll-llll-4lll-8lll-llllllllllll',
    });

    const result = await pending;
    expect(result.status).toBe('accepted');
    expect(result.lead_id).toBe('llllllll-llll-4lll-8lll-llllllllllll');
    expect(phases).toEqual(['creating']);
  });

  it('uploads files then completes; fails without false success on PUT error', async () => {
    const file = new File(['pdf-bytes'], 'plan.pdf', { type: 'application/pdf' });
    const selected = [
      {
        clientFileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        file,
        filename: 'plan.pdf',
        contentType: 'application/pdf',
        sizeBytes: file.size,
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => null },
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = service.submit(
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        name: 'Oleksandr',
        phone: '+380501112233',
        email: null,
        city: null,
        project_description: null,
        privacy_accepted: true,
        privacy_policy_version: 'ua-v1',
        page_url: null,
        bot_token: 'tok',
        website: '',
        files: [
          {
            client_file_id: selected[0].clientFileId,
            filename: 'plan.pdf',
            content_type: 'application/pdf',
            size_bytes: file.size,
          },
        ],
      },
      selected,
    );

    const create = http.expectOne(submissionUrl());
    create.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'awaiting_upload',
      duplicate: false,
      submission_token: 'opaque-token',
      uploads: [
        {
          file_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          client_file_id: selected[0].clientFileId,
          method: 'PUT',
          upload_url: 'https://storage.example/upload',
          headers: { 'content-type': 'application/pdf' },
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
      request_id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      lead_id: null,
    });

    await expect(pending).rejects.toMatchObject({ code: 'upload_failed' });
    expect(fetchMock).toHaveBeenCalledOnce();
    http.expectNone(`${submissionUrl()}/ssssssss-ssss-4sss-8sss-ssssssssssss/complete`);
  });

  it('completes after successful PUT uploads', async () => {
    const file = new File(['pdf-bytes'], 'plan.pdf', { type: 'application/pdf' });
    const selected = [
      {
        clientFileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        file,
        filename: 'plan.pdf',
        contentType: 'application/pdf',
        sizeBytes: file.size,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? '"abc"' : null) },
      }),
    );

    const pending = service.submit(
      {
        idempotency_key: '11111111-1111-4111-8111-111111111111',
        name: 'Oleksandr',
        phone: '+380501112233',
        email: null,
        city: null,
        project_description: null,
        privacy_accepted: true,
        privacy_policy_version: 'ua-v1',
        page_url: null,
        bot_token: 'tok',
        website: '',
        files: [
          {
            client_file_id: selected[0].clientFileId,
            filename: 'plan.pdf',
            content_type: 'application/pdf',
            size_bytes: file.size,
          },
        ],
      },
      selected,
    );

    const create = http.expectOne(submissionUrl());
    create.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'awaiting_upload',
      duplicate: false,
      submission_token: 'opaque-token',
      uploads: [
        {
          file_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          client_file_id: selected[0].clientFileId,
          method: 'PUT',
          upload_url: 'https://storage.example/upload',
          headers: { 'content-type': 'application/pdf' },
          expires_at: '2099-01-01T00:00:00Z',
        },
      ],
      request_id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      lead_id: null,
    });

    const complete = await whenRequest(
      http,
      `${submissionUrl()}/ssssssss-ssss-4sss-8sss-ssssssssssss/complete`,
    );
    expect(complete.request.headers.get('X-Submission-Token')).toBe('opaque-token');
    expect(complete.request.body).toEqual({
      files: [{ file_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', etag: 'abc' }],
    });
    complete.flush({
      id: 'llllllll-llll-4lll-8lll-llllllllllll',
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      file_count: 1,
      request_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    const result = await pending;
    expect(result.lead_id).toBe('llllllll-llll-4lll-8lll-llllllllllll');
    expect(result.file_count).toBe(1);
  });
});

describe('LeadForm', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LeadForm],
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch()),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows validation errors for required fields', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    fixture.detectChanges();

    await component.submitLead();
    fixture.detectChanges();

    const form = fixture.nativeElement as HTMLElement;
    expect(form.textContent).toContain('Name is required');
    expect(form.textContent).toContain('Phone is required');
    expect(form.textContent).toContain('Please accept the privacy policy');
  });

  it('submits successfully to absolute URL and rotates the idempotency key', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const keyBefore = component.idempotencyKey();

    component.model.set({
      name: 'Oleksandr Shevchenko',
      phone: '+380501112233',
      email: '',
      city: 'Kyiv',
      projectDescription: '',
      privacyAccepted: true,
      website: '',
    });
    component.botToken.set('bot-tok');
    fixture.detectChanges();

    const pending = component.submitLead();
    const req = http.expectOne(submissionUrl());
    expect(req.request.method).toBe('POST');
    expect(req.request.url).toBe(submissionUrl());
    expect(req.request.body.idempotency_key).toBe(keyBefore);
    expect(req.request.body.privacy_policy_version).toBe('ua-v1');
    expect(req.request.body.bot_token).toBe('bot-tok');
    expect(req.request.body.files).toEqual([]);

    req.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      submission_token: '',
      uploads: [],
      request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lead_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await pending;
    fixture.detectChanges();

    expect(component.idempotencyKey()).not.toBe(keyBefore);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Thank you. Your request was sent successfully.',
    );
    http.verify();
  });

  it('keeps the idempotency key on failure so retries reuse it', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const keyBefore = component.idempotencyKey();

    component.model.set({
      name: 'Oleksandr Shevchenko',
      phone: '+380501112233',
      email: 'oleksandr@example.com',
      city: '',
      projectDescription: '',
      privacyAccepted: true,
      website: '',
    });
    fixture.detectChanges();

    const firstPending = component.submitLead();
    const first = http.expectOne(submissionUrl());
    first.flush(
      {
        error: {
          code: 'validation_error',
          message: 'Phone looks invalid',
          details: [{ field: 'phone', message: 'must be between 7 and 50 characters' }],
        },
        request_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await firstPending;
    fixture.detectChanges();

    expect(component.status()).toBe('failure');
    expect(component.idempotencyKey()).toBe(keyBefore);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Phone looks invalid');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'must be between 7 and 50 characters',
    );

    component.model.set({
      name: 'Oleksandr Shevchenko',
      phone: '+380671112233',
      email: 'oleksandr@example.com',
      city: '',
      projectDescription: '',
      privacyAccepted: true,
      website: '',
    });
    fixture.detectChanges();

    const retryPending = component.submitLead();
    const retry = http.expectOne(submissionUrl());
    expect(retry.request.body.idempotency_key).toBe(keyBefore);
    expect(retry.request.body.phone).toBe('+380671112233');
    retry.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      submission_token: '',
      uploads: [],
      request_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      lead_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    await retryPending;
    fixture.detectChanges();

    expect(component.idempotencyKey()).not.toBe(keyBefore);
    http.verify();
  });
});
