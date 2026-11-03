import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { FeaturedRepo } from '@wrapped/shared';
import { demoRepo } from '../../../../testing/snapshot';
import { provideI18n } from '../../../core/i18n/i18n.providers';
import { ProjectsSlideComponent } from './projects-slide.component';

describe('ProjectsSlideComponent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render(featured: FeaturedRepo[]) {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['es-CL']);
    TestBed.configureTestingModule({
      imports: [ProjectsSlideComponent],
      providers: [provideI18n()],
    });
    await TestBed.inject(ApplicationInitStatus).donePromise;
    const fixture = TestBed.createComponent(ProjectsSlideComponent);
    fixture.componentRef.setInput('featured', featured);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const link = (card: Element | undefined, name: string) =>
    [...(card?.querySelectorAll('a') ?? [])].find((a) => text(a) === name);

  it('shows only the repos there are, without empty slots', async () => {
    const el = await render([demoRepo('one'), demoRepo('two')]);

    expect(el.querySelectorAll('.project')).toHaveLength(2);
  });

  it('describes each repo with its name, stars, description and commits', async () => {
    const el = await render([
      demoRepo('sismos-chile-api', {
        description: 'API REST de sismos en Chile.',
        stars: 34,
        commits: 128,
      }),
    ]);
    const card = el.querySelector('.project');

    expect(text(card?.querySelector('.project-name'))).toBe('sismos-chile-api');
    expect(text(card?.querySelector('.project-stars'))).toBe('34');
    expect(text(card?.querySelector('.project-description'))).toBe('API REST de sismos en Chile.');
    expect(text(card?.querySelector('.project-commits'))).toBe('128 commits');
  });

  it('leaves the stars out for a repo nobody starred', async () => {
    const el = await render([demoRepo('quiet')]);

    expect(el.querySelector('.project-stars')).toBeNull();
  });

  it('offers Demo only when the repo has a homepage, in a new tab', async () => {
    const el = await render([
      demoRepo('no-demo'),
      demoRepo('with-demo', { demoUrl: 'https://demo.example.com' }),
    ]);
    const [plain, live] = [...el.querySelectorAll('.project')];

    expect(link(plain, 'Demo')).toBeUndefined();
    const demo = link(live, 'Demo');
    expect(demo?.href).toBe('https://demo.example.com/');
    expect(demo?.target).toBe('_blank');
    expect(demo?.rel).toContain('noopener');
    const repo = link(live, 'Repo');
    expect(repo?.href).toBe('https://github.com/ana-dev/with-demo');
    expect(repo?.rel).toContain('noopener');
  });

  it('labels a repo by its topics, else its languages, else not at all', async () => {
    const el = await render([
      demoRepo('topics', { topics: ['nestjs', 'redis'], languages: ['TypeScript'] }),
      demoRepo('languages', { languages: ['Go', 'Shell'] }),
      demoRepo('bare'),
    ]);
    const chips = [...el.querySelectorAll('.project')].map((card) =>
      [...card.querySelectorAll('.project-chips gw-chip')].map((c) => text(c)),
    );

    expect(chips).toEqual([['nestjs', 'redis'], ['Go', 'Shell'], []]);
    expect(el.querySelectorAll('.project')[2]?.querySelector('.project-chips')).toBeNull();
  });
});
