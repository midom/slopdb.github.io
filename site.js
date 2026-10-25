let toastTimer;
function announce(message) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const element = document.getElementById(button.dataset.copy);
    const content = element.textContent.trim();
    try {
      await navigator.clipboard.writeText(content);
      announce('Copied. Go make something.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      announce('Code selected. Use your browser’s copy command.');
    }
  });
});

const search = document.querySelector('#docs-search');
search?.addEventListener('input', () => {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  document.querySelectorAll('.docs-sidebar .nav-section').forEach(section => {
    let matches = 0;
    section.querySelectorAll('a').forEach(link => {
      const match = link.textContent.toLowerCase().includes(query);
      link.hidden = !match;
      if (match) matches++;
    });
    section.hidden = matches === 0;
    count += matches;
  });
  document.querySelector('.no-results').hidden = count !== 0;
});
const docsToggle = document.querySelector('.docs-toggle');
docsToggle?.addEventListener('click', () => {
  const open = document.querySelector('.docs-sidebar').classList.toggle('is-open');
  docsToggle.setAttribute('aria-expanded', String(open));
});

const functionSearch = document.querySelector('#function-search');
const functionFamily = document.querySelector('#function-family');
function filterFunctions() {
  const terms = functionSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const family = functionFamily.value;
  let count = 0;
  document.querySelectorAll('[data-function-row]').forEach(row => {
    const match = (!family || row.dataset.family === family) && terms.every(term => row.dataset.search.includes(term));
    row.hidden = !match;
    if (match) count++;
  });
  document.querySelector('#function-count').textContent = `Showing ${count} function ${count === 1 ? 'form' : 'forms'}.`;
  document.querySelector('#function-empty').hidden = count !== 0;
}
if (functionSearch && functionFamily) {
  functionSearch.addEventListener('input', filterFunctions);
  functionFamily.addEventListener('change', filterFunctions);
}
