import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, Meta, Title, type MetaDefinition } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { renderCard } from '@wrapped/art';
import { periodChip, shareText, type PublicWrap } from '@wrapped/shared';
import { map } from 'rxjs';
import { PUBLIC_BASE_URL } from '../../core/config/public-base-url';
import { formatWait } from '../../core/i18n/format-wait';
import { formatShortDate } from '../../core/i18n/intl';
import { LocaleService } from '../../core/i18n/locale.service';
import { wrapPath } from '../../core/routing/wrap-url';
import { IconComponent } from '../../ui/icon/icon.component';
import { WordmarkComponent } from '../../ui/wordmark/wordmark.component';
import { EMPTY_SKY_SVG } from './empty-sky';
import { ManageLinkComponent } from './manage-link.component';
import type { PublicPage } from './public-wrap.resolver';

/** The size the renderer gives og.png (R14). */
const OG_IMAGE = { width: '1200', height: '630' };

const OG_LOCALE = { es: 'es_CL', en: 'en_US' } as const;

/** Every meta tag this page sets, so leaving it removes them all. */
const OWN_TAGS = [
  'name="description"',
  'name="robots"',
  'property="og:type"',
  'property="og:site_name"',
  'property="og:title"',
  'property="og:description"',
  'property="og:url"',
  'property="og:locale"',
  'property="og:image"',
  'property="og:image:width"',
  'property="og:image:height"',
  'property="og:image:alt"',
  'name="twitter:card"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
  'name="twitter:image:alt"',
];

/**
 * `/@login/year`, the page a shared link opens (R8), rendered on the server in the wrap's
 * language: the card first, "Ver mi año" for the slides, "Crea el tuyo" up top, and "¿Es tuyo?
 * Gestionar" in the footer, and the 30-second video under the card once it is ready. Without a
 * wrap it says why (404, 410) and invites to make one.
 */
@Component({
  selector: 'gw-public-wrap',
  imports: [RouterLink, TranslocoPipe, IconComponent, WordmarkComponent, ManageLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-wrap.component.html',
  styleUrl: './public-wrap.component.css',
})
export class PublicWrapComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private readonly baseUrl = inject(PUBLIC_BASE_URL);
  private readonly locale = inject(LocaleService).locale;
  private readonly page$ = (this.route.parent ?? this.route).data.pipe(
    map((data) => data['page'] as PublicPage),
  );

  protected readonly page = toSignal(this.page$, { requireSync: true });
  protected readonly wrap = computed(() => {
    const page = this.page();
    return page.kind === 'wrap' ? page.wrap : null;
  });
  protected readonly absent = computed(() => {
    const page = this.page();
    return page.kind === 'wrap' ? null : page;
  });
  protected readonly sky = this.sanitizer.bypassSecurityTrustHtml(EMPTY_SKY_SVG);

  // Our own markup from packages/art, which escapes every text it prints; the sanitizer would
  // strip the SVG. Without the entrance animation: hydration would replay it.
  protected readonly card = computed(() => {
    const wrap = this.wrap();
    if (!wrap) return null;
    return this.sanitizer.bypassSecurityTrustHtml(
      renderCard(wrap.snapshot, {
        style: wrap.cardStyle,
        locale: wrap.locale,
        format: 'portrait',
        publicBaseUrl: this.baseUrl,
        qr: 'code',
      }),
    );
  });

  protected readonly period = computed(() => {
    const wrap = this.wrap();
    return wrap ? periodChip(wrap.snapshot.period, wrap.locale) : '';
  });
  protected readonly updated = computed(() => {
    const wrap = this.wrap();
    return wrap ? formatShortDate(wrap.snapshot.generatedAt, wrap.locale) : '';
  });

  /** Back from a "Gestionar" that didn't sign the owner in (the api adds `oauth_error`). */
  protected readonly notice = computed(() => {
    const query = this.route.snapshot.queryParamMap;
    switch (query.get('oauth_error')) {
      case null:
      case 'OAUTH_CANCELLED':
        return null;
      case 'WRONG_ACCOUNT':
        return { key: 'wrongAccount', wait: '' };
      case 'RATE_LIMITED':
        return {
          key: 'rateLimited',
          wait: formatWait(Number(query.get('retry_after')) || 60, this.locale()),
        };
      default:
        return { key: 'failed', wait: '' };
    }
  });

  constructor() {
    const previousTitle = this.title.getTitle();
    this.page$.pipe(takeUntilDestroyed()).subscribe((page) => this.describe(page));
    inject(DestroyRef).onDestroy(() => {
      this.clearTags();
      this.title.setTitle(previousTitle);
    });
  }

  protected path(suffix?: 'slides'): string {
    const page = this.page();
    const { login, year } = page.kind === 'wrap' ? page.wrap : page;
    return `${wrapPath(login, year)}${suffix ? `/${suffix}` : ''}`;
  }

  /** What link previews read (R8): absolute URLs, the og.png of the last ready images. */
  private describe(page: PublicPage): void {
    this.clearTags();
    if (page.kind !== 'wrap') {
      this.meta.addTag({ name: 'robots', content: 'noindex' });
      return;
    }
    const { wrap } = page;
    const t = (key: string) =>
      this.transloco.translate(key, { login: wrap.login, year: wrap.year }, wrap.locale);
    const title = t('public.meta.title');
    const description = shareText(wrap.snapshot, wrap.locale);
    this.title.setTitle(title);
    const tags: MetaDefinition[] = [
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: t('public.meta.site') },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: `${this.baseUrl}${wrapPath(wrap.login, wrap.year)}` },
      { property: 'og:locale', content: OG_LOCALE[wrap.locale] },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      ...this.imageTags(wrap, t('public.card')),
    ];
    this.meta.addTags(tags);
  }

  /** Nothing while the first images render: a preview without image beats a broken one. */
  private imageTags(wrap: PublicWrap, alt: string): MetaDefinition[] {
    if (!wrap.images) return [];
    const image = `${this.baseUrl}${wrap.images.og}`;
    return [
      { property: 'og:image', content: image },
      { property: 'og:image:width', content: OG_IMAGE.width },
      { property: 'og:image:height', content: OG_IMAGE.height },
      { property: 'og:image:alt', content: alt },
      { name: 'twitter:image', content: image },
      { name: 'twitter:image:alt', content: alt },
    ];
  }

  private clearTags(): void {
    for (const selector of OWN_TAGS) this.meta.removeTag(selector);
  }
}
