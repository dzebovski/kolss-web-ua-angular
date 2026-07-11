import { createIdempotencyKey, LeadFileDescriptor } from './lead-submission.types';

export const MAX_LEAD_FILES = 5;
export const MAX_LEAD_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_LEAD_TOTAL_FILE_BYTES = 25 * 1024 * 1024;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const ALLOWED_LEAD_FILE_EXTENSIONS = Object.keys(CONTENT_TYPE_BY_EXT);

export interface SelectedLeadFile {
  clientFileId: string;
  file: File;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export type LeadFileValidationError =
  | { kind: 'too_many'; message: string }
  | { kind: 'too_large'; message: string; filename: string }
  | { kind: 'unsupported'; message: string; filename: string }
  | { kind: 'empty'; message: string; filename: string }
  | { kind: 'total_too_large'; message: string };

function extensionOf(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  if (dot < 0) {
    return '';
  }
  return base.slice(dot).toLowerCase();
}

export function contentTypeForFilename(filename: string): string | null {
  return CONTENT_TYPE_BY_EXT[extensionOf(filename)] ?? null;
}

export function validateAndBuildSelectedFiles(
  incoming: FileList | File[],
  existing: SelectedLeadFile[],
): { files: SelectedLeadFile[]; error: LeadFileValidationError | null } {
  const list = Array.from(incoming);
  const next = [...existing];

  for (const file of list) {
    if (next.length >= MAX_LEAD_FILES) {
      return {
        files: existing,
        error: {
          kind: 'too_many',
          message: `You can attach at most ${MAX_LEAD_FILES} files.`,
        },
      };
    }

    const filename = file.name.split(/[/\\]/).pop() || file.name;
    const contentType = contentTypeForFilename(filename);
    if (!contentType) {
      return {
        files: existing,
        error: {
          kind: 'unsupported',
          filename,
          message: `"${filename}" is not an allowed type. Use PDF, TXT, CSV, JPG, PNG, or WEBP.`,
        },
      };
    }

    if (file.size < 1) {
      return {
        files: existing,
        error: {
          kind: 'empty',
          filename,
          message: `"${filename}" is empty.`,
        },
      };
    }

    if (file.size > MAX_LEAD_FILE_BYTES) {
      return {
        files: existing,
        error: {
          kind: 'too_large',
          filename,
          message: `"${filename}" exceeds the 5 MiB limit.`,
        },
      };
    }

    next.push({
      clientFileId: createIdempotencyKey(),
      file,
      filename,
      contentType,
      sizeBytes: file.size,
    });
  }

  const total = next.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (total > MAX_LEAD_TOTAL_FILE_BYTES) {
    return {
      files: existing,
      error: {
        kind: 'total_too_large',
        message: 'Total attachment size must be at most 25 MiB.',
      },
    };
  }

  return { files: next, error: null };
}

export function toLeadFileDescriptors(files: SelectedLeadFile[]): LeadFileDescriptor[] {
  return files.map((item) => ({
    client_file_id: item.clientFileId,
    filename: item.filename,
    content_type: item.contentType,
    size_bytes: item.sizeBytes,
  }));
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
