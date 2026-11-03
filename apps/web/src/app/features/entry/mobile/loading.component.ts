import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GridLoaderComponent } from '../../../ui/grid-loader/grid-loader.component';

/** Each message stays this long; the entry also keeps the loader up at least this long. */
export const MESSAGE_INTERVAL_MS = 2500;

const MESSAGES = ['search', 'read', 'detect', 'prepare'] as const;
type MessageKey = (typeof MESSAGES)[number] | 'slow';

/**
 * Past the four steps, GitHub is slow: alternate an honest "still waiting" with the last step
 * instead of starting over, so the screen keeps moving without pretending to make progress.
 */
function messageAt(step: number): MessageKey {
  if (step < MESSAGES.length) return MESSAGES[step] as MessageKey;
  return (step - MESSAGES.length) % 2 === 0 ? 'slow' : 'prepare';
}

/** Screen 2: the GridLoader, the login being looked up and one rotating message (R2). */
@Component({
  selector: 'gw-loading',
  imports: [TranslocoPipe, GridLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ld-center">
      <gw-grid-loader />
      <p class="ld-login gw-mono">&#64;{{ login() }}</p>
      <p class="ld-message" aria-live="polite">
        @for (key of [messageKey()]; track key) {
          <span class="ld-text">{{ 'loading.' + key | transloco }}</span>
        }
      </p>
    </div>
    <button
      #cancelButton
      type="button"
      class="gw-button gw-button--quiet"
      (click)="cancelled.emit()"
    >
      {{ 'loading.cancel' | transloco }}
    </button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 var(--gw-space-8) var(--gw-space-5);
      text-align: center;
    }

    .ld-center {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--gw-space-5);
      /* Optical center: the top bar sits above, so lift the group by half its height. */
      padding-bottom: var(--gw-space-12);
    }

    .ld-login {
      margin: 0;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-sm);
    }

    .ld-message {
      max-width: 30ch;
      min-height: calc(2 * 1.35em);
      margin: 0;
      font: 500 var(--gw-text-lg) / 1.35 var(--gw-font-sans);
      letter-spacing: var(--gw-tracking-snug);
    }

    .ld-text {
      display: block;
    }

    @media (prefers-reduced-motion: no-preference) {
      .ld-text {
        animation: ld-in var(--gw-dur-slow) var(--gw-ease-out);
      }
    }

    @keyframes ld-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
  `,
})
export class LoadingComponent {
  readonly login = input.required<string>();
  readonly cancelled = output();

  private readonly step = signal(0);
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  protected readonly messageKey = computed(() => messageAt(this.step()));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const timer = setInterval(() => this.step.update((s) => s + 1), MESSAGE_INTERVAL_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
    // The form this replaces had focus; keep it on the screen's only action.
    afterNextRender(() => this.cancelButton().nativeElement.focus());
  }
}
