/* ============================================================
   Тендерный отдел CRM — хранилище данных и расчётная логика
   Данные хранятся в localStorage браузера. Экспорт/импорт JSON.
   ============================================================ */
'use strict';

const STATUSES = [
  { id: 'work',     label: 'В работе',      cls: 'pill-work' },
  { id: 'calc',     label: 'Идёт просчёт',  cls: 'pill-calc' },
  { id: 'sent',     label: 'Подана',        cls: 'pill-sent' },
  { id: 'win',      label: 'ПОБЕДА',        cls: 'pill-win' },
  { id: 'lose',     label: 'Проигрыш',      cls: 'pill-lose' },
  { id: 'cancel',   label: 'Отменена',      cls: 'pill-cancel' },
  { id: 'skip',     label: 'Не подаём',     cls: 'pill-skip' },
];
const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]));

const DEFAULT_SETTINGS = {
  nacenka: 15,      // наценка на цену подачи, %
  tarif: 1.2,       // тариф площадки, % от цены контракта
  rezerv: 0,        // резерв на непредвиденное, %
  nalog: 15,        // налог на прибыль, %
  prochie: 1,       // прочие отчисления, %
  bonus: 15,        // бонус просчётчика, % от ЧП
  sotrudniki: ['Просчётчик 1'], // список ФИО
};

const DEFAULT_PURCHASE = () => ({
  id: uid(),
  num: '',            // номер закупки
  link: '',           // ссылка на закупку
  customer: '',       // заказчик
  deadline: '',       // дедлайн подачи
  delivery: '',       // срок поставки
  region: '',         // регион/адрес
  nmck: null,         // НМЦК (руб) — если пусто, считается из позиций
  status: 'work',
  proschotchik: '',
  winPrice: null,     // цена победы
  factPrice: null,    // фактическая закупочная цена (если пусто = мин. закупка)
  logistics: 0,       // логистика, руб
  contacts: '',       // контакты заказчика
  comment: '',        // комментарий
  created: Date.now(),
  positions: [],      // см. DEFAULT_POSITION
});

const DEFAULT_POSITION = () => ({
  id: uid(),
  name: '',           // наименование по ТЗ
  qty: null,          // количество
  priceNmck: null,    // цена за ед. по НМЦК
  // до 3 коммерческих предложений
  kp: [
    { price: null, link: '', inStock: 'choose' },
    { price: null, link: '', inStock: 'choose' },
    { price: null, link: '', inStock: 'choose' },
  ],
  note: '',           // примечания просчётчика
});
const STOCK_OPTS = [
  { id: 'choose', label: 'ВЫБРАТЬ' },
  { id: 'yes',    label: 'ДА (подтверждено)' },
  { id: 'order',  label: 'ПОД ЗАКАЗ' },
  { id: 'no',     label: 'НЕТ' },
  { id: 'check',  label: 'УТОЧНИТЬ' },
];

