import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { qrMatrix } from '@wrapped/art';
import { IconComponent } from '../../ui/icon/icon.component';

/** Modules of light paper around the code, so any phone camera finds its edges. */
const QUIET_ZONE = 2;

/** One path of horizontal runs: no hairline seams between modules, and one DOM node. */
function qrPath(url: string): { size: number; d: string } {
  const matrix = qrMatrix(url);
  let d = '';
  matrix.forEach((row, r) => {
    for (let c = 0; c < row.length;) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (row[c]) c++;
      d += `M${start + QUIET_ZONE},${r + QUIET_ZONE}h${c - start}v1h${start - c}z`;
    }
  });
  return { size: matrix.length + QUIET_ZONE * 2, d };
}

/**
 * The QR of the public page, big and dark on light so someone can scan it in person (a meetup,
 * an interview). The web can't raise the brightness, so it suggests it; the URL is printed below
 * in case the camera can't read it.
 */
@Component({
  selector: 'gw-qr-fullscreen',
  imports: [TranslocoPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="'share.qr.dialog' | transloco"
      (keydown.escape)="closed.emit()"
    >
      <button
        #closeButton
        type="button"
        class="close"
        [attr.aria-label]="'share.qr.close' | transloco"
        (click)="closed.emit()"
      >
        <gw-icon name="x" />
      </button>

      <div class="body">
        <p class="lead">{{ 'share.qr.lead' | transloco }}</p>
        <div class="qr">
          <svg
            [attr.viewBox]="'0 0 ' + code().size + ' ' + code().size"
            shape-rendering="crispEdges"
            aria-hidden="true"
          >
            <path [attr.d]="code().d" />
          </svg>
        </div>
        <p class="who">&#64;{{ login() }} · {{ year() }}</p>
        <p class="url gw-mono">{{ displayUrl() }}</p>
        <p class="hint">
          <gw-icon name="sun" />
          {{ 'share.qr.hint' | transloco }}
        </p>
      </div>

      <button type="button" class="gw-button gw-button--secondary copy" (click)="copyLink.emit()">
        <gw-icon [name]="copied() ? 'check' : 'copy'" />
        {{ (copied() ? 'share.url.copied' : 'share.url.copy') | transloco }}
      </button>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--gw-z-sheet);
    }
    .dialog {
      display: flex;
      flex-direction: column;
      height: 100%;
      /* Room for the close button above, the copy button below. */
      padding: calc(var(--gw-space-12) + var(--gw-space-4) + env(safe-area-inset-top, 0px))
        var(--gw-space-6) calc(var(--gw-space-6) + env(safe-area-inset-bottom, 0px));
      background:
        radial-gradient(80% 50% at 50% 38%, rgb(184 208 220 / 0.1), transparent 70%),
        var(--gw-ink-deep);
    }
    .close {
      position: absolute;
      top: calc(var(--gw-space-4) + env(safe-area-inset-top, 0px));
      right: var(--gw-space-4);
      display: grid;
      place-items: center;
      width: var(--gw-hit);
      height: var(--gw-hit);
      padding: 0;
      border: 1px solid var(--gw-hair);
      border-radius: 50%;
      background: var(--gw-glass);
      color: var(--gw-text);
      cursor: pointer;
      -webkit-backdrop-filter: var(--gw-blur);
      backdrop-filter: var(--gw-blur);
    }
    .close:hover {
      background: var(--gw-glass-strong);
    }
    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--gw-space-4);
      min-height: 0;
      text-align: center;
    }
    p {
      margin: 0;
    }
    .lead {
      color: var(--gw-text-muted);
      font-size: var(--gw-text-sm);
    }
    .qr {
      display: grid;
      place-items: center;
      width: min(100%, 300px);
      aspect-ratio: 1;
      padding: 6%;
      border-radius: 28px;
      background: #f4f7f9;
      box-shadow: 0 30px 80px rgb(184 208 220 / 0.12);
    }
    .qr svg {
      width: 100%;
      height: 100%;
      fill: var(--gw-ink);
    }
    .who {
      margin-top: var(--gw-space-1);
      font: 600 var(--gw-text-lg) / 1.2 var(--gw-font-sans);
      letter-spacing: -0.02em;
    }
    .url {
      margin-top: calc(var(--gw-space-2) * -1);
      max-width: 100%;
      overflow-wrap: anywhere;
      color: var(--gw-text-muted);
      font-size: var(--gw-text-xs);
      user-select: all;
    }
    .hint {
      display: flex;
      gap: var(--gw-space-2);
      align-items: center;
      margin-top: var(--gw-space-1);
      color: var(--gw-text-muted);
      font-size: var(--gw-text-xs);
    }
    .copy {
      flex: none;
      margin-top: var(--gw-space-4);
    }
    @media (prefers-reduced-motion: no-preference) {
      .dialog {
        animation: qr-in var(--gw-dur) var(--gw-ease-out);
      }
      .qr {
        animation: qr-grow var(--gw-dur-slow) var(--gw-ease-out);
      }
    }
    @keyframes qr-in {
      from {
        opacity: 0;
      }
    }
    @keyframes qr-grow {
      from {
        transform: scale(0.94);
      }
    }
  `,
})
export class QrFullscreenComponent {
  /** The full public URL the code encodes. */
  readonly url = input.required<string>();
  readonly login = input.required<string>();
  readonly year = input.required<number>();
  /** The share screen copies; this only shows that it did. */
  readonly copied = input(false);
  readonly copyLink = output<void>();
  readonly closed = output<void>();

  protected readonly code = computed(() => qrPath(this.url()));
  protected readonly displayUrl = computed(() => this.url().replace(/^https?:\/\//, ''));
  private readonly closeButton = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    afterNextRender(() => this.closeButton().nativeElement.focus());
  }
}
