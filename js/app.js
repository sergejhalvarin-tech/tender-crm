/* ============================================================
   Тендерный отдел CRM — контроллер представлений
   ============================================================ */
'use strict';

const App = {
  state: { view: 'dashboard', purchaseId: null, filter: { q: '', status: '' }, sort: 'created-desc' },

  init() {
    Store.load();
    this.bindGlobal();
    this.nav('dashboard');
  },

  bindGlobal() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => this.nav(btn.dataset.view);
    });
    this.el('btnMenu').onclick = () => {
      const sb = this.el('sidebar');
      sb.classList.toggle('open');
    };
    this.el('modalClose').onclick = () => UI.closeModal();
    this.el('modalOverlay').onclick = (e) => { if (e.target === e.currentTarget) UI.closeModal(); };

    // экспорт/импорт
    this.el('btnExport').onclick = () => {
      UI.download('tender-crm-backup-' + todayStr() + '.json', Store.exportJson());
      UI.toast('Бэкап сохранён');
    };
    this.el('btnImport').onclick = () => this.el('importFile').click();
    this.el('importFile').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          Store.importJson(rd.result);
          UI.toast('Данные импортированы');
          this.refreshAll();
        } catch (err) { UI.toast('Ошибка импорта: ' + err.message, 'err'); }
      };
      rd.readAsText(f, 'utf-8');
      e.target.value = '';
    };
  },

  el(id) { return document.getElementById(id); },
  viewEl() { return this.el('viewContainer'); },

  nav(view) {
    this.state.view = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const titles = {
      dashboard: 'Дашборд', purchases: 'Реестр закупок',
      purchase: 'Карточка закупки', settings: 'Настройки', finmodel: '🧮 Финмодель (админ)', about: 'Инструкция'
    };
    this.el('pageTitle').textContent = titles[view] || '—';
    this.el('topbarRight').innerHTML = '';
    const renderers = {
      dashboard: () => this.renderDashboard(),
      purchases: () => this.renderRegistry(),
      purchase: () => this.renderPurchaseEditor(),
      settings: () => this.renderSettings(),
      finmodel: () => this.renderFmodel(),
      about: () => this.renderAbout(),
    };
    (renderers[view] || this.renderDashboard).call(this);
    window.scrollTo(0, 0);
  },
  refreshAll() { this.nav(this.state.view); },

  /* ============ ДАШБОРД ============ */
  renderDashboard() {
    const purchases = Store.purchases();
    const a = Calc.aggregates(purchases);
    const staff = Calc.byStaff(purchases);
    const s = Store.settings();

    const kpis = [
      { l: 'Всего закупок', v: fmt(a.cnt), cls: '', sub: 'в реестре' },
      { l: 'В работе', v: fmt(a.inWork), cls: 'blue', sub: 'просчёт / работа' },
      { l: 'Подано заявок', v: fmt(a.submitted), cls: 'blue', sub: 'решения приняты' },
      { l: 'ПОБЕД', v: fmt(a.wins), cls: 'green', sub: 'конверсия ' + fmtPct(a.conv) },
      { l: 'Проигрыши', v: fmt(a.loses), cls: 'red', sub: 'не прошли' },
      { l: 'Сумма НМЦК', v: fmtMoney(a.sumNmck), cls: 'blue', sub: 'весь портфель' },
      { l: 'Сумма контрактов', v: fmtMoney(a.sumContracts), cls: 'green', sub: 'выигранные' },
      { l: 'ЧП расчётная', v: fmtMoney(a.sumChp), cls: a.sumChp >= 0 ? 'green' : 'red', sub: 'налоги ' + fmtMoney(a.sumTax) },
      { l: 'Бонусы', v: fmtMoney(a.sumBonus), cls: 'orange', sub: 'просчётчикам' },
    ];
    let h = '<div class="kpi-grid">' + kpis.map(k =>
      `<div class="kpi ${k.cls}"><div class="k-label">${k.l}</div><div class="k-val">${k.v}</div><div class="k-sub">${k.sub}</div></div>`
    ).join('') + '</div>';

    // настройки-предупреждения
    h += `<div class="card"><h3>⚙ Текущие параметры отдела
      <span class="hint">(меняются в «Настройки»)</span></h3>
      <div class="grid grid-4">
        <div><label>Наценка</label><div class="num" style="font-size:18px;font-weight:700">${fmtPct(s.nacenka)}</div></div>
        <div><label>Тариф площадки</label><div class="num" style="font-size:18px;font-weight:700">${fmtPct(s.tarif)}</div></div>
        <div><label>Налог</label><div class="num" style="font-size:18px;font-weight:700">${fmtPct(s.nalog + s.prochie)}</div></div>
        <div><label>Бонус просчётчика</label><div class="num" style="font-size:18px;font-weight:700">${fmtPct(s.bonus)}</div></div>
      </div></div>`;

    // воронка
    h += `<div class="card"><h3>🔻 Воронка закупок</h3><div class="grid grid-2">
      <div>
        ${this.funnelBar('В работе', a.inWork, a.cnt)}
        ${this.funnelBar('Подано', a.submitted, a.cnt)}
        ${this.funnelBar('Победы', a.wins, Math.max(a.submitted, 1))}
        ${this.funnelBar('Проигрыши', a.loses, Math.max(a.submitted, 1))}
      </div>
      <div>
        <label>Соотношение побед к подачам</label>
        <div style="font-size:34px;font-weight:800;margin:6px 0 2px" class="${a.conv >= 30 ? 'pos' : a.conv >= 15 ? '' : 'neg'}">${fmtPct(a.conv)}</div>
        <div class="mut2" style="font-size:12px">Ориентир здоровой конверсии: 20–40%. Если ниже — проверьте качество выбора лотов и цену подачи.</div>
      </div>
    </div></div>`;

    // сотрудники
    if (staff.length) {
      h += `<div class="card"><h3>👥 Результаты просчётчиков</h3>
      <div class="table-wrap"><table>
      <thead><tr><th>Сотрудник</th><th class="num">Закупок</th><th class="num">В работе</th><th class="num">Побед</th><th class="num">ЧП принесла</th><th class="num">Бонус</th></tr></thead><tbody>` +
      staff.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${fmt(x.cnt)}</td><td class="num">${fmt(x.inWork)}</td>
        <td class="num pos">${fmt(x.wins)}</td><td class="money ${x.chp >= 0 ? 'pos' : 'neg'}">${fmtMoney(x.chp)}</td>
        <td class="money" style="color:var(--orange)">${fmtMoney(x.bonus)}</td></tr>`).join('') +
      '</tbody></table></div></div>';
    } else {
      h += `<div class="empty"><div class="big">👥</div>Добавьте сотрудников в «Настройки» и назначайте их в закупках</div>`;
    }

    // последние закупки
    const recent = [...purchases].sort((x, y) => y.created - x.created).slice(0, 6);
    h += `<div class="card"><h3>🕒 Последние закупки</h3><div class="table-wrap"><table>
      <thead><tr><th>№</th><th>Заказчик</th><th>НМЦК</th><th>Маржа (мин)</th><th>Статус</th><th></th></tr></thead><tbody>` +
      (recent.length ? recent.map(p => `<tr>
        <td class="mut2 mono">${esc(p.num || '—')}</td>
        <td>${esc(p.customer || 'Без названия')}</td>
        <td class="money">${fmtMoney(Calc.nmck(p))}</td>
        <td class="money ${Calc.marzha(p).rub >= 0 ? 'pos' : 'neg'}">${fmtMoney(Calc.marzha(p).rub)} <span class="mut2">(${fmtPct(Calc.marzha(p).pct)})</span></td>
        <td>${UI.statusPill(p.status)}</td>
        <td><button class="btn btn-ghost btn-sm" data-open="${p.id}">Открыть</button></td></tr>`).join('')
        : '<tr><td colspan="6"><div class="empty" style="padding:18px">Пока нет закупок — добавьте первую в «Реестр закупок»</div></td></tr>') +
      '</tbody></table></div></div>';

    this.viewEl().innerHTML = h;
    this.viewEl().querySelectorAll('[data-open]').forEach(b => b.onclick = () => this.openPurchase(b.dataset.open));
  },

  funnelBar(label, val, max) {
    const pct = max > 0 ? Math.min(100, val / max * 100) : 0;
    return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12.5px">
      <span>${label}</span><b>${fmt(val)}</b></div>
      <div class="bar"><i style="width:${pct}%" class="${label === 'Победы' ? 'green' : ''}"></i></div></div>`;
  },

  /* ============ РЕЕСТР ============ */
  renderRegistry() {
    const purchases = [...Store.purchases()];
    const st = this.state.filter;

    let list = purchases;
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter(p => (p.customer || '').toLowerCase().includes(q) || (p.num || '').toLowerCase().includes(q)); }
    if (st.status) list = list.filter(p => p.status === st.status);

    const order = this.state.sort;
    list.sort((a, b) => {
      if (order === 'nmck-desc') return Calc.nmck(b) - Calc.nmck(a);
      if (order === 'marzha-desc') return Calc.marzha(b).rub - Calc.marzha(a).rub;
      if (order === 'created-asc') return a.created - b.created;
      return b.created - a.created; // created-desc
    });

    const agg = Calc.aggregates(purchases);
    const h = `<div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      ${[['Всего', fmt(agg.cnt)], ['НМЦК', fmtMoney(agg.sumNmck)], ['Побед', fmt(agg.wins)], ['ЧП', fmtMoney(agg.sumChp)]]
        .map(x => `<div class="kpi"><div class="k-label">${x[0]}</div><div class="k-val" style="font-size:17px">${x[1]}</div></div>`).join('')}
    </div>
    <div class="filters">
      <input class="grow" id="fQ" placeholder="🔍 Поиск: заказчик, номер закупки..." value="${esc(st.q)}">
      <select id="fStatus">
        <option value="">Все статусы</option>
        ${STATUSES.map(s => `<option value="${s.id}" ${st.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
      </select>
      <select id="fSort">
        <option value="created-desc" ${this.state.sort === 'created-desc' ? 'selected' : ''}>Сначала новые</option>
        <option value="created-asc" ${this.state.sort === 'created-asc' ? 'selected' : ''}>Сначала старые</option>
        <option value="nmck-desc" ${this.state.sort === 'nmck-desc' ? 'selected' : ''}>По НМЦК ↓</option>
        <option value="marzha-desc" ${this.state.sort === 'marzha-desc' ? 'selected' : ''}>По марже ↓</option>
      </select>
      <button class="btn" id="btnAdd">+ Новая закупка</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>№ закупки</th><th>Заказчик</th><th>Дедлайн</th><th>Регион</th>
        <th class="num">НМЦК</th><th class="num">Закупка (мин)</th><th class="num">Маржа</th>
        <th class="num">Цена подачи</th><th>Просчётчик</th><th>Статус</th><th></th>
      </tr></thead><tbody>` +
      (list.length ? list.map(p => {
        const n = Calc.nmck(p), z = Calc.zakupka(p, 'min'), m = Calc.marzha(p, 'min');
        const cp = Calc.cenaPodachi(p, 'min');
        return `<tr>
          <td class="mono">${esc(p.num || '—')}</td>
          <td style="max-width:230px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.customer || '—')}</div>
            ${p.winPrice != null && p.winPrice !== '' && p.status === 'win' ? `<span class="mut2" style="font-size:11px">🏆 ${fmtMoney(+p.winPrice)}</span>` : ''}</td>
          <td class="mut">${esc(p.deadline || '—')}</td>
          <td class="mut2" style="max-width:150px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.region || '—')}</div></td>
          <td class="money">${fmtMoney(n)}</td>
          <td class="money mut">${fmtMoney(z)}</td>
          <td class="money ${m.rub >= 0 ? 'pos' : 'neg'}">${fmtMoney(m.rub)}<br><span class="mut2" style="font-size:11px">${fmtPct(m.pct)}</span></td>
          <td class="money">${fmtMoney(cp)}</td>
          <td>${esc(p.proschotchik || '—')}</td>
          <td>${UI.statusPill(p.status)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-open="${p.id}">✎</button>
            <button class="btn btn-ghost btn-sm" data-del="${p.id}">🗑</button>
          </td></tr>`;
      }).join('') : '<tr><td colspan="11"><div class="empty" style="padding:30px"><div class="big">🗂</div>Закупок не найдено</div></td></tr>') +
      '</tbody></table></div>';

    this.viewEl().innerHTML = h;
    this.el('btnAdd').onclick = () => this.addPurchase();
    this.el('fQ').oninput = e => { this.state.filter.q = e.target.value; this.renderRegistry(); };
    this.el('fStatus').onchange = e => { this.state.filter.status = e.target.value; this.renderRegistry(); };
    this.el('fSort').onchange = e => { this.state.sort = e.target.value; this.renderRegistry(); };
    this.viewEl().querySelectorAll('[data-open]').forEach(b => b.onclick = () => this.openPurchase(b.dataset.open));
    this.viewEl().querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const id = b.dataset.del;
      const p = Store.getPurchase(id);
      UI.confirm('Удалить закупку?', `«${esc(p && p.customer || 'Без названия')}» будет удалена безвозвратно.`, () => {
        Store.deletePurchase(id); UI.toast('Закупка удалена', 'warn'); this.renderRegistry();
      });
    });
  },

  addPurchase() {
    const p = Store.addPurchase({ num: '', customer: 'Новая закупка' });
    this.openPurchase(p.id);
  },

  openPurchase(id) {
    this.state.view = 'purchase';
    this.state.purchaseId = id;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === 'purchase'));
    this.el('pageTitle').textContent = 'Карточка закупки';
    this.renderPurchaseEditor();
  },

  /* ============ КАРТОЧКА ЗАКУПКИ ============ */
  renderPurchaseEditor() {
    const p = Store.getPurchase(this.state.purchaseId);
    if (!p) { this.nav('purchases'); return; }
    const settings = Store.settings();
    const nmck = Calc.nmck(p);
    const zmin = Calc.zakupka(p, 'min');
    const m = Calc.marzha(p, 'min');
    const cp = Calc.cenaPodachi(p, 'min');
    const staffOpts = settings.sotrudniki.filter(Boolean).map(n => `<option value="${esc(n)}" ${p.proschotchik === n ? 'selected' : ''}>${esc(n)}</option>`).join('');
    const f = (p.status === 'win') ? Calc.finance(p) : null;

    let h = `<div class="purchase-head">
      <div class="row1">
        <div>
          <div class="title">${esc(p.customer || 'Новая закупка')}</div>
          <div class="mut2">№ ${esc(p.num || '—')}${p.link ? ' · <a href="' + esc(p.link) + '" target="_blank">открыть закупку ↗</a>' : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="pStatus" style="width:auto">${STATUSES.map(s => `<option value="${s.id}" ${p.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          <button class="btn" id="btnSaveCard">💾 Сохранить</button>
          <button class="btn btn-ghost" id="btnDup">⧉ Копия</button>
          <button class="btn btn-red" id="btnDelCard">🗑</button>
        </div>
      </div>
      <div class="meta">
        <span>Дедлайн: <b>${esc(p.deadline || '—')}</b></span>
        <span>Срок поставки: <b>${esc(p.delivery || '—')}</b></span>
        <span>Регион: <b>${esc(p.region || '—')}</b></span>
        <span>Просчётчик: <b id="pStaffLabel">${esc(p.proschotchik || '—')}</b></span>
      </div>
      <div class="meta">
        <span>НМЦК: <b>${fmtMoney(nmck)}</b></span>
        <span>Закупка (мин): <b>${fmtMoney(zmin)}</b></span>
        <span>Маржа: <b class="${m.rub >= 0 ? 'pos' : 'neg'}">${fmtMoney(m.rub)} (${fmtPct(m.pct)})</b></span>
        <span>Цена подачи: <b>${fmtMoney(cp)}</b></span>
      </div>
    </div>`;

    // ---------- блок победы / финансов ----------
    h += `<div class="card"><h3>💰 Финансовый результат сделки</h3>
    <div class="grid grid-4">
      <div class="form-row"><label>Цена ПОБЕДЫ, ₽</label><input type="number" id="pWin" value="${p.winPrice != null ? p.winPrice : ''}" placeholder="заполнить при победе"></div>
      <div class="form-row"><label>Факт. закупочная цена, ₽ <span class="mut2">(пусто = мин. закупка)</span></label><input type="number" id="pFact" value="${p.factPrice != null ? p.factPrice : ''}" placeholder="из какого КП закупили"></div>
      <div class="form-row"><label>Логистика, ₽</label><input type="number" id="pLog" value="${p.logistics || ''}"></div>
      <div class="form-row"><label>Комментарий</label><input type="text" id="pComment" value="${esc(p.comment || '')}" placeholder="ход сделки..."></div>
    </div>
    ${f ? `<div class="kpi-grid" style="margin:6px 0 0">
      <div class="kpi"><div class="k-label">Тариф площадки</div><div class="k-val" style="font-size:16px">${fmtMoney(f.tarif)}</div></div>
      <div class="kpi"><div class="k-label">Резерв</div><div class="k-val" style="font-size:16px">${fmtMoney(f.rez)}</div></div>
      <div class="kpi"><div class="k-label">Прибыль до налога</div><div class="k-val" style="font-size:16px">${fmtMoney(f.pribyl)}</div></div>
      <div class="kpi"><div class="k-label">Налог</div><div class="k-val" style="font-size:16px">${fmtMoney(f.tax)}</div></div>
      <div class="kpi green"><div class="k-label">ЧП расчётная</div><div class="k-val" style="font-size:18px">${fmtMoney(f.chp)}</div></div>
      <div class="kpi orange"><div class="k-label">Бонус просчётчика</div><div class="k-val" style="font-size:16px">${fmtMoney(f.bonus)}</div></div>
    </div>
    <div class="mut2" style="font-size:12px;margin-top:8px">Формула: ЧП = Цена победы − Закупка − Логистика − Тариф (${fmtPct(settings.tarif)}) − Резерв (${fmtPct(settings.rezerv)}); налог ${fmtPct(settings.nalog + settings.prochie)} с прибыли. Бонус ${fmtPct(settings.bonus)} от ЧП.</div>`
    : '<div class="mut2" style="font-size:12.5px;margin-top:6px">Укажите статус «ПОБЕДА» и цену победы — ЧП, налог и бонус посчитаются автоматически.</div>'}
    </div>`;

    // ---------- реквизиты ----------
    h += `<div class="card"><h3>🏛 Реквизиты закупки</h3><div class="grid grid-4">
      <div class="form-row"><label>Номер закупки</label><input type="text" id="pNum" value="${esc(p.num || '')}"></div>
      <div class="form-row"><label>Ссылка на закупку</label><input type="text" id="pLink" value="${esc(p.link || '')}" placeholder="https://..."></div>
      <div class="form-row"><label>Дедлайн подачи</label><input type="text" id="pDeadline" value="${esc(p.deadline || '')}" placeholder="дд.мм.гггг чч:мм"></div>
      <div class="form-row"><label>Срок поставки</label><input type="text" id="pDelivery" value="${esc(p.delivery || '')}" placeholder="10 раб. дней"></div>
      <div class="form-row"><label>Регион / адрес</label><input type="text" id="pRegion" value="${esc(p.region || '')}"></div>
      <div class="form-row"><label>Заказчик</label><input type="text" id="pCustomer" value="${esc(p.customer || '')}"></div>
      <div class="form-row"><label>Просчётчик</label><select id="pStaff"><option value="">— не назначен —</option>${staffOpts}</select></div>
      <div class="form-row"><label>НМЦК, ₽ <span class="mut2">(пусто = из позиций)</span></label><input type="number" id="pNmck" value="${p.nmck != null ? p.nmck : ''}" placeholder="авто из позиций"></div>
      <div class="form-row" style="grid-column:1/-1"><label>Контакты заказчика (ФИО, e-mail, телефон)</label><input type="text" id="pContacts" value="${esc(p.contacts || '')}"></div>
    </div></div>`;

    // ---------- позиции ----------
    h += `<div class="section-title">Позиции по Тех.заданию <span class="ln"></span>
      <button class="btn btn-sm" id="btnAddPos">+ Позиция</button></div>`;

    const positions = p.positions || [];
    h += positions.length ? positions.map((pos, pi) => this.positionCard(p, pos, pi)).join('')
      : `<div class="empty"><div class="big">📦</div>Добавьте позиции из Тех.задания — по ним посчитаются закупочные цены и маржа.<br>
          <button class="btn" style="margin-top:12px" id="btnAddPosEmpty">+ Добавить первую позицию</button></div>`;

    this.viewEl().innerHTML = h;
    this.bindPositionEvents(this.viewEl());

    // bindings
    this.el('btnAddPos') && (this.el('btnAddPos').onclick = () => this.addPosition());
    this.el('btnAddPosEmpty') && (this.el('btnAddPosEmpty').onclick = () => this.addPosition());
    this.el('pStatus').onchange = e => {
      Store.updatePurchase(p.id, { status: e.target.value });
      UI.toast('Статус обновлён'); this.renderPurchaseEditor();
    };
    this.el('btnSaveCard').onclick = () => this.savePurchaseCard(p);
    this.el('btnDup').onclick = () => {
      const copy = Store.duplicatePurchase(p.id);
      UI.toast('Создана копия'); this.state.purchaseId = copy.id; this.renderPurchaseEditor();
    };
    this.el('btnDelCard').onclick = () => {
      UI.confirm('Удалить закупку?', `«${esc(p.customer || 'Без названия')}» будет удалена.`, () => {
        Store.deletePurchase(p.id); UI.toast('Закупка удалена', 'warn'); this.nav('purchases');
      });
    };
    // пересчёт финансов после ввода (onchange — чтобы не терять фокус при наборе)
    ['pWin', 'pFact', 'pLog'].forEach(id => {
      this.el(id).onchange = () => { this.savePurchaseCard(p, true); };
      this.el(id).onkeydown = (e) => { if (e.key === 'Enter') this.el(id).blur(); };
    });
  },

  savePurchaseCard(p, silent) {
    Store.updatePurchase(p.id, {
      num: this.el('pNum').value.trim(),
      link: this.el('pLink').value.trim(),
      customer: this.el('pCustomer').value.trim(),
      deadline: this.el('pDeadline').value.trim(),
      delivery: this.el('pDelivery').value.trim(),
      region: this.el('pRegion').value.trim(),
      contacts: this.el('pContacts').value.trim(),
      comment: this.el('pComment').value.trim(),
      proschotchik: this.el('pStaff').value,
      nmck: this.el('pNmck').value === '' ? null : +this.el('pNmck').value,
      winPrice: this.el('pWin').value === '' ? null : +this.el('pWin').value,
      factPrice: this.el('pFact').value === '' ? null : +this.el('pFact').value,
      logistics: +this.el('pLog').value || 0,
    });
    if (!silent) { UI.toast('Сохранено'); this.renderPurchaseEditor(); }
    else this.renderPurchaseEditor();
  },

  positionCard(p, pos, pi) {
    const totals = pos.kp.map((_, i) => Calc.kpTotal(pos, i));
    const pr = Calc.posPrices(pos);
    const nm = Calc.posNmck(pos);
    const kpBlocks = pos.kp.map((kp, ki) => {
      const best = totals[ki] > 0 && pr.cnt > 0 && totals[ki] === pr.min;
      return `<div class="kp-card ${best ? 'best' : ''}">
        <h4>КП${ki + 1} ${best ? '<span class="badge-best">лучшая цена</span>' : ''}</h4>
        <div class="form-row" style="margin-bottom:7px"><label>Цена за шт, ₽</label>
          <input type="number" class="kp-price" data-pos="${pos.id}" data-kp="${ki}" value="${kp.price != null ? kp.price : ''}" placeholder="0"></div>
        <div class="form-row" style="margin-bottom:7px"><label>Ссылка на товар</label>
          <input type="text" class="kp-link" data-pos="${pos.id}" data-kp="${ki}" value="${esc(kp.link || '')}" placeholder="https://..."></div>
        <div class="form-row" style="margin-bottom:0"><label>В наличии</label>
          <select class="kp-stock" data-pos="${pos.id}" data-kp="${ki}">
            ${STOCK_OPTS.map(o => `<option value="${o.id}" ${kp.inStock === o.id ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select></div>
        <div class="num" style="margin-top:8px;font-size:12px;color:var(--mut)">Общая стоимость: <b style="color:var(--txt)">${fmtMoney(totals[ki])}</b></div>
      </div>`;
    }).join('');

    return `<div class="card" data-poswrap="${pos.id}">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">Позиция ${pi + 1}
          <span class="hint">НМЦК поз.: ${fmtMoney(nm)}</span></h3>
        <button class="btn btn-red btn-sm" data-delpos="${pos.id}">Удалить позицию</button>
      </div>
      <div class="grid grid-3">
        <div class="form-row" style="margin-bottom:7px"><label>Наименование по Тех.заданию</label>
          <textarea rows="1" class="pos-name" data-pos="${pos.id}" placeholder="Наименование ТОЧНО как в ТЗ">${esc(pos.name || '')}</textarea></div>
        <div class="form-row" style="margin-bottom:7px"><label>Кол-во</label>
          <input type="number" class="pos-qty" data-pos="${pos.id}" value="${pos.qty != null ? pos.qty : ''}" placeholder="0"></div>
        <div class="form-row" style="margin-bottom:7px"><label>Цена за ед. по НМЦК, ₽</label>
          <input type="number" class="pos-price-nmck" data-pos="${pos.id}" value="${pos.priceNmck != null ? pos.priceNmck : ''}" placeholder="0"></div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin:2px 0 12px;font-size:12.5px">
        <span>Закупка: мин <b class="pos">${fmtMoney(pr.min)}</b></span>
        <span>средн <b>${fmtMoney(pr.avg)}</b></span>
        <span>макс <b class="mut">${fmtMoney(pr.max)}</b></span>
        <span class="mut2">КП заполнено: ${pr.cnt}/3</span>
      </div>
      <div class="kp-grid">${kpBlocks}</div>
      <div class="form-row" style="margin:10px 0 0"><label>Примечания просчётчика</label>
        <textarea rows="1" class="pos-note" data-pos="${pos.id}" placeholder="аналоги, «под заказ», риски, уточнения...">${esc(pos.note || '')}</textarea></div>
    </div>`;
  },

  addPosition() {
    const p = Store.getPurchase(this.state.purchaseId);
    if (!p) return;
    Store.addPosition(p.id);
    this.renderPurchaseEditor();
    UI.toast('Позиция добавлена');
  },

  bindPositionEvents(root) {
    const re = (el, save) => { el.oninput = () => { save(el); }; el.onchange = () => { save(el); this.renderPurchaseEditor(); }; };
    root.querySelectorAll('.pos-name').forEach(el => el.oninput = () => Store.updatePosition(this.state.purchaseId, el.dataset.pos, { name: el.value }));
    root.querySelectorAll('.pos-note').forEach(el => el.oninput = () => Store.updatePosition(this.state.purchaseId, el.dataset.pos, { note: el.value }));
    root.querySelectorAll('.pos-qty').forEach(el => re(el, (x) => Store.updatePosition(this.state.purchaseId, x.dataset.pos, { qty: x.value === '' ? null : +x.value })));
    root.querySelectorAll('.pos-price-nmck').forEach(el => re(el, (x) => Store.updatePosition(this.state.purchaseId, x.dataset.pos, { priceNmck: x.value === '' ? null : +x.value })));
    root.querySelectorAll('.kp-link').forEach(el => el.oninput = () => Store.updateKp(this.state.purchaseId, el.dataset.pos, +el.dataset.kp, { link: el.value }));
    root.querySelectorAll('.kp-price').forEach(el => re(el, (x) => Store.updateKp(this.state.purchaseId, x.dataset.pos, +x.dataset.kp, { price: x.value === '' ? null : +x.value })));
    root.querySelectorAll('.kp-stock').forEach(el => el.onchange = () => { Store.updateKp(this.state.purchaseId, el.dataset.pos, +el.dataset.kp, { inStock: el.value }); this.renderPurchaseEditor(); });
    root.querySelectorAll('[data-delpos]').forEach(el => el.onclick = () => {
      Store.removePosition(this.state.purchaseId, el.dataset.delpos);
      this.renderPurchaseEditor();
    });
  },

  /* ============ НАСТРОЙКИ ============ */
  renderSettings() {
    const s = Store.settings();
    const h = `<div class="card"><h3>⚙ Финансовые параметры отдела</h3>
      <div class="grid grid-3">
        <div class="form-row"><label>Наценка на цену подачи, %</label><input type="number" id="sNacenka" value="${s.nacenka}">
          <div class="field-hint">Сколько % компания добавляет СВЕРХ закупочной цены при подаче</div></div>
        <div class="form-row"><label>Тариф электронной площадки, %</label><input type="number" step="0.1" id="sTarif" value="${s.tarif}">
          <div class="field-hint">Берёзка/РТС: обычно 1–1,2% от цены контракта</div></div>
        <div class="form-row"><label>Резерв на непредвиденное, %</label><input type="number" step="0.1" id="sRezerv" value="${s.rezerv}">
          <div class="field-hint">0,5–1% рекомендуется (брак, штрафы, курсы)</div></div>
        <div class="form-row"><label>Налог на прибыль, %</label><input type="number" id="sNalog" value="${s.nalog}">
          <div class="field-hint">УСН доходы−расходы: 15%. Считается с прибыли</div></div>
        <div class="form-row"><label>Прочие отчисления, %</label><input type="number" id="sProchie" value="${s.prochie}">
          <div class="field-hint">Суммируется с налогом</div></div>
        <div class="form-row"><label>Бонус просчётчика, % от ЧП</label><input type="number" id="sBonus" value="${s.bonus}">
          <div class="field-hint">Мотивация сотрудника за сделку</div></div>
      </div>
      <div class="form-actions"><button class="btn" id="btnSaveSettings">💾 Сохранить параметры</button></div>
    </div>
    <div class="card"><h3>👥 Сотрудники (просчётчики)</h3>
      <div class="grid grid-2" id="staffGrid">
        ${(s.sotrudniki || []).map((n, i) => `<div style="display:flex;gap:7px;align-items:center">
          <input type="text" class="staff-name" data-i="${i}" value="${esc(n)}">
          <button class="btn btn-red btn-sm" data-staff-del="${i}" ${(s.sotrudniki || []).length <= 1 ? 'disabled' : ''}>✕</button>
        </div>`).join('')}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn btn-ghost" id="btnAddStaff">+ Добавить сотрудника</button>
        <button class="btn" id="btnSaveStaff">💾 Сохранить сотрудников</button>
      </div>
    </div>
    <div class="card" style="border-color:rgba(255,92,108,.3)"><h3 style="color:var(--red)">⚠ Опасная зона</h3>
      <p class="mut" style="margin-bottom:12px">Полный сброс удалит ВСЕ закупки и вернёт настройки по умолчанию. Сначала сделайте экспорт (кнопка слева внизу).</p>
      <button class="btn btn-red" id="btnReset">Сбросить всё</button>
    </div>`;
    this.viewEl().innerHTML = h;

    this.el('btnSaveSettings').onclick = () => {
      Store.updateSettings({
        nacenka: +this.el('sNacenka').value || 0,
        tarif: +this.el('sTarif').value || 0,
        rezerv: +this.el('sRezerv').value || 0,
        nalog: +this.el('sNalog').value || 0,
        prochie: +this.el('sProchie').value || 0,
        bonus: +this.el('sBonus').value || 0,
      });
      UI.toast('Параметры сохранены'); this.nav('settings');
    };
    this.el('btnAddStaff').onclick = () => {
      const arr = Store.settings().sotrudniki;
      arr.push('Сотрудник ' + (arr.length + 1));
      Store.save(); this.renderSettings();
    };
    this.el('btnSaveStaff').onclick = () => {
      const names = [...this.viewEl().querySelectorAll('.staff-name')].map(x => x.value.trim()).filter(Boolean);
      Store.updateSettings({ sotrudniki: names });
      UI.toast('Сотрудники сохранены'); this.nav('settings');
    };
    this.viewEl().querySelectorAll('[data-staff-del]').forEach(b => b.onclick = () => {
      const arr = Store.settings().sotrudniki;
      arr.splice(+b.dataset.staffDel, 1); Store.save(); this.renderSettings();
    });
    this.el('btnReset').onclick = () => {
      UI.confirm('Сбросить все данные?', 'Все закупки и настройки будут удалены безвозвратно. Рекомендуем сначала сделать экспорт.', () => {
        Store.resetAll(); UI.toast('Данные сброшены', 'warn'); this.nav('dashboard');
      });
    };
  },

  /* ============ ФИНМОДЕЛЬ (АДМИН) ============ */
  numFmt(v) {
    if (v == null || isNaN(v)) return '—';
    return Number.isInteger(Math.round(v * 1e6) / 1e6) ? fmt(v, 0) : fmt(v, 1);
  },

  renderFmodel() {
    const f = Store.fmodel();
    const i = f.inputs;
    const cur = FModelCalc.current();
    const checks = FModelCalc.checks();
    const hasBad = checks.some(c => !c.ok && !c.warn);

    let h = `<div class="card"><h3>🧮 Финансовая модель бизнеса
      <span class="hint">для администратора · точные формулы из «tender_model_calc.xlsx»</span></h3>
      <div class="mut2" style="font-size:12.5px;margin-bottom:12px;line-height:1.55">
        Расчёт дохода, загрузки оборотки и декомпозиция на 12 месяцев. Меняйте жёлтые поля — всё пересчитается автоматически,
        как в Excel (листы: Исходные данные / Сценарии / Декомпозиция 12 мес / Методика).</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="fmReset">⟲ Сбросить к значениям Excel</button>
        <button class="btn btn-ghost btn-sm" id="fmGoCalc">🧮 Открыть калькулятор закупки</button>
      </div>
    </div>`;

    /* ---------- 1. Вводные данные ---------- */
    h += `<div class="card"><h3>1️⃣ Вводные данные
      <span class="hint">жёлтые поля — как в Excel (только их и меняете)</span></h3>
      <div class="grid grid-3">` +
      this.fmField('fm-oborotka', i.oborotka, 'Оборотка (свободные средства для тендеров), ₽', '2 500 000', 100000) +
      this.fmField('fm-chasyNaZayavku', i.chasyNaZayavku, 'Часов на просчёт и подачу ОДНОЙ заявки', '2') +
      this.fmField('fm-chasyVDen', i.chasyVDen, 'Часов в день на просчёты и подачи', '2') +
      this.fmField('fm-chek', i.chek, 'Средний чек контракта (фактический), ₽', '300 000', 10000) +
      this.fmField('fm-marzhaMin', i.marzhaMin, 'МИНИМАЛЬНАЯ чистая маржа с тендера, %', '10', 1) +
      this.fmField('fm-marzhaPlan', i.marzhaPlan, 'Плановая маржа для прогноза, %', '15', 1) +
      this.fmField('fm-marzhaMax', i.marzhaMax, 'МАКСИМАЛЬНАЯ чистая маржа с тендера, %', '20', 1) +
      this.fmField('fm-konzav', i.konvZayavkaPobeda, 'Конверсия: заявка → победа, %', '50', 5) +
      this.fmField('fm-konvpk', i.konvPobedaKontrakt, 'Конверсия: победа → подписание контракта, %', '50', 5) +
      this.fmField('fm-rabDney', i.rabDney, 'Рабочих дней в месяц', '22') +
      this.fmField('fm-oborach', i.oborachivaemost, 'Оборачиваемость оборотки, раз в месяц', '1,5', 0.5) +
      this.fmField('fm-temp', i.tempRosta, 'Темп роста среднего чека, % в месяц', '10', 1) +
      this.fmField('fm-cel', i.celMes, '🎯 ЦЕЛЬ: сколько хотим чистыми в месяц, ₽', '60 000', 5000) +
      `</div>
      <div class="fm-checks">` + checks.map(c =>
        `<div class="fm-check ${c.ok ? 'ok' : (c.warn ? 'warn' : 'bad')}">${c.ok ? '✓' : (c.warn ? '⚠' : '✕')} ${esc(c.label)}${c.ok ? '' : ' <span class="mut2">— ' + esc(c.err) + '</span>'}</div>`
      ).join('') + `</div>
      ${hasBad ? '<div class="mut2" style="font-size:12px;margin-top:8px">Исправьте красные проверки — расчёт ниже может быть некорректен.</div>' : ''}
    </div>`;

    /* ---------- 2. Результаты сейчас ---------- */
    h += `<div class="card"><h3>2️⃣ Результаты — точка старта (месяц 1)</h3>
      <div class="kpi-grid">` +
      this.fmKpi('Идеальный средний чек', fmtMoney(cur.idealChek), 'blue', '1/5 оборотки — защита от риска') +
      this.fmKpi('Заявок можно в день', this.numFmt(cur.zayavokVDen), '', 'часы в день ÷ часы на 1 заявку') +
      this.fmKpi('Выигрышей в день', this.numFmt(cur.vyigryshVDen), '', 'с конверсией заявка → победа') +
      this.fmKpi('Контрактов/мес — ВРЕМЯ', this.numFmt(cur.kontrVremya), 'blue', 'потолок количества сделок') +
      this.fmKpi('Контрактов/мес — ДЕНЬГИ', this.numFmt(cur.kontrDeneg), '', 'оборотка × оборачиваемость ÷ чек') +
      this.fmKpi('Контрактов реально', this.numFmt(cur.kontrReal), cur.uzkoe === 'ВРЕМЯ' ? 'orange' : 'red', 'МИН(время; деньги)') +
      `</div>
      <div class="fm-hero">
        <div class="fm-hero-item"><div class="k-label">Узкое место (ограничитель)</div>
          <div class="fm-uzkoe ${cur.uzkoe === 'ВРЕМЯ' ? 'warn' : 'bad'}">${cur.uzkoe === 'ВРЕМЯ' ? '⏱ ВРЕМЯ — мало заявок' : '💰 ДЕНЬГИ — мало оборотки'}</div>
          <div class="field-hint">Время — добавляйте часы/делегируйте. Деньги — наращивайте оборотку или берите крупнее чеки.</div></div>
        <div class="fm-hero-item"><div class="k-label">Прибыль с 1 контракта (мин / план / макс)</div>
          <div class="fm-big">${fmtMoney(Math.round(cur.pribKontr.min))} <span class="sep">·</span> ${fmtMoney(Math.round(cur.pribKontr.plan))} <span class="sep">·</span> ${fmtMoney(Math.round(cur.pribKontr.max))}</div></div>
        <div class="fm-hero-item"><div class="k-label">Прибыль в МЕСЯЦ (мин / план / макс)</div>
          <div class="fm-big plan">${fmtMoney(Math.round(cur.pribMes.min))} <span class="sep">·</span> ${fmtMoney(Math.round(cur.pribMes.plan))} <span class="sep">·</span> ${fmtMoney(Math.round(cur.pribMes.max))}</div>
          <div class="field-hint">контрактов реально × чек × маржа</div></div>
        <div class="fm-hero-item"><div class="k-label">Прирост оборотки за месяц (план / макс)</div>
          <div class="fm-big">${fmtPct(cur.rostPlanPct)} <span class="sep">·</span> ${fmtPct(cur.rostMaxPct)}</div>
          <div class="field-hint">при полном реинвесте прибыли</div></div>
      </div>
      <div class="fm-goal ${cur.celRealna ? 'ok' : 'bad'}">${cur.celRealna
        ? '🎯 Цель ' + fmtMoney(i.celMes) + '/мес — РЕАЛЬНА (в пределах максимума ' + fmtMoney(Math.round(cur.pribMes.max)) + ')'
        : '🎯 Цель ' + fmtMoney(i.celMes) + '/мес — ВЫШЕ максимума (' + fmtMoney(Math.round(cur.pribMes.max)) + '). Увеличьте часы/чек или снизьте цель.'}</div>
    </div>`;

    /* ---------- 3. Сценарии ---------- */
    h += `<div class="card"><h3>3️⃣ Сценарии развития <span class="hint">точка старта, месяц 1 — клик по строке = выбор для декомпозиции</span></h3>
      <div class="table-wrap"><table class="fm-table">
        <thead><tr><th></th><th>Сценарий</th><th class="num">Чек старт, ₽</th><th class="num">Часов/день</th>
          <th class="num">Заявок/день</th><th class="num">Контр./мес (время)</th><th class="num">Контр./мес (деньги)</th>
          <th>Узкое место</th><th class="num">Прибыль/мес МИН</th><th class="num">Прибыль/мес ПЛАН</th><th class="num">Прибыль/мес МАКС</th>
          <th class="num">Рост оборотки МАКС</th></tr></thead><tbody>` +
      FModelCalc.scenarioDefs().map(sc => {
        const c = FModelCalc.scenarioCalc(sc);
        const sel = f.scenario === sc.id;
        return `<tr class="fm-sc-row ${sel ? 'sel' : ''}" data-sc="${sc.id}" style="cursor:pointer">
          <td>${sel ? '●' : '○'}</td>
          <td><b>${sel ? '▸ ' : ''}${sc.id}. ${esc(sc.name)}</b>${sel ? ' <span class="badge-best">выбран</span>' : ''}</td>
          <td class="num">${fmt(sc.chekStart, 0)}</td>
          <td class="num">${sc.chasy}</td>
          <td class="num">${this.numFmt(c.zayavki)}</td>
          <td class="num">${this.numFmt(c.kontrVremya)}</td>
          <td class="num">${this.numFmt(c.kontrDeneg)}</td>
          <td>${c.uzkoe === 'Время' ? '<span class="pill pill-calc">Время</span>' : '<span class="pill pill-lose">Деньги</span>'}</td>
          <td class="num mut">${fmtMoney(Math.round(c.pribMes.min))}</td>
          <td class="num" style="color:var(--green);font-weight:700">${fmtMoney(Math.round(c.pribMes.plan))}</td>
          <td class="num">${fmtMoney(Math.round(c.pribMes.max))}</td>
          <td class="num">${fmtPct(c.rostMaxPct)}</td></tr>`;
      }).join('') +
      `</tbody></table></div>
      <div class="mut2" style="font-size:12px;margin-top:10px;line-height:1.6">
        • Все сценарии на старте упираются во ВРЕМЯ — денег хватает на больше контрактов, чем вы успеваете.<br>
        • С ростом оборотки чек автоматически укрупняется (см. декомпозицию) — прибыль растёт даже без увеличения часов.<br>
        • Чтобы росло и КОЛИЧЕСТВО сделок — сценарий 3 (4 ч/день) или делегирование помощнику.</div>
    </div>`;

    /* ---------- 4. Декомпозиция ---------- */
    const d = FModelCalc.months(f.scenario);
    const last = d.rows[11];
    h += `<div class="card"><h3>4️⃣ Декомпозиция на 12 месяцев — рост оборотки, чека и прибыли
      <span class="hint">сценарий: ${esc(d.scenario.name)}</span></h3>
      <div class="filters" style="margin-bottom:12px">
        <label style="margin:0">Сценарий для прогноза:</label>
        <select id="fmScenario" style="width:auto">
          ${FModelCalc.scenarioDefs().map(sc => `<option value="${sc.id}" ${f.scenario === sc.id ? 'selected' : ''}>${sc.id}. ${esc(sc.name)}</option>`).join('')}
        </select>
        <span class="mut2" style="font-size:12px">Вывод на личные нужды заполняйте в жёлтой строке — всё остальное считается само.</span>
      </div>
      <div class="table-wrap"><table class="fm-table fm-decomp">
        <thead><tr><th>Показатель</th>${d.rows.map(r => `<th class="num">Мес ${r.m + 1}</th>`).join('')}</tr></thead><tbody>` +
      this.fmRow('Оборотка на начало месяца, ₽', d.rows, r => fmtMoney(Math.round(r.oborotka))) +
      this.fmRow('Часы в день', d.rows, r => fmt(r.chasy)) +
      this.fmRow('Заявок в день', d.rows, r => this.numFmt(r.zayavki)) +
      this.fmRow('Лимит ВРЕМЕНИ: контрактов/мес', d.rows, r => this.numFmt(r.kontrVremya)) +
      `<tr><td class="fm-label">Средний чек месяца, ₽ <span class="mut2">(растёт)</span></td>` + d.rows.map(r => `<td class="num">${fmtMoney(Math.round(r.chek))}</td>`).join('') + `</tr>` +
      this.fmRow('Лимит ДЕНЕГ: контрактов/мес', d.rows, r => this.numFmt(r.kontrDeneg)) +
      `<tr><td class="fm-label">Контрактов реально, шт</td>` + d.rows.map(r => `<td class="num" style="font-weight:700;color:var(--acc2)">${this.numFmt(r.kontr)}</td>`).join('') + `</tr>` +
      this.fmRow('Объём продаж за месяц, ₽', d.rows, r => fmtMoney(Math.round(r.obem))) +
      `<tr><td class="fm-label">Прибыль за месяц (план. маржа), ₽</td>` + d.rows.map(r => `<td class="num pos" style="font-weight:700">${fmtMoney(Math.round(r.pribyl))}</td>`).join('') + `</tr>` +
      `<tr class="fm-wd-row"><td class="fm-label">Вывод на личные нужды, ₽ <span class="mut2">(ввод)</span></td>` + d.rows.map(r =>
        `<td class="num" style="padding:4px 5px"><input type="number" class="fm-wd ${r.warn ? 'bad' : ''}" data-m="${r.m}" value="${f.withdraw[r.m] ? f.withdraw[r.m] : ''}" placeholder="0" style="width:92px"></td>`).join('') + `</tr>` +
      this.fmRow('Оборотка на КОНЕЦ месяца, ₽', d.rows, r => fmtMoney(Math.round(r.konec)), r => r.konec < r.oborotka) +
      this.fmRow('Прирост оборотки за месяц, %', d.rows, r => fmtPct(r.rostPct)) +
      this.fmRow('Прибыль НАКОПИТЕЛЬНО, ₽', d.rows, r => fmtMoney(Math.round(r.pribNak)), null, 'pos') +
      this.fmRow('Вывод НАКОПИТЕЛЬНО, ₽', d.rows, r => fmtMoney(Math.round(r.vyvNak))) +
      `<tr><td class="fm-label">Проверка (вывод ≤ прибыль)</td>` + d.rows.map(r =>
        `<td class="num ${r.warn ? 'neg' : 'pos'}" style="font-weight:700">${r.warn ? '⚠ вывод > прибыль' : '✓ OK'}</td>`).join('') + `</tr>` +
      `</tbody></table></div>
      <div class="kpi-grid" style="margin-top:14px">` +
      this.fmKpi('Прибыль за 12 мес (накоп.)', fmtMoney(Math.round(last.pribNak)), 'green', 'плановая маржа, вывод не учтён') +
      this.fmKpi('Вывод за 12 мес', fmtMoney(Math.round(last.vyvNak)), 'orange', 'на личные нужды') +
      this.fmKpi('Оборотка на конец года', fmtMoney(Math.round(last.konec)), 'blue', 'старт: ' + fmtMoney(Math.round(d.rows[0].oborotka))) +
      this.fmKpi('Рост оборотки за год', fmtPct(d.rows[0].oborotka > 0 ? (last.konec - d.rows[0].oborotka) / d.rows[0].oborotka * 100 : 0), 'blue', 'при выводе 0 — полный реинвест') +
      `</div>
    </div>`;

    /* ---------- 5. Методика ---------- */
    h += `<div class="card guide"><h3 style="margin:0 0 10px">5️⃣ Методика расчёта и формулы</h3>
      <ol style="padding-left:20px">${FModelCalc.methodic.map(t => `<li style="margin-bottom:6px;color:#c6d2e8">${esc(t)}</li>`).join('')}</ol>
      <div class="mut2" style="font-size:12px;margin-top:8px">Источник: лист «Методика и формулы» файла tender_model_calc.xlsx. Модель самодостаточна: менять нужно только вводные (блок 1), выводы на личные нужды (строка в блоке 4) и сценарий прогноза.</div>
    </div>`;

    this.viewEl().innerHTML = h;
    this.bindFmodel();
  },

  fmField(id, val, label, ph, step) {
    return `<div class="form-row"><label>${label}</label>
      <input type="number" class="fm-inp" id="${id}" value="${val == null ? '' : val}" placeholder="${ph}" step="${step != null ? step : 1}" min="0">
      <div class="field-hint" style="min-height:15px"></div></div>`;
  },

  fmKpi(l, v, cls, sub) {
    return `<div class="kpi ${cls}"><div class="k-label">${l}</div><div class="k-val" style="font-size:17px">${v}</div>${sub ? `<div class="k-sub">${sub}</div>` : ''}</div>`;
  },

  fmRow(label, rows, fn, badFn, extraCls) {
    return `<tr><td class="fm-label">${label}</td>` + rows.map(r =>
      `<td class="num ${badFn && badFn(r) ? 'fm-bad-cell' : ''} ${extraCls || ''}">${fn(r)}</td>`).join('') + `</tr>`;
  },

  bindFmodel() {
    // жёлтые вводные: сохраняем по onchange (уход с поля / Enter), чтобы не терять фокус
    const keys = {
      'fm-oborotka': 'oborotka', 'fm-chasyNaZayavku': 'chasyNaZayavku', 'fm-chasyVDen': 'chasyVDen',
      'fm-chek': 'chek', 'fm-marzhaMin': 'marzhaMin', 'fm-marzhaPlan': 'marzhaPlan', 'fm-marzhaMax': 'marzhaMax',
      'fm-konzav': 'konvZayavkaPobeda', 'fm-konvpk': 'konvPobedaKontrakt', 'fm-rabDney': 'rabDney',
      'fm-oborach': 'oborachivaemost', 'fm-temp': 'tempRosta', 'fm-cel': 'celMes',
    };
    Object.keys(keys).forEach(id => {
      const el = this.el(id);
      if (!el) return;
      const save = () => {
        Store.updateFmodelInputs({ [keys[id]]: el.value === '' ? 0 : +el.value });
        UI.toast('Модель пересчитана', 'ok', 1200);
        this.renderFmodel();
      };
      el.onchange = save;
      el.onkeydown = e => { if (e.key === 'Enter') { el.blur(); } };
    });
    // выбор сценария
    const scSel = this.el('fmScenario');
    if (scSel) scSel.onchange = () => { Store.setScenario(+scSel.value); this.renderFmodel(); };
    this.viewEl().querySelectorAll('.fm-sc-row').forEach(tr => tr.onclick = () => {
      Store.setScenario(+tr.dataset.sc);
      this.renderFmodel();
    });
    // вывод на личные нужды
    this.viewEl().querySelectorAll('.fm-wd').forEach(inp => {
      const save = () => {
        Store.setWithdraw(+inp.dataset.m, +inp.value || 0);
        this.renderFmodel();
      };
      inp.onchange = save;
      inp.onkeydown = e => { if (e.key === 'Enter') inp.blur(); };
    });
    // кнопки
    const r = this.el('fmReset');
    if (r) r.onclick = () => {
      UI.confirm('Сбросить финмодель?', 'Все вводные, сценарий и выводы вернутся к значениям из Excel (оборотка 2,5 млн, чек 300 тыс., маржа 10–20%, цель 60 тыс.).', () => {
        Store.resetFmodel();
        UI.toast('Модель сброшена к Excel', 'ok');
        this.renderFmodel();
      });
    };
    const gc = this.el('fmGoCalc');
    if (gc) gc.onclick = () => this.nav('purchase');
  },

  /* ============ ИНСТРУКЦИЯ ============ */
  renderAbout() {
    this.viewEl().innerHTML = `<div class="card guide">
      <h2 style="margin-bottom:6px">📘 Работа с CRM «Тендерный отдел»</h2>
      <div class="mut" style="margin-bottom:14px">Статическое приложение. Данные хранятся в вашем браузере (localStorage). Делайте регулярный экспорт-бэкап.</div>
      <h3>1. Новая закупка</h3>
      <ol><li>«Реестр закупок» → «+ Новая закупка».</li>
      <li>В карточке заполните реквизиты: номер, заказчика, дедлайн, ссылку.</li>
      <li>Добавьте позиции из Тех.задания: наименование (точно как в ТЗ!), кол-во, цену за ед. по НМЦК. НМЦК посчитается сам.</li></ol>
      <h3>2. Поиск поставщиков</h3>
      <ol><li>На каждую позицию найдите 3 РАЗНЫХ поставщика (КП1/КП2/КП3), впишите цену за шт и ссылку.</li>
      <li>Честно отметьте наличие. «ПОД ЗАКАЗ» — риск срыва сроков!</li>
      <li>Лучшая цена подсвечивается зелёным. Закупочные мин/средн/макс и маржа считаются автоматически.</li></ol>
      <h3>3. Решение о подаче</h3>
      <ol><li>Смотрите маржу в карточке и реестре. Цена подачи = закупка × (1 + наценка).</li>
      <li>Правило отдела: подаём, если ЧП ≥ 10% НМЦК и нет стоп-факторов.</li>
      <li>Статус «Подана», назначьте просчётчика.</li></ol>
      <h3>4. После торгов</h3>
      <ol><li>Победили → статус «ПОБЕДА», впишите цену победы, фактическую закупочную и логистику.</li>
      <li>Тариф, налог, ЧП и бонус просчётчика посчитаются сами.</li>
      <li>Проиграли/отменили → поставьте статус: уйдёт в статистику конверсии.</li></ol>
      <h3>5. Резервное копирование</h3>
      <p>💾 «Экспорт (бэкап)» скачивает JSON со всеми данными. «📥 Импорт JSON» восстанавливает. Храните бэкапы в облаке/репозитории.</p>
      <h3>Известные ограничения v1</h3>
      <ul><li>Данные привязаны к браузеру/устройству — общая база для нескольких сотрудников появится в v2 (подключение Supabase).</li>
      <li>GitHub Pages — только статика; весь расчёт выполняется в браузере.</li></ul>
    </div>`;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
