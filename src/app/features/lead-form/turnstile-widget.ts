import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';

import { resolveTurnstileSiteKey } from '../../core/config/public-config';

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile requires a browser'));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error('Turnstile failed to load'));
        }
      });
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve(window.turnstile);
      } else {
        reject(new Error('Turnstile failed to load'));
      }
    };
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

@Component({
  selector: 'app-turnstile',
  template: `
    @if (enabled()) {
      <div class="turnstile" aria-live="polite">
        <div #container id="turnstile-container"></div>
        @if (loadError()) {
          <p class="turnstile__error" role="alert">
            Bot verification failed to load.
            <button type="button" class="turnstile__retry" (click)="retry()">Try again</button>
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .turnstile {
      min-height: 1.5rem;
    }
    .turnstile__error {
      margin: 0.5rem 0 0;
      font-size: 0.85rem;
      color: var(--color-alert, #b42318);
    }
    .turnstile__retry {
      appearance: none;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-decoration: underline;
      cursor: pointer;
      padding: 0;
    }
  `,
})
export class TurnstileWidget implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly container = viewChild<ElementRef<HTMLDivElement>>('container');

  /** Cloudflare Turnstile action name. */
  readonly action = input('lead_submission');

  readonly tokenChange = output<string>();

  protected readonly enabled = signal(false);
  protected readonly loadError = signal(false);
  readonly token = signal('');

  private widgetId: string | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => {
      void this.mount();
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.teardown();
  }

  /** Clears the current token and asks Turnstile for a fresh challenge. */
  reset(): void {
    this.clearToken();
    if (!isPlatformBrowser(this.platformId) || !window.turnstile || !this.widgetId) {
      return;
    }
    window.turnstile.reset(this.widgetId);
  }

  protected retry(): void {
    this.loadError.set(false);
    this.teardown();
    void this.mount();
  }

  private async mount(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const sitekey = resolveTurnstileSiteKey();
    this.enabled.set(sitekey.length > 0);
    if (!sitekey) {
      this.clearToken();
      return;
    }

    try {
      const api = await loadTurnstileScript();
      if (this.destroyed) {
        return;
      }

      const el = this.container()?.nativeElement;
      if (!el) {
        return;
      }

      this.teardown();
      this.widgetId = api.render(el, {
        sitekey,
        action: this.action(),
        callback: (value) => this.setToken(value),
        'expired-callback': () => this.clearToken(),
        'error-callback': () => {
          this.clearToken();
          this.loadError.set(true);
        },
        theme: 'auto',
      });
      this.loadError.set(false);
    } catch {
      if (!this.destroyed) {
        this.loadError.set(true);
        this.clearToken();
      }
    }
  }

  private setToken(value: string): void {
    this.token.set(value);
    this.tokenChange.emit(value);
  }

  private clearToken(): void {
    this.token.set('');
    this.tokenChange.emit('');
  }

  private teardown(): void {
    if (this.widgetId && typeof window !== 'undefined' && window.turnstile) {
      try {
        window.turnstile.remove(this.widgetId);
      } catch {
        // Widget may already be gone during HMR / destroy races.
      }
    }
    this.widgetId = null;
    const el = this.container()?.nativeElement;
    if (el) {
      el.replaceChildren();
    }
  }
}
