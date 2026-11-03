import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FakeMatchMedia, installMatchMedia } from '../../testing/match-media';
import { BreakpointService, DESKTOP_QUERY } from './breakpoint.service';

describe('BreakpointService', () => {
  let media: FakeMatchMedia;

  afterEach(() => media?.restore());

  it('reports desktop when the viewport is wider than the breakpoint', () => {
    media = installMatchMedia({ [DESKTOP_QUERY]: true });

    expect(TestBed.inject(BreakpointService).isDesktop()).toBe(true);
  });

  it('reports mobile on a narrow viewport', () => {
    media = installMatchMedia({ [DESKTOP_QUERY]: false });

    expect(TestBed.inject(BreakpointService).isDesktop()).toBe(false);
  });

  it('follows the viewport when it crosses the breakpoint', () => {
    media = installMatchMedia({ [DESKTOP_QUERY]: false });
    const service = TestBed.inject(BreakpointService);

    media.set(DESKTOP_QUERY, true);
    expect(service.isDesktop()).toBe(true);

    media.set(DESKTOP_QUERY, false);
    expect(service.isDesktop()).toBe(false);
  });

  it('assumes mobile on the server without touching matchMedia', () => {
    media = installMatchMedia({ [DESKTOP_QUERY]: true });
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });

    expect(TestBed.inject(BreakpointService).isDesktop()).toBe(false);
    expect(media.calls).toEqual([]);
  });
});
