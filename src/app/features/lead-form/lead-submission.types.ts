export interface LeadFileDescriptor {
  client_file_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

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
  files: LeadFileDescriptor[];
}

export interface LeadUploadDescriptor {
  file_id: string;
  client_file_id: string;
  method: 'PUT';
  upload_url: string;
  headers: Record<string, string>;
  expires_at: string;
}

export interface LeadCreateResponse {
  submission_id: string;
  status: 'awaiting_upload' | 'accepted';
  duplicate: boolean;
  submission_token: string;
  uploads: LeadUploadDescriptor[];
  request_id: string;
  lead_id: string | null;
}

export interface LeadCompleteFile {
  file_id: string;
  etag?: string;
}

export interface LeadCompleteRequest {
  files: LeadCompleteFile[];
}

export interface LeadCompleteResponse {
  id: string;
  submission_id: string;
  status: 'accepted';
  duplicate: boolean;
  file_count: number;
  request_id: string;
}

export interface LeadSubmitResult {
  lead_id: string | null;
  submission_id: string;
  status: 'accepted';
  duplicate: boolean;
  request_id: string;
  file_count: number;
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
  | 'uploading'
  | 'completing'
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
  files: 'Attachments',
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
  files: LeadFileDescriptor[];
}): LeadSubmissionRequest {
  const { model, idempotencyKey, privacyPolicyVersion, pageUrl, botToken, files } = input;

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
    files,
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
