import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../study-quiz.js', import.meta.url), 'utf8');
const gate = source.slice(source.indexOf('  const TRIAL_MODE'), source.indexOf('  const API'));
const page = readFileSync(new URL('../study-quiz.html', import.meta.url), 'utf8');

for (const [label, native, pathname, expected] of [
  ['browser', false, '/studia-quiz', false],
  ['browser figure deep link', false, '/studia-quiz', false],
  ['installed Android', true, '/studia-quiz', true],
  ['Android trial', true, '/studia-quiz/prova-gratis', false],
  ['browser trial', false, '/studia-quiz/prova-gratis', false]
]) {
  test(`figure preview rollout: ${label}`, () => {
    const enabled = vm.runInNewContext(gate + '\nFIGURE_STUDY_ENABLED;', {
      window: { location: { pathname, search: '?view=figures&enable=true' } },
      document: { documentElement: { classList: { contains: name => native && name === 'android-webview' } } }
    });
    assert.equal(enabled, expected);
  });
}

test('the same rollout gate owns entry, deep links, lazy import and history restoration', () => {
  assert.match(page, /id="study-paths" class="study-paths hidden"/);
  assert.match(page, /id="study-figures" class="figure-study hidden"/);
  assert.match(source, /classList\.toggle\('hidden', !FIGURE_STUDY_ENABLED\)/);
  assert.match(source, /function isFigureStudyLocation\(\) \{\s*return FIGURE_STUDY_ENABLED/);
  assert.match(source, /async function showFigureStudy\(\) \{\s*if \(!FIGURE_STUDY_ENABLED\)/);
  assert.match(source, /addEventListener\("popstate", \(\) => \{\s*normalizeFigureStudyLocation\(\)/);
  assert.match(source, /addEventListener\("pageshow", event => \{\s*normalizeFigureStudyLocation\(\)/);
});

test('disabled deep links normalize in place without a reload or extra history entry', () => {
  const normalize = source.slice(source.indexOf('  function normalizeFigureStudyLocation()'), source.indexOf('  async function showFigureStudy()'));
  let replacement;
  const location = new URL('https://fixture.invalid/studia-quiz?view=figures&figure=fig40&category=precedenza&q=dare&keep=1#top');
  vm.runInNewContext('const FIGURE_STUDY_ENABLED = false;\n' + normalize + '\nnormalizeFigureStudyLocation();', {
    URL, location,
    history: { state: { original: true }, replaceState: (state, _unused, url) => { replacement = { state, url }; } }
  });
  assert.equal(replacement.url, '/studia-quiz?keep=1#top');
  assert.equal(replacement.state.original, true);
  assert.equal(replacement.state.screen, 'study');
});