/* ---------- хранилище ---------- */
const Store = {
  _data: null,

  load() {
    try {
      const raw = localStorage.getItem('tenderCrm.v1');
      this._data = raw ? JSON.parse(raw) : null;
    } catch (e) { this._data = null; }
    if (!this._data) {
      this._data = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), purchases: [] };
      this.save();
    }
    // подстраховка от старой/битой структуры
    this._data.settings = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), this._data.settings || {});
    this._data.purchases = this._data.purchases || [];
    return this._data;
  },
  data() { return this._data || this.load(); },
  save() { localStorage.setItem('tenderCrm.v1', JSON.stringify(this._data)); },

  /* --- настройки --- */
  settings() { return this.data().settings; },
  updateSettings(patch) {
    Object.assign(this.settings(), patch);
    this.save();
  },

  /* --- закупки --- */
  purchases() { return this.data().purchases; },
  getPurchase(id) { return this.purchases().find(p => p.id === id); },
  addPurchase(data) {
    const p = Object.assign(DEFAULT_PURCHASE(), data || {});
    this.purchases().push(p);
    this.save();
    return p;
  },
  updatePurchase(id, patch) {
    const p = this.getPurchase(id);
    if (!p) return null;
    Object.assign(p, patch);
    this.save();
    return p;
  },
  deletePurchase(id) {
    const i = this.purchases().findIndex(p => p.id === id);
    if (i >= 0) { this.purchases().splice(i, 1); this.save(); }
  },
  duplicatePurchase(id) {
    const src = this.getPurchase(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid(); copy.num = (src.num ? src.num + ' (копия)' : ''); copy.status = 'work';
    copy.winPrice = null; copy.factPrice = null; copy.logistics = 0;
    copy.created = Date.now();
    copy.positions = (src.positions || []).map(p => { p.id = uid(); return p; });
    this.purchases().push(copy);
    this.save();
    return copy;
  },

  /* --- позиции --- */
  addPosition(purchaseId) {
    const p = this.getPurchase(purchaseId);
    if (!p) return;
    p.positions.push(DEFAULT_POSITION());
    this.save();
  },
  removePosition(purchaseId, posId) {
    const p = this.getPurchase(purchaseId);
    if (!p) return;
    p.positions = p.positions.filter(x => x.id !== posId);
    this.save();
  },
  updatePosition(purchaseId, posId, patch) {
    const p = this.getPurchase(purchaseId);
    if (!p) return;
    const pos = p.positions.find(x => x.id === posId);
    if (!pos) return;
    Object.assign(pos, patch);
    this.save();
  },
  updateKp(purchaseId, posId, kpIdx, patch) {
    const p = this.getPurchase(purchaseId);
    if (!p) return;
    const pos = p.positions.find(x => x.id === posId);
    if (!pos || !pos.kp[kpIdx]) return;
    Object.assign(pos.kp[kpIdx], patch);
    this.save();
  },

  /* --- экспорт/импорт --- */
  exportJson() {
    return JSON.stringify({ app: 'tender-crm', version: 1, exported: new Date().toISOString(), data: this._data }, null, 2);
  },
  importJson(text) {
    const obj = JSON.parse(text);
    if (!obj || !obj.data || !obj.data.purchases) throw new Error('Неверный формат файла');
    this._data = obj.data;
    this.save();
    return this._data;
  },
  resetAll() {
    this._data = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), purchases: [] };
    this.save();
  },
};

/* ============================================================
   РАСЧЁТНАЯ ЛОГИКА (перенесена из Excel-таблицы)
   ============================================================ */
