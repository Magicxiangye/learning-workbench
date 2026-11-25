'use strict';
const books = window.courses;
const labels = {unread:'待读', reading:'学习中', read:'已读', discussed:'已对谈'};
const marks = {unread:'○', reading:'◔', read:'✓', discussed:'✓'};
const $ = (id) => document.getElementById(id);
const make = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function button(text, action, cls) {
  const node = make('button', text, cls);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
const key = 'learning-workbench-v1';
let data = {records:{}, last:{}};
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved?.records && saved?.last) data = saved;
} catch {}
const bookFor = (id) => books.find((item) => item.id === id);
let book = bookFor(data.book) || books[0];
let lesson = book.lessons.find((item) => item.id === data.last[book.id]) || book.lessons[0];
let route = false;
let scrollTimer;
const record = (id) => data.records[id] || {};
const currentStatus = (id) => record(id).status || 'unread';
const isDone = (id) => ['read','discussed'].includes(currentStatus(id));
function save(changes) {
  if (changes) data.records[lesson.id] = {...record(lesson.id), ...changes};
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    $('message').textContent = '浏览器无法保存。当前页面仍可继续阅读。';
    $('message').hidden = false;
    return false;
  }
}
function rememberPosition() {
  if (route) return;
  const position = Math.round(window.scrollY);
  data.book = book.id;
  data.last[book.id] = lesson.id;
  save({position});
}
function resumeLesson(item, focus = true) {
  clearTimeout(scrollTimer);
  if (focus) rememberPosition();
  book = item;
  const last = book.lessons.find((entry) => entry.id === data.last[book.id]);
  lesson = last || book.lessons.find((entry) => !isDone(entry.id)) || book.lessons[0];
  route = false;
  if (focus) {
    $('filter').value = 'all';
    data.book = book.id;
    data.last[book.id] = lesson.id;
    save();
  }
  render();
  restorePosition(focus);
}
function restorePosition(focus) {
  if (focus) $('lesson-title').focus({preventScroll:true});
  window.scrollTo(0, record(lesson.id).position || 0);
}
function chooseLesson(item) {
  if (!item) return;
  clearTimeout(scrollTimer);
  rememberPosition();
  lesson = item;
  route = false;
  data.book = book.id;
  data.last[book.id] = lesson.id;
  if (currentStatus(item.id) === 'unread') save({status:'reading'});
  else save();
  render();
  restorePosition(true);
}
function showRoute() {
  clearTimeout(scrollTimer);
  rememberPosition();
  route = true;
  render();
  $('lesson-title').focus({preventScroll:true});
  window.scrollTo(0, 0);
}
function renderProgress() {
  $('books').replaceChildren(...books.map((item) => {
    const count = item.lessons.filter((entry) => isDone(entry.id)).length;
    const node = button(item.name, () => resumeLesson(item), 'book');
    node.setAttribute('aria-current', String(book.id === item.id));
    node.append(make('small', `${count} / ${item.lessons.length} 节已完成`));
    return node;
  }));
  const count = book.lessons.filter((item) => isDone(item.id)).length;
  $('book-title').textContent = book.name;
  $('subject').textContent = book.subject;
  $('book-count').textContent = `已完成 ${count} / ${book.lessons.length} 节`;
  $('book-progress').max = book.lessons.length;
  $('book-progress').value = count;
  $('book-percent').textContent = `${Math.round(count / book.lessons.length * 100)}%`;
}
function renderLessons() {
  const filter = $('filter').value;
  const list = [button('精读路线', showRoute, 'chapter route')];
  list[0].setAttribute('aria-current', String(route));
  book.lessons.forEach((item, index) => {
    const status = currentStatus(item.id);
    if (filter !== 'all' && status !== filter) return;
    const node = button('', () => chooseLesson(item), 'chapter');
    node.setAttribute('aria-current', String(!route && item.id === lesson.id));
    node.setAttribute('aria-label', `${index + 1}. ${item.title}，${labels[status]}`);
    node.append(make('span', String(index + 1).padStart(2, '0'), 'n'), make('span', item.title), make('span', marks[status], 'state'));
    list.push(node);
  });
  if (list.length === 1) list.push(make('p', '此状态下暂无课程'));
  $('lessons').replaceChildren(...list);
}
function appendInline(node, text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) node.append(make('strong', part.slice(2,-2)));
    else if (part.startsWith('`') && part.endsWith('`')) node.append(make('code', part.slice(1,-1)));
    else if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) {
      const [label, url] = part.slice(1,-1).split('](');
      const target = book.lessons.find((entry) => {
        const name = decodeURIComponent(url);
        const number = name.match(/^(?:第|NO\.)(\d+).*\.md$/)?.[1];
        return number && entry.id === book.id + '-' + number.padStart(2,'0');
      });
      if (target) node.append(button(label, () => chooseLesson(target), 'inline-link'));
      else node.append(document.createTextNode(label));
    } else node.append(document.createTextNode(part));
  }
}
function renderMarkdown(md) {
  const article = $('article');
  const outline = $('outline');
  article.replaceChildren();
  outline.replaceChildren();
  const lines = md.split(/\r?\n/);
  const getCells = (line) => line.trim().slice(1,-1).split('|').map((cell) => cell.trim());
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index++; continue; }
    const heading = line.match(/^(#{1,6}) (.+)$/);
    const listPattern = /^(?:[-*]|\d+\.)\s+/;
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      const title = make('h' + level);
      title.id = 'section-' + index;
      appendInline(title, heading[2]);
      article.append(title);
      if (heading[1].length <= 2) {
        const jump = make('a', title.textContent);
        jump.href = '#' + title.id;
        jump.addEventListener('click', (event) => {
          event.preventDefault();
          title.scrollIntoView();
        });
        outline.append(jump);
      }
      index++;
    } else if (line.startsWith('|') && /^\s*\|[ :|-]+\|\s*$/.test(lines[index+1] || '')) {
      const wrap = make('div', '', 'table-wrap');
      const table = make('table');
      const header = table.createTHead().insertRow();
      for (const cell of getCells(line)) {
        const th = make('th');
        th.scope = 'col';
        appendInline(th, cell);
        header.append(th);
      }
      index += 2;
      const tbody = table.createTBody();
      while (lines[index]?.trim().startsWith('|')) {
        const row = tbody.insertRow();
        for (const cell of getCells(lines[index])) appendInline(row.insertCell(), cell);
        index++;
      }
      wrap.append(table);
      article.append(wrap);
    } else if (listPattern.test(line)) {
      const ordered = /^\d/.test(line);
      const list = make(ordered ? 'ol' : 'ul');
      if (ordered) list.start = parseInt(line,10);
      while (lines[index] && listPattern.test(lines[index].trim()) && /^\d/.test(lines[index].trim()) === ordered) {
        const item = make('li');
        appendInline(item, lines[index].trim().replace(listPattern, ''));
        list.append(item);
        index++;
      }
      article.append(list);
    } else {
      const p = make('p');
      appendInline(p, line);
      article.append(p);
      index++;
    }
  }
  $('outline-panel').hidden = !outline.childElementCount;
}
function updateControls() {
  const status = currentStatus(lesson.id);
  $('status').value = status;
  $('complete').textContent = isDone(lesson.id) ? labels[status] : '标记已读';
  $('complete').classList.toggle('done', isDone(lesson.id));
  $('complete').disabled = isDone(lesson.id);
}
function render() {
  renderProgress();
  renderLessons();
  const index = book.lessons.indexOf(lesson);
  $('lesson-label').textContent = route ? '学习路线' : `第 ${index + 1} 节 · 共 ${book.lessons.length} 节`;
  $('lesson-title').textContent = route ? '精读路线' : lesson.title;
  $('complete').hidden = route;
  $('note-panel').hidden = route;
  $('notes').value = record(lesson.id).note || '';
  $('note-status').textContent = '自动保存到当前浏览器';
  updateControls();
  renderMarkdown(route ? book.route.replace(/^# .+\n+/, '') : lesson.body);
  if (route) $('lesson-nav').replaceChildren(button('继续学习', () => chooseLesson(lesson)));
  else {
    const prev = button('上一课', () => chooseLesson(book.lessons[index - 1]));
    const next = button('下一课', () => chooseLesson(book.lessons[index + 1]));
    prev.disabled = index === 0;
    next.disabled = index === book.lessons.length - 1;
    $('lesson-nav').replaceChildren(prev, next);
  }
}
function setStatus(status) {
  data.book = book.id;
  data.last[book.id] = lesson.id;
  save({status});
  updateControls();
  renderProgress();
  renderLessons();
}
$('filter').addEventListener('change', renderLessons);
$('complete').addEventListener('click', () => setStatus('read'));
$('status').addEventListener('change', (event) => setStatus(event.target.value));
$('notes').addEventListener('input', (event) => {
  data.book = book.id;
  data.last[book.id] = lesson.id;
  const status = currentStatus(lesson.id);
  const saved = save({note:event.target.value, status:status === 'unread' ? 'reading' : status});
  $('note-status').textContent = saved ? '笔记已保存' : '笔记未保存';
  if (status === 'unread') {
    updateControls();
    renderLessons();
  }
});
$('overview').addEventListener('click', () => {
  $('summary-body').replaceChildren(...books.map((item) => {
    const section = make('section', '', 'summary-book');
    const count = item.lessons.filter((entry) => isDone(entry.id)).length;
    const discussed = item.lessons.filter((entry) => currentStatus(entry.id) === 'discussed').length;
    const last = item.lessons.find((entry) => entry.id === data.last[item.id]);
    const progress = make('progress');
    progress.max = item.lessons.length;
    progress.value = count;
    progress.setAttribute('aria-label', item.name + '完成进度');
    section.append(make('strong', item.name), make('p', `已完成 ${count} / ${item.lessons.length} 节 · 已对谈 ${discussed} 节`), progress);
    if (last) section.append(make('p', '上次阅读 · ' + last.title));
    section.append(button(last ? '继续学习' : '开始学习', () => {
      $('summary').close();
      resumeLesson(item);
    }, 'plain'));
    return section;
  }));
  $('summary').showModal();
});
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(rememberPosition, 140);
}, {passive:true});
window.addEventListener('pagehide', rememberPosition);
history.scrollRestoration = 'manual';
render();
requestAnimationFrame(() => restorePosition(false));
