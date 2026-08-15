// 日付・週の境界。すべてローカルタイムで扱う(読書は生活時間で見るため)。

export function dateKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** その週の月曜0時のepoch ms。 */
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const shift = (d.getDay() + 6) % 7; // 月曜=0
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

export function weekKey(ts) {
  return dateKey(weekStart(ts));
}

export function weekLabel(ts) {
  const d = new Date(weekStart(ts));
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 直近n週間の週キー(古い順)。 */
export function recentWeeks(n, now = Date.now()) {
  const start = weekStart(now);
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const ts = start - i * 7 * 24 * 60 * 60 * 1000;
    out.push({ key: weekKey(ts), label: weekLabel(ts), start: weekStart(ts) });
  }
  return out;
}
