// The nickname form (title screen, and the final screen when no name is set).
// Validation is the same shared rule the server applies. A blank submit clears
// the name, because a nickname is optional: it is only needed to appear on the
// leaderboard. Names are only ever rendered as text.

import { NAME_RULES, validateName } from '../lib/leaderboard.js';

export function renderNameForm({ h, currentName = null, onSave, submitLabel = 'Save', idPrefix = 'nick' }) {
  const hintId = `${idPrefix}-hint`;
  const errorId = `${idPrefix}-error`;
  const error = h('p', { class: 'form-error', id: errorId, role: 'alert' });
  const input = h('input', {
    id: idPrefix, name: 'nickname', type: 'text', class: 'text-input',
    maxlength: String(NAME_RULES.max), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'done', 'aria-describedby': `${hintId} ${errorId}`, value: currentName ?? '',
  });

  const form = h('form', {
    class: 'name-form', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      const raw = String(input.value ?? '');
      if (raw.trim() === '') {
        error.textContent = '';
        input.removeAttribute?.('aria-invalid');
        onSave(null); // cleared
        return;
      }
      const result = validateName(raw);
      if (!result.ok) {
        error.textContent = result.message;
        input.setAttribute('aria-invalid', 'true');
        input.focus?.();
        return;
      }
      error.textContent = '';
      input.removeAttribute?.('aria-invalid');
      input.value = result.name;
      onSave(result.name);
    },
  },
  h('label', { for: idPrefix, text: 'Nickname (optional)' }),
  h('p', { class: 'hint', id: hintId, text: `Shown on the leaderboard. ${NAME_RULES.min} to ${NAME_RULES.max} letters, numbers, spaces, - or _.` }),
  h('div', { class: 'name-row' }, input, h('button', { type: 'submit', class: 'btn', text: submitLabel })),
  error);
  return form;
}
