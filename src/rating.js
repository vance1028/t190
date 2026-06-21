const DEFAULT_K = 32;
const MAX_GOAL_WEIGHT = 3;
const HOME_ADVANTAGE = 3;
const UPSET_BOOST = 1.3;
const DRAW_BOOST_WEAK = 1.2;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function goalWeight(goalDiff) {
  const abs = Math.min(Math.abs(goalDiff), MAX_GOAL_WEIGHT);
  if (abs === 0) return 1.0;
  return 1.0 + 0.15 * (abs - 1) + 0.1 * Math.max(0, abs - 2);
}

function upsetMultiplier(expA, actA) {
  const surprise = Math.abs(actA - expA);
  if (surprise > 0.5) {
    return UPSET_BOOST;
  }
  return 1.0;
}

function recencyWeight(index, total) {
  if (total <= 1) return 1.0;
  const t = index / (total - 1);
  return 0.85 + 0.3 * t;
}

function buildInitialRatings(teams) {
  const ratings = {};
  const history = {};
  teams.forEach((t) => {
    ratings[t.id] = t.baseRating;
    history[t.id] = [{ matchId: null, before: t.baseRating, after: t.baseRating, delta: 0 }];
  });
  return { ratings, history };
}

function rateMatches(teams, matches, options = {}) {
  const K = options.K != null ? options.K : DEFAULT_K;
  const { ratings, history } = buildInitialRatings(teams);

  const sorted = [...matches]
    .filter((m) => m.played && Number.isInteger(m.homeScore) && Number.isInteger(m.awayScore))
    .sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
      return 0;
    });

  sorted.forEach((m, idx) => {
    const { home, away, homeScore, awayScore, id: matchId } = m;
    const beforeHome = ratings[home];
    const beforeAway = ratings[away];

    const rHome = beforeHome + HOME_ADVANTAGE;
    const rAway = beforeAway;

    const expHome = expectedScore(rHome, rAway);
    const expAway = 1 - expHome;

    let actHome, actAway;
    if (homeScore > awayScore) { actHome = 1.0; actAway = 0.0; }
    else if (homeScore < awayScore) { actHome = 0.0; actAway = 1.0; }
    else { actHome = 0.5; actAway = 0.5; }

    const diff = homeScore - awayScore;
    const gWeight = goalWeight(diff);
    const upsetHome = upsetMultiplier(expHome, actHome);
    const upsetAway = upsetMultiplier(expAway, actAway);
    let drawBoost = 1.0;
    if (actHome === 0.5) {
      const minExp = Math.min(expHome, expAway);
      drawBoost = 1 + (DRAW_BOOST_WEAK - 1) * (minExp < 0.35 ? 1 : 0);
    }
    const rWeight = recencyWeight(idx, sorted.length);

    const deltaBase = K * gWeight * rWeight * drawBoost;
    const deltaHome = Math.round(deltaBase * upsetHome * (actHome - expHome) * 100) / 100;
    const deltaAway = Math.round(deltaBase * upsetAway * (actAway - expAway) * 100) / 100;

    ratings[home] = Math.round((beforeHome + deltaHome) * 100) / 100;
    ratings[away] = Math.round((beforeAway + deltaAway) * 100) / 100;

    history[home].push({ matchId, before: beforeHome, after: ratings[home], delta: deltaHome, opponent: away, result: actHome, goalsFor: homeScore, goalsAgainst: awayScore });
    history[away].push({ matchId, before: beforeAway, after: ratings[away], delta: deltaAway, opponent: home, result: actAway, goalsFor: awayScore, goalsAgainst: homeScore });
  });

  return { ratings, history, sorted };
}

function expectedScoreFromRatings(rHome, rAway) {
  return expectedScore(rHome + HOME_ADVANTAGE, rAway);
}

module.exports = {
  rateMatches,
  expectedScore,
  expectedScoreFromRatings,
  goalWeight,
  HOME_ADVANTAGE,
  DEFAULT_K
};
