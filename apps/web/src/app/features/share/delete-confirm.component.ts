import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { VIDEO_SHARING } from '../../core/config/features';
import { IconComponent } from '../../ui/icon/icon.component';

/**
 * The bottom sheet before deleting a wrap: what goes, said concretely, and "Cancelar" always in
 * reach. Red only on the icon and the destructive button. Focus starts on "Cancelar", so a stray
 * Enter deletes nothing; Escape and the scrim cancel too, except while the deletion runs.
 */
@Component({
  selector: 'gw-delete-confirm',
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The scrim is a pointer shortcut; Escape and "Cancelar" do the same from the keyboard. -->
    <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <div class="scrim" (click)="cancel()"></div>
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      aria-describedby="delete-lead"
      (keydown.escape)="cancel()"
    >
      <span class="handle" aria-hidden="true"></span>
      <span class="badge" aria-hidden="true"><gw-icon name="trash" /></span>
      <h2 id="delete-title">{{ 'share.delete.title' | transloco: { year: year() } }}</h2>
      <p id="delete-lead" class="lead">{{ 'share.delete.lead' | transloco }}</p>
      <ul>
        <li>{{ 'share.delete.items.data' | transloco }}</li>
        @if (video) {
          <li>{{ 'share.delete.items.video' | transloco }}</li>
        }
        <li>{{ 'share.delete.items.link' | transloco }}</li>
      </ul>
      <p class="again">{{ 'share.delete.again' | transloco }}</p>

      @if (error(); as key) {
        <p class="error" role="alert">
          <gw-icon name="alert" />
          {{ 'share.delete.errors.' + key | transloco }}
        </p>
      }

      <div class="actions">
        <button
          type="button"
          class="gw-button danger"
          [disabled]="busy()"
          (click)="confirmed.emit()"
        >
          {{ (busy() ? 'share.delete.deleting' : 'share.delete.confirm') | transloco }}
        </button>
        <button
          #cancelButton
          type="button"
          class="gw-button gw-button--secondary"
          [disabled]="busy()"
          (click)="cancel()"
        >
          {{ 'share.delete.cancel' | transloco }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--gw-z-scrim);
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: var(--gw-scrim);
      -webkit-backdrop-filter: blur(2px);
      backdrop-filter: blur(2px);
    }
    .sheet {
      position: relative;
      z-index: var(--gw-z-sheet);
      margin: var(--gw-space-2);
      padding: var(--gw-space-3) var(--gw-space-6) var(--gw-space-6);
      border: 1px solid var(--gw-hair-strong);
      border-radius: var(--gw-radius-sheet);
      background: var(--gw-ink-raised);
      box-shadow: 0 -20px 60px rgb(0 0 0 / 0.5);
    }
    .handle {
      display: block;
      width: 40px;
      height: 5px;
      margin: 0 auto var(--gw-space-5);
      border-radius: 3px;
      background: var(--gw-hair-strong);
    }
    .badge {
      --gw-icon-size: 22px;
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border: 1px solid rgb(248 113 113 / 0.25);
      border-radius: var(--gw-radius-lg);
      background: rgb(248 113 113 / 0.12);
      color: var(--gw-danger);
    }
    h2 {
      margin: var(--gw-space-4) 0 0;
      font: 600 var(--gw-text-xl) / 1.2 var(--gw-font-sans);
      letter-spacing: -0.025em;
      text-wrap: balance;
    }
    .lead,
    .again {
      margin: var(--gw-space-2) 0 0;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-base);
    }
    .again {
      margin-top: var(--gw-space-3);
      font-size: var(--gw-text-sm);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin: var(--gw-space-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--gw-text-soft);
      font-size: var(--gw-text-sm);
    }
    li {
      display: flex;
      gap: 9px;
      align-items: center;
    }
    li::before {
      content: '';
      flex: none;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--gw-danger);
    }
    .error {
      display: flex;
      gap: var(--gw-space-2);
      align-items: flex-start;
      margin: var(--gw-space-4) 0 0;
      color: var(--gw-danger-text);
      font-size: var(--gw-text-sm);
      line-height: 1.4;
    }
    .error gw-icon {
      margin-top: 2px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--gw-space-3);
      margin-top: var(--gw-space-6);
    }
    .danger {
      background: var(--gw-danger);
      color: #1b0a0a;
    }
    .danger:not(:disabled):hover {
      background: #fb8f8f;
    }
    @media (prefers-reduced-motion: no-preference) {
      .scrim {
        animation: dc-fade var(--gw-dur) var(--gw-ease-out);
      }
      .sheet {
        animation: dc-rise var(--gw-dur-slow) var(--gw-ease-out);
      }
    }
    @keyframes dc-fade {
      from {
        opacity: 0;
      }
    }
    @keyframes dc-rise {
      from {
        transform: translateY(24px);
        opacity: 0;
      }
    }
  `,
})
export class DeleteConfirmComponent {
  readonly year = input.required<number>();
  /** While the deletion runs: nothing can be pressed or dismissed. */
  readonly busy = input(false);
  /** A `share.delete.errors` key. */
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly video = inject(VIDEO_SHARING);
  private readonly cancelButton = viewChild.required<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    afterNextRender(() => this.cancelButton().nativeElement.focus());
  }

  protected cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }
}
