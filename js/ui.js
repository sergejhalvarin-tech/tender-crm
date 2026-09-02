/* ============================================================
   Тендерный отдел CRM — UI-хелперы
   ============================================================ */
'use strict';

const UI = {
  el(id) { return document.getElementById(id); },

  toast(msg, type = 'ok', ms = 3200) {
    const wrap = this.el('toastWrap');
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'err' ? ' err' : type === 'warn' ? ' warn' : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 320); }, ms);
  },

  /* модалка */
  openModal(title, bodyHtml, footHtml = '', wide = false) {
    this.el('modalTitle').textContent = title;
    this.el('modalBody').innerHTML = bodyHtml;
    this.el('modalFoot').innerHTML = footHtml;
    this.el('modalBox').className = 'modal' + (wide ? ' wide' : '');
    this.el('modalOverlay').hidden = false;
  },
  closeModal() { this.el('modalOverlay').hidden = true; },

  confirm(title, text, onYes, yesLabel = 'Да, удалить') {
    const body = `<p style="line-height:1.55">${text}</p>`;
    const foot = `<button class="btn btn-ghost" data-close="1">Отмена</button>
                  <button class="btn btn-red" id="cYes">${yesLabel}</button>`;
    this.openModal(title, body, foot);
    this.el('cYes').onclick = () => { this.closeModal(); onYes && onYes(); };
  },

  statusPill(id) {
    const st = STATUS_MAP[id] || STATUS_MAP.work;
    return `<span class="pill ${st.cls}">${st.label}</span>`;
  },

  stockBadge(id) {
    const st = STOCK_OPTS.find(x => x.id === id) || STOCK_OPTS[0];
    if (id === 'yes') return '<span class="pill pill-win">✓ в наличии</span>';
    if (id === 'order') return '<span class="pill pill-lose">под заказ</span>';
    if (id === 'no') return '<span class="pill pill-lose">нет</span>';
    if (id === 'check') return '<span class="pill pill-calc">уточнить</span>';
    return '<span class="pill pill-cancel">выбрать</span>';
  },

  input(name, label, value, opts = {}) {
    const type = opts.type || 'text';
    const ph = opts.placeholder || '';
    const cls = opts.cls || '';
    const step = opts.step != null ? `step="${opts.step}"` : '';
    const min = opts.min != null ? `min="${opts.min}"` : '';
    const rows = opts.rows ? `rows="${opts.rows}"` : '';
    const tag = type === 'textarea' ? 'textarea' : 'input';
    const extra = type === 'textarea' ? rows : `type="${type}" ${step} ${min}`;
    return `<div class="form-row ${cls}">
      <label>${label}</label>
      <${tag} name="${name}" ${extra} placeholder="${esc(ph)}" ${opts.required ? 'required' : ''}>${type === 'textarea' ? esc(value) : ''}</${tag}>
      ${opts.hint ? `<div class="field-hint">${opts.hint}</div>` : ''}
    </div>`;
  },

  /* прочитать значения формы в объект */
  readForm(rootEl, map) {
    const out = {};
    const scope = rootEl instanceof HTMLElement ? rootEl : document;
    Object.keys(map).forEach(key => {
      const el = scope.querySelector(`[name="${key}"]`);
      if (!el) { out[key] = map[key]; return; }
      let v = el.value;
      const type = map[key];
      if (type === 'num') out[key] = v === '' ? null : (isNaN(+v) ? null : +v);
      else if (type === 'text') out[key] = v;
      else if (type === 'date') out[key] = v;
    });
    return out;
  },

  download(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  },
};
