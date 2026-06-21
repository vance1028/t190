const { createRNG, simulateFullTournament } = require('./bracket');
const { rateMatches } = require('./rating');

function runMonteCarlo(tournament, options = {}) {
  const runs = options.runs || 1000;
  const seed = options.seed != null ? options.seed : Math.floor(Math.random() * 2147483646);
  const progressCb = options.onProgress || null;

  const teams = tournament.teams;
  const teamIds = teams.map((t) => t.id);
  const { ratings } = rateMatches(teams, tournament.matches);

  const counts = {
    champion: {},
    final: {},
    advance: {}
  };
  teamIds.forEach((tid) => {
    counts.champion[tid] = 0;
    counts.final[tid] = 0;
    counts.advance[tid] = 0;
  });

  const rngMaster = createRNG(seed);
  const seeds = new Array(runs).fill(0).map(() => Math.floor(rngMaster() * 2147483646) + 1);

  const REPORT_EVERY = Math.max(1, Math.floor(runs / 50));

  for (let i = 0; i < runs; i++) {
    const randFn = createRNG(seeds[i]);
    const out = simulateFullTournament(tournament, ratings, randFn);

    if (out.champion) counts.champion[out.champion] += 1;
    (out.final || []).forEach((t) => { counts.final[t] += 1; });
    (out.advance || []).forEach((t) => { counts.advance[t] += 1; });

    if (progressCb && ((i + 1) % REPORT_EVERY === 0 || i + 1 === runs)) {
      progressCb(i + 1, runs);
    }
  }

  const probs = { champion: {}, final: {}, advance: {} };
  teamIds.forEach((tid) => {
    probs.champion[tid] = clamp(counts.champion[tid] / runs);
    probs.final[tid] = clamp(counts.final[tid] / runs);
    probs.advance[tid] = clamp(counts.advance[tid] / runs);
  });

  const totalChamp = teamIds.reduce((s, t) => s + probs.champion[t], 0);
  const totalFinal = teamIds.reduce((s, t) => s + probs.final[t], 0);

  return {
    runs,
    seed,
    counts,
    probs,
    totals: { champion: totalChamp, final: totalFinal },
    ratingSnapshot: { ...ratings }
  };
}

function clamp(v) {
  const r = Math.round(v * 1000000) / 1000000;
  if (r < 0) return 0;
  if (r > 1) return 1;
  return r;
}

function buildProbabilityTable(tournament, mcResult) {
  const rows = tournament.teams.map((t) => ({
    id: t.id,
    name: t.name,
    rating: mcResult.ratingSnapshot[t.id],
    champion: mcResult.probs.champion[t.id],
    final: mcResult.probs.final[t.id],
    advance: mcResult.probs.advance[t.id]
  }));
  rows.sort((a, b) => b.champion - a.champion || b.rating - a.rating);
  return rows;
}

module.exports = { runMonteCarlo, buildProbabilityTable };