const Calc = {
  /* НМЦК закупки: явное значение либо сумма позиций (кол-во × цена по НМЦК) */
  nmck(p) {
    if (p.nmck != null && p.nmck !== '' && !isNaN(+p.nmck)) return round2(+p.nmck);
    return round2(p.positions.reduce((s, x) => s + this.posNmck(x), 0));
  },
  posNmck(pos) {
    if (!pos.qty || pos.priceNmck == null || pos.priceNmck === '') return 0;
    return (+pos.qty) * (+pos.priceNmck);
  },
  /* общая стоимость позиции у поставщика */
  kpTotal(pos, kpIdx) {
    const kp = pos.kp[kpIdx];
    if (!kp || !pos.qty || kp.price == null || kp.price === '') return 0;
    return (+pos.qty) * (+kp.price);
  },
  /* лучшие цены по позиции: мин/сред/макс из заполненных КП */
  posPrices(pos) {
    const totals = pos.kp.map((_, i) => this.kpTotal(pos, i)).filter(v => v > 0);
    if (!totals.length) return { min: 0, avg: 0, max: 0, cnt: 0, bestIdx: -1 };
    const min = Math.min(...totals), max = Math.max(...totals);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    const bestIdx = totals.indexOf(min);
    return { min, avg: round2(avg), max, cnt: totals.length, bestIdx };
  },
  /* закупочная цена всей закупки (сумма по позициям выбранной стратегии) */
  zakupka(p, mode = 'min') {
    return round2(p.positions.reduce((s, pos) => {
      const pr = this.posPrices(pos);
      if (mode === 'min') return s + pr.min;
      if (mode === 'avg') return s + pr.avg;
      return s + pr.max;
    }, 0));
  },
  /* маржа в рублях и % (НМЦК − закупка) */
  marzha(p, mode = 'min') {
    const n = this.nmck(p), z = this.zakupka(p, mode);
    return { rub: round2(n - z), pct: n > 0 ? (n - z) / n * 100 : 0 };
  },
  /* цена подачи с наценкой */
  cenaPodachi(p, mode = 'min') {
    return round2(this.zakupka(p, mode) * (1 + this.pct(this.settings().nacenka)));
  },
  pct(v) { return (+v || 0) / 100; },

  /* фактическая закупочная цена для расчёта прибыли */
  factZakupka(p) {
    if (p.factPrice != null && p.factPrice !== '' && !isNaN(+p.factPrice)) return +p.factPrice;
    return this.zakupka(p, 'min');
  },
  settings() { return Store.settings(); },

  /* Финансовый результат по победившей сделке */
  finance(p) {
    const s = this.settings();
    const w = p.winPrice != null && p.winPrice !== '' ? +p.winPrice : 0;
    const z = this.factZakupka(p);
    const log = +p.logistics || 0;
    const tarif = round2(w * this.pct(s.tarif));
    const rez = round2(w * this.pct(s.rezerv));
    const pribyl = round2(w - z - log - tarif - rez);       // прибыль до налога
    const tax = pribyl > 0 ? round2(pribyl * (this.pct(s.nalog) + this.pct(s.prochie))) : 0;
    const chp = round2(pribyl - tax);                        // чистая прибыль
    const bonus = chp > 0 ? round2(chp * this.pct(s.bonus)) : 0;
    return { w, z, log, tarif, rez, pribyl, tax, chp, bonus };
  },

  /* агрегаты для дашборда */
  aggregates(purchases) {
    const s = this.settings();
    let cnt = 0, inWork = 0, sent = 0, wins = 0, loses = 0, cancels = 0;
    let sumNmck = 0, sumContracts = 0, sumChp = 0, sumTax = 0, sumBonus = 0, sumNacenkaRub = 0;
    purchases.forEach(p => {
      cnt++;
      if (p.status === 'work' || p.status === 'calc') inWork++;
      if (p.status === 'sent') sent++;
      if (p.status === 'win') { wins++; sumContracts += +p.winPrice || 0; }
      if (p.status === 'lose') loses++;
      if (p.status === 'cancel' || p.status === 'skip') cancels++;
      sumNmck += this.nmck(p);
      if (p.status === 'win') {
        const f = this.finance(p);
        sumChp += f.chp; sumTax += f.tax; sumBonus += f.bonus;
      }
      // потенциальная наценка по заявкам (мин. стратегия) — если бы выиграли по цене подачи
      if (p.status === 'sent' || p.status === 'win') {
        sumNacenkaRub += this.cenaPodachi(p) - this.zakupka(p);
      }
    });
    const submitted = sent + wins + loses;
    return {
      cnt, inWork, sent, wins, loses, cancels, submitted,
      conv: submitted > 0 ? wins / submitted * 100 : 0,
      sumNmck: round2(sumNmck), sumContracts: round2(sumContracts),
      sumChp: round2(sumChp), sumTax: round2(sumTax), sumBonus: round2(sumBonus),
      sumNacenkaRub: round2(sumNacenkaRub),
    };
  },

  /* сводка по сотрудникам */
  byStaff(purchases) {
    const s = this.settings();
    const map = {};
    (s.sotrudniki || []).filter(Boolean).forEach(name => map[name] = { name, cnt: 0, inWork: 0, wins: 0, bonus: 0, chp: 0 });
    purchases.forEach(p => {
      const name = p.proschotchik;
      if (!name) return;
      if (!map[name]) map[name] = { name, cnt: 0, inWork: 0, wins: 0, bonus: 0, chp: 0 };
      map[name].cnt++;
      if (p.status === 'work' || p.status === 'calc') map[name].inWork++;
      if (p.status === 'win') {
        map[name].wins++;
        const f = this.finance(p);
        map[name].bonus += f.bonus;
        map[name].chp += f.chp;
      }
    });
    const arr = Object.values(map);
    arr.forEach(x => { x.bonus = round2(x.bonus); x.chp = round2(x.chp); });
    return arr.sort((a, b) => b.bonus - a.bonus || b.cnt - a.cnt);
  },
};

function round2(x) { return Math.round((+x + Number.EPSILON) * 100) / 100; }
function fmt(n, digits = 0) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}
function fmtMoney(n) { return (n == null || isNaN(n)) ? '—' : fmt(n) + ' ₽'; }
function fmtPct(n) { return (n == null || isNaN(n)) ? '—' : fmt(n, 1) + '%'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function todayStr() {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
