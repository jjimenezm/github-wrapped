import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Wraps the mobile tree. On phones it is just the screen; from the desktop breakpoint
 * (`DESKTOP_QUERY`) CSS draws a device and scales it to fit the viewport height. The
 * markup never changes, so server and client HTML are identical at any width.
 */
@Component({
  selector: 'gw-phone-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pf-stage">
      <div class="pf-device">
        <div class="pf-screen">
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .pf-screen {
      position: relative;
      isolation: isolate;
      min-height: var(--gw-screen-h);
      /* Grain, a cold light from the top left and a faint bounce at the bottom right. */
      background:
        var(--gw-grain),
        radial-gradient(120% 60% at 18% -10%, var(--gw-light), transparent 60%) 0 0 / 100%
          var(--gw-screen-h) no-repeat,
        radial-gradient(90% 50% at 100% 105%, var(--gw-light-low), transparent 60%) 0 0 / 100%
          var(--gw-screen-h) no-repeat,
        var(--gw-ink);
      background-blend-mode: overlay, normal, normal;
    }

    @media (min-width: 768px) {
      :host {
        --gw-screen-h: var(--gw-device-h);
        --pf-gap: var(--gw-space-6);
        --pf-scale: 1;
      }
      @supports (width: calc(1px * tan(atan2(1px, 2px)))) {
        :host {
          /* tan(atan2(a, b)) divides two lengths: scale = available height / device height. */
          --pf-scale: min(1, tan(atan2(100dvh - 2 * var(--pf-gap), var(--gw-device-h))));
        }
      }
      .pf-stage {
        display: grid;
        place-items: center;
        height: 100dvh;
        overflow: hidden;
        background:
          radial-gradient(55% 60% at 0% 100%, var(--gw-stage-glow), transparent 70%),
          var(--gw-ink-deep);
      }
      .pf-device {
        position: relative;
        width: calc(var(--gw-device-w) * var(--pf-scale));
        height: calc(var(--gw-device-h) * var(--pf-scale));
        border-radius: calc(var(--gw-device-radius) * var(--pf-scale));
        box-shadow:
          0 40px 90px rgb(0 0 0 / 0.55),
          0 0 0 1px var(--gw-hair);
      }
      .pf-screen {
        position: absolute;
        top: 0;
        left: 0;
        width: var(--gw-device-w);
        height: var(--gw-device-h);
        overflow: hidden auto;
        overscroll-behavior: contain;
        scrollbar-width: none;
        border-radius: var(--gw-device-radius);
        box-shadow: inset 0 0 0 1px var(--gw-edge-light);
        transform: scale(var(--pf-scale));
        transform-origin: 0 0;
      }
      .pf-screen::-webkit-scrollbar {
        display: none;
      }
    }
  `,
})
export class PhoneFrameComponent {}
