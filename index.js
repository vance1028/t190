#!/usr/bin/env node

const path = require('path');
const { loadTournament, validateTournament } = require('./src/validator');
const { rateMatches } = require('./src/rating');
const { runMonteCarlo, buildProbabilityTable } = require('./src/simulator');
const { computeGroupRankings } = require('./src/bracket');
const { printRatingReport, printProbabilityReport, printValidationReport, writeJson } = require('./src/printer');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { _: [] };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--help' || a === '-h') { opts.help = true; i++; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let key, val;
      if (eq > 0) { key = a.slice(2, eq); val = a.slice(eq + 1); }
      else {
        key = a.slice(2); val = args[i + 1]; i++;
      }
      const lower = key.toLowerCase();
      if (['runs', 'seed', 'k'].includes(lower)) val = Number(val);
      opts[lower] = val;
    } else opts._.push(a);
    i++;
  }
  return opts;
}

function printHelp() {
  console.log(`
杯赛蒙特卡洛模拟工具
====================
用法:
  node index.js <command> [options]

命令:
  validate                           校验赛程与配置合理性
  rate                             输出各队当前 Elo 实力分与变化历史
  simulate [--runs N] [--seed S]  运行蒙特卡洛模拟并输出概率
  scenario <matchId> <result>        手动指定某场未赛比赛结果后模拟
                                     result 格式: "2-1" 或 "1-1"

通用选项:
  --data <path>       指定赛程 JSON 路径 (默认: data/tournament.json)
  --json-out <path>     把结构化结果写到此 JSON 文件
  --help, -h           显示本帮助

simulate/scenario 选项:
  --runs <N>         模拟次数 (默认 1000)
  --seed <S>         随机种子 (正整数, 结果可复现)

scenario 例子:
  node index.js scenario M05 2-0 --runs 2000 --seed 7
`);
}

function findMatch(tournament, id) {
  return tournament.matches.find((m) => m.id === id);
}

function applyScenarioResult(tournament, matchId, resultStr) {
  const m = findMatch(tournament, matchId);
  if (!m) throw new Error(`未找到比赛: ${matchId}`);
  if (m.played) throw new Error(`比赛 ${matchId} 已进行，不能修改`);
  const m2 = { ...m };
  const parts = resultStr.split('-');
  if (parts.length !== 2) throw new Error(`结果格式错误，应为 "2-1" 形式`);
  const hs = Number(parts[0]);
  const as = Number(parts[1]);
  if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
    throw new Error(`比分必须是非负整数`);
  }
  m2.homeScore = hs;
  m2.awayScore = as;
  m2.played = true;
  const rest = tournament.matches.map((x) => x.id === matchId ? m2 : x);
  return { ...tournament, matches: rest };
}

function applyScenarioKnockout(tournament, matchId, resultStr) {
  for (const roundName of tournament.format.knockout.rounds) {
    const roundMatches = tournament.knockoutBracket[roundName] || [];
    const found = roundMatches.find((x) => x.id === matchId);
    if (found) {
      throw new Error(`淘汰赛 ${matchId} 的对阵需等小组赛结束后才能确定。请对小组赛使用 scenario 命令。`);
    }
  }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv);
  const cmd = opts._[0] || 'help';
  const dataPath = opts.data || path.join(__dirname, 'data', 'tournament.json');
  const jsonOut = opts['json-out'];

  if (opts.help || cmd === 'help') { printHelp(); process.exit(0); }

  if (!['validate', 'rate', 'simulate', 'scenario'].includes(cmd)) {
    console.error(`未知命令: ${cmd}`); printHelp(); process.exit(1);
  }

  let tournament;
  try { tournament = loadTournament(dataPath); }
  catch (e) { console.error(`加载赛程失败: ${e.message}`); process.exit(1); }

  // ===== validate =====
  if (cmd === 'validate') {
    const vr = validateTournament(tournament);
    printValidationReport(vr);
    if (jsonOut) {
      const written = writeJson(jsonOut, { validation: vr });
      console.log(`\n验证结果已写入: ${written}`);
    }
    process.exit(vr.valid ? 0 : 1);
  }

  // 非 validate 命令先校验一次，错误就退出
  const vr = validateTournament(tournament);
  if (!vr.valid) {
    console.error('赛程数据存在错误，请先修复或重新 validate:');
    vr.errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  // ===== rate =====
  if (cmd === 'rate') {
    const ratingResult = rateMatches(tournament.teams, tournament.matches);
    printRatingReport(tournament, ratingResult);
    const standings = computeGroupRankings(tournament, tournament.matches);
    const currentStandings = {};
    Object.keys(standings).forEach((g) => {
      currentStandings[g] = standings[g].map(s => ({
        rank: s.rank, team: s.team, played: s.played, points: s.points, goalDiff: s.goalDiff, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst }));
    });
    if (jsonOut) {
      const payload = {
        ratings: ratingResult.ratings,
        history: ratingResult.history,
        playedMatches: ratingResult.sorted.map(m => ({ id: m.id, date: m.date, home: m.home, away: m.away, homeScore: m.homeScore, awayScore: m.awayScore })),
        standings: currentStandings
      };
      console.log('\n结构化结果已写入: ' + writeJson(jsonOut, payload));
    }
    process.exit(0);
  }

  // ===== scenario =====
  let scenarioNote = null;
  if (cmd === 'scenario') {
    const matchId = opts._[1];
    const resultStr = opts._[2];
    if (!matchId || !resultStr) {
      console.error('用法: node index.js scenario <matchId> <result');
      console.error('例子: node index.js scenario M05 2-1');
      process.exit(1);
    }
    try {
      tournament = applyScenarioResult(tournament, matchId, resultStr);
      scenarioNote = { matchId, forcedResult: resultStr };
      console.log(`\n情景模式：已将比赛 ${matchId} 结果设为 ${resultStr}`);
    } catch (e) {
      console.error(e.message); process.exit(1);
    }
  }

  // ===== simulate =====
  const runs = opts.runs || 1000;
  const seed = opts.seed != null ? opts.seed : undefined;

  const mcResult = runMonteCarlo(tournament, {
    runs,
    seed,
    onProgress: (done, total) => {
      if (total >= 5000) {
        const pct = Math.round(done / total * 100);
        process.stdout.write(`\r  模拟进度: ${done}/${total} (${pct}%)`);
      }
    }
  });
  if (runs >= 5000) process.stdout.write('\n');

  const table = buildProbabilityTable(tournament, mcResult);
  printProbabilityReport(tournament, table, mcResult);

  if (jsonOut) {
    const standings = computeGroupRankings(tournament, tournament.matches);
    const payload = {
      meta: {
        runs: mcResult.runs,
        seed: mcResult.seed,
        dataFile: dataPath,
        scenario: scenarioNote,
        totals: mcResult.totals
      },
      probabilities: table,
      probs: mcResult.probs,
      counts: mcResult.counts,
      ratings: mcResult.ratingSnapshot,
      currentGroupStandings: Object.fromEntries(
        Object.entries(standings).map(([g, rows]) => [g, rows.map(s => ({
          rank: s.rank, team: s.team, points: s.points, goalDiff: s.goalDiff, goalsFor: s.goalsFor, played: s.played
        }))])
      )
    };
    console.log('\n结构化结果已写入: ' + writeJson(jsonOut, payload));
  }
  process.exit(0);
}

main().catch((e) => { console.error('未预期错误: ' + (e.stack || e.message)); process.exit(2); });
