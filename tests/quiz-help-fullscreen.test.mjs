import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const help=read('quiz-help.js'), css=read('quiz-help.css'), quiz=read('quiz.js'), html=read('quiz.html');

test('phone help has one viewport reader while the same disclosure stays inline on tablets',()=>{
  assert.match(help,/max-width: 600px.*max-width: 950px.*max-height: 500px.*pointer: coarse/);
  assert.match(help,/phoneHelpQuery.addEventListener\("change", syncHelpPresentation\)/);
  assert.match(help,/document.body.appendChild\(workspace\)/);
  assert.match(help,/workspaceHome.after\(workspace\)/);
  assert.equal((html.match(/id="quiz-help-translation-text"/g)||[]).length,1);
  assert.match(css,/\.quiz-help-workspace\.is-fullscreen \{[^}]*inset: 0;[^}]*height: var\(--quiz-viewport-height, 100dvh\)/s);
  assert.match(css,/grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(css,/\.quiz-help-workspace\.is-fullscreen \.quiz-help-content \{[^}]*overflow-y: auto;/s);
});

test('source question is plain text and the existing protected figure is moved and restored',()=>{
  assert.match(help,/helpQuestion.textContent = currentQuestion\(\)\?\.question/);
  assert.match(help,/if \(getFigureKey\(currentQuestion\(\)\) && figureWrap\)/);
  assert.match(help,/helpSource.appendChild\(figureWrap\)/);
  assert.match(help,/figureHome.after\(figureWrap\)/);
  assert.doesNotMatch(help,/helpQuestion.innerHTML|figureWrap.cloneNode/);
  assert.match(css,/\.quiz-help-source.has-figure \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css,/#figure \{[^}]*object-fit: contain; border-radius: 0;/);
});

test('phone help owns focus and background interaction, then restores the question scroll',()=>{
  assert.match(help,/workspace.setAttribute\("role", "dialog"\)/);
  assert.match(help,/workspace.setAttribute\("aria-modal", "true"\)/);
  assert.match(help,/quizSurface.setAttribute\("inert", ""\)/);
  assert.match(help,/quizSurface.removeAttribute\("inert"\)/);
  assert.match(help,/questionScroller.scrollTop = questionScrollBeforeHelp/);
  assert.match(help,/if \(fullscreenHelp\) trapQuizDialogFocus\(event, workspace\)/);
  assert.match(quiz,/magic-offline-active.*return/);
  assert.match(help,/restoreInertAfterOffline/);
});

test('the shared modal owner dismisses help before capturing focus for a blocking message',()=>{
  const modal=quiz.slice(quiz.indexOf('function openModal('),quiz.indexOf('function closeModal('));
  assert.ok(modal.indexOf('magicbook:quiz-help-close') < modal.indexOf('modalFocusOrigin ='));
  assert.match(help,/window.addEventListener\("pagehide", close\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{\s*\.quiz-help-workspace\.is-fullscreen \.quiz-help-content \{ animation: none;/);
});

test('shared dialog keyboard trap includes disclosure summaries and wraps in both directions',()=>{
  const first={focus(){doc.activeElement=this;}},last={focus(){doc.activeElement=this;}};
  for(const node of [first,last]) { node.closest=()=>null;node.getClientRects=()=>[{}]; }
  const doc={activeElement:first};
  const root={querySelectorAll:()=>[first,last],contains:n=>n===first||n===last||n===root,focus(){doc.activeElement=this;}};
  const env=vm.createContext({document:doc,modalCard:root});
  const source=quiz.slice(quiz.indexOf('const MODAL_FOCUSABLE_SELECTOR'),quiz.indexOf('function resetModalState'));
  vm.runInContext(source,env);
  let prevented=0;
  const event={key:'Tab',shiftKey:true,preventDefault(){prevented++;}};
  env.trapQuizDialogFocus(event,root);assert.equal(doc.activeElement,last);
  event.shiftKey=false;env.trapQuizDialogFocus(event,root);assert.equal(doc.activeElement,first);
  assert.equal(prevented,2);
  root.querySelectorAll=()=>[];
  env.trapQuizDialogFocus(event,root);assert.equal(doc.activeElement,root);
  assert.match(source,/"summary"/);
});
