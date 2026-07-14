export interface LeadSubmissionRequest {
  idempotency_key: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  project_description: string | null;
  privacy_accepted: boolean;
  privacy_policy_version: string;
  page_url: string | null;
  bot_token: string;
  website: string;
}

export interface LeadCreateResponse {
  submission_id: string;
  status: 'accepted';
  duplicate: boolean;
  request_id: string;
  lead_id: string;
}

export interface LeadSubmitResult {
  lead_id: string;
  submission_id: string;
  status: 'accepted';
  duplicate: boolean;
  request_id: string;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiFieldError[];
  };
  request_id: string;
}

export type LeadFormStatus =
  | 'idle'
  | 'creating'
  | 'success'
  | 'failure';

export interface LeadFormModel {
  name: string;
  phone: string;
  email: string;
  city: string;
  projectDescription: string;
  privacyAccepted: boolean;
  website: string;
}

export const EMPTY_LEAD_FORM: LeadFormModel = {
  name: '',
  phone: '',
  email: '',
  city: '',
  projectDescription: '',
  privacyAccepted: false,
  website: '',
};

export const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  city: 'City',
  project_description: 'Project description',
  projectDescription: 'Project description',
  privacy_accepted: 'Privacy consent',
  privacyAccepted: 'Privacy consent',
  website: 'Website',
  idempotency_key: 'Submission',
  page_url: 'Page URL',
  privacy_policy_version: 'Privacy policy version',
  bot_token: 'Bot verification',
};

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function optionalTrimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildLeadSubmissionRequest(input: {
  model: LeadFormModel;
  idempotencyKey: string;
  privacyPolicyVersion: string;
  pageUrl?: string | null;
  botToken: string;
}): LeadSubmissionRequest {
  const { model, idempotencyKey, privacyPolicyVersion, pageUrl, botToken } = input;

  return {
    idempotency_key: idempotencyKey,
    name: model.name.trim(),
    phone: model.phone.trim(),
    email: optionalTrimmedOrNull(model.email),
    city: optionalTrimmedOrNull(model.city),
    project_description: optionalTrimmedOrNull(model.projectDescription),
    privacy_accepted: model.privacyAccepted,
    privacy_policy_version: privacyPolicyVersion,
    page_url: pageUrl?.trim() ? pageUrl.trim() : null,
    bot_token: botToken,
    website: model.website,
  };
}

export function mapApiFieldToFormField(field: string): keyof LeadFormModel | null {
  switch (field) {
    case 'name':
      return 'name';
    case 'phone':
      return 'phone';
    case 'email':
      return 'email';
    case 'city':
      return 'city';
    case 'project_description':
      return 'projectDescription';
    case 'privacy_accepted':
      return 'privacyAccepted';
    case 'website':
      return 'website';
    default:
      return null;
  }
}
