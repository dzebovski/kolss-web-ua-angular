import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  required,
  submit,
  validate,
} from '@angular/forms/signals';

import { isTurnstileEnabled, PRIVACY_POLICY_VERSION } from '../../core/config/public-config';
import { LeadSubmissionApiError, LeadSubmissionService } from './lead-submission.service';
import {
  EMPTY_LEAD_FORM,
  FIELD_LABELS,
  LeadFormModel,
  LeadFormStatus,
  buildLeadSubmissionRequest,
  createIdempotencyKey,
  mapApiFieldToFormField,
} from './lead-submission.types';
import { TurnstileWidget } from './turnstile-widget';

@Component({
  selector: 'app-lead-form',
  imports: [FormField, RouterLink, TurnstileWidget],
  templateUrl: './lead-form.html',
  styleUrl: './lead-form.scss',
})
export class LeadForm {
  private readonly leadService = inject(LeadSubmissionService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly turnstile = viewChild(TurnstileWidget);

  protected readonly model = signal<LeadFormModel>({ ...EMPTY_LEAD_FORM });
  protected readonly status = signal<LeadFormStatus>('idle');
  protected readonly statusMessage = signal('');
  protected readonly serverFieldErrors = signal<Record<string, string>>({});
  protected readonly idempotencyKey = signal(createIdempotencyKey());
  protected readonly botToken = signal('');
  protected readonly turnstileEnabled = isTurnstileEnabled();

  protected readonly leadForm = form(this.model, (schemaPath) => {
    required(schemaPath.name, { message: 'Name is required' });
    minLength(schemaPath.name, 2, { message: 'Name must be at least 2 characters' });
    maxLength(schemaPath.name, 200, { message: 'Name must be at most 200 characters' });

    required(schemaPath.phone, { message: 'Phone is required' });
    minLength(schemaPath.phone, 7, { message: 'Phone must be at least 7 characters' });
    maxLength(schemaPath.phone, 50, { message: 'Phone must be at most 50 characters' });

    email(schemaPath.email, { message: 'Enter a valid email address' });
    maxLength(schemaPath.email, 254, { message: 'Email must be at most 254 characters' });

    maxLength(schemaPath.city, 200, { message: 'City must be at most 200 characters' });
    maxLength(schemaPath.projectDescription, 5000, {
      message: 'Project description must be at most 5000 characters',
    });

    validate(schemaPath.privacyAccepted, ({ value }) => {
      if (!value()) {
        return { kind: 'required', message: 'Please accept the privacy policy to continue' };
      }
      return undefined;
    });

    maxLength(schemaPath.website, 200, { message: 'Website must be at most 200 characters' });
  });

  protected readonly isBusy = computed(() => {
    return this.status() === 'creating';
  });
  protected readonly isSuccess = computed(() => this.status() === 'success');
  protected readonly isFailure = computed(() => this.status() === 'failure');

  protected readonly errorSummary = computed(() => {
    const items: { field: string; label: string; message: string }[] = [];
    const seen = new Set<string>();

    const push = (field: string, message: string) => {
      if (!message || seen.has(field)) {
        return;
      }
      seen.add(field);
      items.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        message,
      });
    };

    const fields: (keyof LeadFormModel)[] = [
      'name',
      'phone',
      'email',
      'city',
      'projectDescription',
      'privacyAccepted',
    ];

    for (const field of fields) {
      const state = this.leadForm[field]();
      if (state.touched() && state.errors().length > 0) {
        push(field, state.errors()[0].message ?? 'Invalid value');
      }
    }

    for (const [field, message] of Object.entries(this.serverFieldErrors())) {
      push(field, message);
    }

    return items;
  });

  protected fieldError(field: keyof LeadFormModel): string {
    const serverError = this.serverFieldErrors()[field];
    if (serverError) {
      return serverError;
    }

    const state = this.leadForm[field]();
    if (!state.touched() || state.errors().length === 0) {
      return '';
    }
    return state.errors()[0].message ?? '';
  }

  protected onBotToken(token: string): void {
    this.botToken.set(token);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.submitLead();
  }

  protected async submitLead(): Promise<void> {
    if (this.isBusy()) {
      return;
    }

    await submit(this.leadForm, async () => {
      this.serverFieldErrors.set({});
      this.status.set('creating');
      this.statusMessage.set('Sending your request…');

      const request = buildLeadSubmissionRequest({
        model: this.model(),
        idempotencyKey: this.idempotencyKey(),
        privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        pageUrl: this.currentPageUrl(),
        botToken: this.botToken(),
      });

      try {
        const response = await this.leadService.submit(request);

        this.status.set('success');
        this.statusMessage.set(
          response.duplicate
            ? 'We already received this request. Thank you.'
            : 'Thank you. Your request was sent successfully.',
        );
        this.resetAfterSuccess();
      } catch (error) {
        this.handleSubmitError(error);
        this.turnstile()?.reset();
      }
    });
  }

  protected resetForm(): void {
    this.model.set({ ...EMPTY_LEAD_FORM });
    this.leadForm().reset();
    this.serverFieldErrors.set({});
    this.botToken.set('');
    this.status.set('idle');
    this.statusMessage.set('');
    this.idempotencyKey.set(createIdempotencyKey());
    this.turnstile()?.reset();
  }

  private resetAfterSuccess(): void {
    this.model.set({ ...EMPTY_LEAD_FORM });
    this.leadForm().reset();
    this.serverFieldErrors.set({});
    this.botToken.set('');
    this.idempotencyKey.set(createIdempotencyKey());
    this.turnstile()?.reset();
  }

  private handleSubmitError(error: unknown): void {
    this.status.set('failure');

    if (error instanceof LeadSubmissionApiError) {
      const mapped: Record<string, string> = {};
      for (const detail of error.details) {
        const formField = mapApiFieldToFormField(detail.field);
        if (formField) {
          mapped[formField] = detail.message;
        }
      }
      this.serverFieldErrors.set(mapped);
      this.statusMessage.set(error.message || 'Something went wrong. Please try again.');
      return;
    }

    this.statusMessage.set('Something went wrong. Please try again.');
  }

  private currentPageUrl(): string | undefined {
    if (!isPlatformBrowser(this.platformId)) {
      return undefined;
    }
    return window.location.href;
  }
}
