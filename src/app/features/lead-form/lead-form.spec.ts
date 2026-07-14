import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL, SITE_CODE } from '../../core/config/public-config';
import { LeadForm } from './lead-form';
import { LeadSubmissionApiError, LeadSubmissionService } from './lead-submission.service';
import {
  EMPTY_LEAD_FORM,
  buildLeadSubmissionRequest,
  mapApiFieldToFormField,
} from './lead-submission.types';

const submissionUrl = () => `${API_BASE_URL}/v1/public/sites/${SITE_CODE}/lead-submissions`;

type LeadFormHarness = LeadForm & {
  idempotencyKey: () => string;
  model: { set: (value: unknown) => void };
  status: () => string;
  submitLead: () => Promise<void>;
  botToken: { set: (value: string) => void };
};

async function whenRequest(http: HttpTestingController) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const matches = http.match(submissionUrl());
    if (matches.length === 1) {
      return matches[0];
    }
    await Promise.resolve();
  }
  return http.expectOne(submissionUrl());
}

describe('lead submission mapping', () => {
  it('builds the text-only request contract', () => {
    const request = buildLeadSubmissionRequest({
      model: {
        ...EMPTY_LEAD_FORM,
        name: '  Oleksandr Shevchenko  ',
        phone: ' +380501112233 ',
        privacyAccepted: true,
      },
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      privacyPolicyVersion: 'ua-v1',
      pageUrl: 'http://localhost:4201/',
      botToken: 'turnstile-token',
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
    });
    expect(request).not.toHaveProperty('files');
  });

  it('maps API field names onto form model keys', () => {
    expect(mapApiFieldToFormField('project_description')).toBe('projectDescription');
    expect(mapApiFieldToFormField('privacy_accepted')).toBe('privacyAccepted');
    expect(mapApiFieldToFormField('unknown')).toBeNull();
  });

  it('normalizes provided optional fields', () => {
    const request = buildLeadSubmissionRequest({
      model: {
        ...EMPTY_LEAD_FORM,
        name: ' Anna ',
        phone: ' +380501112233 ',
        email: ' anna@example.com ',
        city: ' Kyiv ',
        projectDescription: ' Kitchen project ',
        privacyAccepted: true,
      },
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      privacyPolicyVersion: 'ua-v1',
      pageUrl: ' https://kolss.ua/contact ',
      botToken: 'token',
    });

    expect(request.email).toBe('anna@example.com');
    expect(request.city).toBe('Kyiv');
    expect(request.project_description).toBe('Kitchen project');
    expect(request.page_url).toBe('https://kolss.ua/contact');
  });
});

describe('LeadSubmissionService', () => {
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
    TestBed.resetTestingModule();
  });

  it('uses exactly one POST and returns the accepted lead', async () => {
    const pending = service.submit({
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
    });

    const request = http.expectOne(submissionUrl());
    expect(request.request.method).toBe('POST');
    expect(request.request.body).not.toHaveProperty('files');
    request.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      request_id: 'rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr',
      lead_id: 'llllllll-llll-4lll-8lll-llllllllllll',
    });

    await expect(pending).resolves.toMatchObject({
      status: 'accepted',
      lead_id: 'llllllll-llll-4lll-8lll-llllllllllll',
    });
    expect(http.match((request) => request.url.includes('/complete'))).toHaveLength(0);
  });

  it('preserves API error code, request ID, and field details', async () => {
    const pending = service.submit({
      idempotency_key: '11111111-1111-4111-8111-111111111111',
      name: 'Oleksandr',
      phone: 'x',
      email: null,
      city: null,
      project_description: null,
      privacy_accepted: true,
      privacy_policy_version: 'ua-v1',
      page_url: null,
      bot_token: '',
      website: '',
    });

    const request = http.expectOne(submissionUrl());
    request.flush(
      {
        error: {
          code: 'validation_error',
          message: 'Validation failed',
          details: [{ field: 'phone', message: 'invalid phone' }],
        },
        request_id: '66666666-6666-4666-8666-666666666666',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    await expect(pending).rejects.toMatchObject({
      name: 'LeadSubmissionApiError',
      code: 'validation_error',
      requestId: '66666666-6666-4666-8666-666666666666',
      details: [{ field: 'phone', message: 'invalid phone' }],
    } satisfies Partial<LeadSubmissionApiError>);
  });
});

describe('LeadForm', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [LeadForm],
      providers: [provideRouter([]), provideHttpClient(withFetch()), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('has no file input and shows required validation errors', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    await component.submitLead();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Name is required');
    expect(fixture.nativeElement.textContent).toContain('Phone is required');
    expect(fixture.nativeElement.textContent).toContain('Please accept the privacy policy');
  });

  it('rotates the idempotency key only after a successful submission', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    await fixture.whenStable();

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

    const pending = component.submitLead();
    const request = await whenRequest(http);
    expect(request.request.body.idempotency_key).toBe(keyBefore);
    expect(request.request.body).not.toHaveProperty('files');
    request.flush({
      submission_id: 'ssssssss-ssss-4sss-8sss-ssssssssssss',
      status: 'accepted',
      duplicate: false,
      request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lead_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await pending;
    await fixture.whenStable();
    expect(component.idempotencyKey()).not.toBe(keyBefore);
    expect(fixture.nativeElement.textContent).toContain('sent successfully');
  });

  it('keeps the idempotency key and displays the API message after failure', async () => {
    const fixture = TestBed.createComponent(LeadForm);
    const component = fixture.componentInstance as LeadFormHarness;
    await fixture.whenStable();

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
    component.botToken.set('bot-token');

    const pending = component.submitLead();
    const request = await whenRequest(http);
    request.flush(
      {
        error: { code: 'internal_error', message: 'Temporary failure' },
        request_id: '77777777-7777-4777-8777-777777777777',
      },
      { status: 500, statusText: 'Server Error' },
    );

    await pending;
    await fixture.whenStable();
    expect(component.status()).toBe('failure');
    expect(component.idempotencyKey()).toBe(keyBefore);
    expect(fixture.nativeElement.textContent).toContain('Temporary failure');
  });
});
