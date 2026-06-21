const { expectedScore, HOME_ADVANTAGE } = require('./rating');

const DRAW_EDGE_SENSITIVITY = 0.58;
const PENALTY_HOME_EDGE = 0.02;

function splitProbabilities(rHome, rAway, options = {}) {
  const hAdv = options.homeAdvantage != null ? options.homeAdvantage : HOME_ADVANTAGE;
  const effHome = rHome + hAdv;
  const winHome = expectedScore(effHome, rAway);
  const winAway = 1 - winHome;
  const gap = Math.abs(winHome - winAway);
  const drawPeak = DRAW_EDGE_SENSITIVITY;
  const drawFactor = Math.max(0, 1 - gap * drawPeak);
  const drawBase = 0.28;
  const probDraw = Math.min(0.42, drawBase + 0.18 * drawFactor);
  let pH = winHome - probDraw / 2;
  let pA = winAway - probDraw / 2;
  if (pH < 0.01) { pA += pH - 0.01; pH = 0.01; }
  if (pA < 0.01) { pH += pA - 0.01; pA = 0.01; }
  const total = pH + pA + probDraw;
  pH = pH / total;
  pA = pA / total;
  const probDrawN = probDraw / total;
  return { homeWin: pH, awayWin: pA, draw: probDrawN };
}

function sampleMatchOutcome(rHome, rAway, randFn) {
  const { homeWin, awayWin, draw } = splitProbabilities(rHome, rAway);
  const r = randFn();
  if (r < homeWin) return 'home';
  if (r < homeWin + draw) return 'draw';
  return 'away';
}

function penaltyProbability(rHome, rAway) {
  const diff = rHome - rAway;
  const base = 0.5 + PENALTY_HOME_EDGE + diff / 2500;
  return Math.max(0.2, Math.min(0.8, base));
}

function resolveKnockoutWinner(rHome, rAway, randFn) {
  const outcome = sampleMatchOutcome(rHome, rAway, randFn);
  if (outcome === 'home') return { winner: 'home', via: 'normal' };
  if (outcome === 'away') return { winner: 'away', via: 'normal' };
  const p = penaltyProbability(rHome, rAway);
  const r = randFn();
  if (r < p) return { winner: 'home', via: 'penalties' };
  return { winner: 'away', via: 'penalties' };
}

function sampleGoals(rHome, rAway, randFn, options = {}) {
  const hAdv = options.homeAdvantage != null ? options.homeAdvantage : HOME_ADVANTAGE;
  const prob = splitProbabilities(rHome, rAway, options);
  const result = sampleMatchOutcome(rHome, rAway, randFn);
  let homeScore, awayScore;
  const diff = (rHome + hAdv - rAway) / 50;
  const lambdaHome = Math.max(0.4, 1.2 + 0.35 * diff);
  const lambdaAway = Math.max(0.35, 1.0 - 0.3 * diff);
  homeScore = poissonSample(lambdaHome, randFn);
  awayScore = poissonSample(lambdaAway, randFn);
  if (result === 'home' && homeScore <= awayScore) {
    homeScore = awayScore + 1 + (randFn() < 0.55 ? 1 : 0);
  } else if (result === 'away' && awayScore <= homeScore) {
    awayScore = homeScore + 1 + (randFn() < 0.55 ? 1 : 0);
  } else if (result === 'draw' && homeScore !== awayScore) {
    if (homeScore > awayScore) {
      if (randFn() < 0.5) homeScore = awayScore;
      else awayScore = homeScore;
    } else {
      if (randFn() < 0.5) awayScore = homeScore;
      else homeScore = awayScore;
    }
  }
  return { homeScore, awayScore, result };
}

function poissonSample(lambda, randFn) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (true) {
    k += 1;
    p *= randFn();
    if (p <= L) return k - 1;
    if (k > 20) return k - 1;
  }
}

module.exports = {
  splitProbabilities,
  sampleMatchOutcome,
  penaltyProbability,
  resolveKnockoutWinner,
  resolveKnockoutWinner,
  sampleGoals,
  poissonSample
};
