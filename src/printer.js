const fs = require('fs');
const path = require('path');

function pct(v, digits = 2) {
  return (v * 100).toFixed(digits) + '%';
}

function padRight(s, w) {
  s = String(s);
  const len = displayWidth(s);
  if (len >= w) return s;
  return s + ' '.repeat(w - len);
}

function padLeft(s, w) {
  s = String(s);
  const len = displayWidth(s);
  if (len >= w) return s;
  return ' '.repeat(w - len) + s;
}

function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp > 0x7F) w += 2; else w += 1;
  }
  return w;
}

function renderTable(headers, rows, opts = {}) {
  const align = opts.align || [];
  const cols = headers.length;
  const widths = headers.map((h, i) => {
    let w = displayWidth(h);
    rows.forEach((r) => { if (r[i] != null) w = Math.max(w, displayWidth(r[i])); });
    return w + 2;
  });
  const sep = widths.map((w) => '-'.repeat(w)).join('+');
  const top = '+' + sep + '+';
  const headerRow = '|' + headers.map((h, i) => padRight(h, widths[i])).join('|') + '|';
  const body = rows.map((r) => {
    return '|' + r.map((cell, i) => {
      const a = align[i] || 'left';
      const v = cell == null ? '' : cell;
      return a === 'right' ? padLeft(v, widths[i]) : padRight(v, widths[i]);
    }).join('|') + '|';
  }).join('\n');
  return [top, headerRow, '+' + sep + '+', body, '+' + sep + '+'].join('\n');
}

function printRatingReport(tournament, ratingResult) {
  const { ratings, history, sorted } = ratingResult;
  const rows = tournament.teams.map((t) => {
    const h = history[t.id];
    const last = h[h.length - 1];
    const delta = last.after - t.baseRating;
    const sign = delta > 0 ? '+' : '';
    return [t.id, t.name, t.baseRating.toFixed(1), last.after.toFixed(1), sign + delta.toFixed(2), h.length - 1];
  });
  rows.sort((a, b) => parseFloat(b[3]) - parseFloat(a[3]));
  const headers = ['ID', '球队', '基础分', '当前分', '变化', '场数'];
  const align = ['left', 'left', 'right', 'right', 'right', 'right'];
  console.log('\n===== 当前各队实力分 =====');
  console.log(renderTable(headers, rows, { align }));

  if (sorted.length > 0) {
    console.log('\n===== 评分变化历史 (按比赛顺序) =====');
    sorted.forEach((m) => {
      const deltaH = (history[m.home].find((e) => e.matchId === m.id) || {}).delta || 0;
      const deltaA = (history[m.away].find((e) => e.matchId === m.id) || {}).delta || 0;
      const signH = deltaH >= 0 ? '+' : '';
      const signA = deltaA >= 0 ? '+' : '';
      console.log(`  ${m.date || '--------'} ${m.home} ${m.homeScore} - ${m.awayScore} ${m.away}  [${m.home} ${signH}${deltaH.toFixed(2)} | ${m.away} ${signA}${deltaA.toFixed(2)}]`);
    });
  }
}

function printProbabilityReport(tournament, table, mcResult) {
  const headers = ['排名', 'ID', '球队', 'Elo分', '夺冠', '进决赛', '出线'];
  const rows = table.map((r, i) => [
    i + 1, r.id, r.name,
    r.rating.toFixed(1),
    pct(r.champion, 2),
    pct(r.final, 2),
    pct(r.advance, 2)
  ]);
  const align = ['right', 'left', 'left', 'right', 'right', 'right', 'right'];
  console.log(`\n===== 蒙特卡洛模拟结果 (${mcResult.runs} 次, 种子=${mcResult.seed}) =====`);
  console.log(renderTable(headers, rows, { align }));
  console.log(`\n  概率校验: 夺冠=${(mcResult.totals.champion).toFixed(4)} (期望≈${mcResult.expected.champion}), 进决赛=${(mcResult.totals.final).toFixed(4)} (期望≈${mcResult.expected.final}), 出线=${(mcResult.totals.advance).toFixed(4)} (期望=${mcResult.expected.advance})`);
}

function printValidationReport(result) {
  if (result.valid) {
    console.log('✅ 赛程数据校验通过');
  } else {
    console.log('❌ 赛程数据校验失败');
  }
  console.log(`   统计: ${result.stats.teamCount} 球队 / ${result.stats.matchCount} 比赛 / ${result.stats.bracketCount} 淘汰赛`);
  if (result.warnings.length > 0) {
    console.log(`\n⚠️  警告 (${result.warnings.length}):`);
    result.warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
  }
  if (result.errors.length > 0) {
    console.log(`\n❌ 错误 (${result.errors.length}):`);
    result.errors.forEach((e, i) => console.log(`   ${i + 1}. ${e}`));
  }
}

function writeJson(filePath, data) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2), 'utf8');
  return abs;
}

module.exports = {
  renderTable,
  printRatingReport,
  printProbabilityReport,
  printValidationReport,
  writeJson,
  pct
};
