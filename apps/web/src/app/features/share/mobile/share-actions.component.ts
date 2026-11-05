import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { GridLoaderComponent } from '../../../ui/grid-loader/grid-loader.component';
import { IconComponent } from '../../../ui/icon/icon.component';

/** `ready` only when the PNGs of the version on screen exist, so no shared link lacks its preview. */
export type ImagesState = 'pending' | 'ready' | 'failed';

/**
 * The video of the current data: `none` hides the icon (videos off, or a wrap from before them),
 * `pending` while it waits or renders, `ready` to download, `failed` until the owner retries.
 */
export type VideoState = 'none' | 'pending' | 'ready' | 'failed';

export interface ShareIntents {
  x: string;
  linkedin: string;
}

/**
 * Imagen, Video, LinkedIn, X and QR as round glass icons with a label under each. The ones
 * that need the PNGs show the mini GridLoader and do nothing until they exist; if the render
 * failed, Imagen turns into a neutral "Reintentar" and the networks dim. Video has its own
 * loader, then a green dot when its MP4 is ready (its retry lives in the status line below).
 */
@Component({
  selector: 'gw-share-actions',
  imports: [NgTemplateOutlet, TranslocoPipe, GridLoaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './share-actions.component.html',
  styleUrl: './share-actions.component.css',
})
export class ShareActionsComponent {
  readonly images = input.required<ImagesState>();
  /** The card PNG of the version on screen, once it is ready. */
  readonly imageUrl = input<string | null>(null);
  readonly fileName = input.required<string>();
  readonly intents = input<ShareIntents | null>(null);
  readonly retrying = input(false);
  readonly video = input<VideoState>('none');
  /** The MP4 of the current data, once it is ready. */
  readonly videoUrl = input<string | null>(null);
  readonly videoFileName = input('');
  readonly retry = output<void>();
  readonly showQr = output<void>();

  private readonly qrButton = viewChild.required<ElementRef<HTMLButtonElement>>('qrButton');

  /** Where focus goes back when the full-screen QR closes. */
  focusQr(): void {
    this.qrButton().nativeElement.focus();
  }
}
