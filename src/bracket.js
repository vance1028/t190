const { buildGroupStandings } = require('./tiebreaker');
const { resolveKnockoutWinner, sampleGoals } = require('./probability');

function createRNG(seed) {
  let s = Math.abs(Math.floor(seed || 123456789)) % 2147483647;
  if (s === 0) s = 1;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function computeGroupRankings(tournament, allMatches) {
  const result = {};
  Object.keys(tournament.groups).forEach((gkey) => {
    result[gkey] = buildGroupStandings(tournament.groups[gkey], allMatches, tournament.format);
  });
  return result;
}

function resolveSlot(slot, groupRankings, knockoutResults) {
  if (slot.group && slot.position) {
    const grp = groupRankings[slot.group];
    if (!grp) return null;
    const idx = slot.position - 1;
    if (idx < 0 || idx >= grp.length) return null;
    return grp[idx].team;
  }
  if (slot.match && typeof slot.winner === 'boolean') {
    const r = knockoutResults[slot.match];
    if (!r) return null;
    return slot.winner ? r.winner : r.loser;
  }
  return null;
}

function instantiateKnockoutMatches(tournament, groupRankings, knockoutResults) {
  const rounds = tournament.format.knockout.rounds;
  const matchesById = {};
  const bracket = tournament.knockoutBracket;
  rounds.forEach((roundName) => {
    const roundMatches = bracket[roundName] || [];
    roundMatches.forEach((km) => {
      const home = resolveSlot(km.slot1, groupRankings, knockoutResults);
      const away = resolveSlot(km.slot2, groupRankings, knockoutResults);
      matchesById[km.id] = {
        id: km.id,
        round: roundName,
        date: km.date || null,
        stage: 'knockout',
        home,
        away,
        homeScore: null,
        awayScore: null,
        played: false,
        determined: home != null && away != null
      };
    });
  });
  return matchesById;
}

function simulateFullTournament(tournament, ratings, randFn) {
  const cloneMatches = tournament.matches.map((m) => ({ ...m }));
  cloneMatches.forEach((m) => {
    if (!m.played && m.stage === 'group') {
      const { homeScore, awayScore } = sampleGoals(ratings[m.home], ratings[m.away], randFn);
      m.homeScore = homeScore;
      m.awayScore = awayScore;
      m.played = true;
    }
  });

  const groupRankings = computeGroupRankings(tournament, cloneMatches);
  const knockoutResults = {};
  let bracketMatches = instantiateKnockoutMatches(tournament, groupRankings, knockoutResults);
  const advanceTeams = new Set();
  const finalists = new Set();
  let champion = null;
  let runnerUp = null;

  const advanceCount = tournament.format.groups.advancePerGroup;
  Object.keys(tournament.groups).forEach((g) => {
    for (let i = 0; i < advanceCount; i++) {
      advanceTeams.add(groupRankings[g][i].team);
    }
  });

  const rounds = tournament.format.knockout.rounds;
  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const roundName = rounds[rIdx];
    bracketMatches = instantiateKnockoutMatches(tournament, groupRankings, knockoutResults);
    const roundMatches = (tournament.knockoutBracket[roundName] || []).map((km) => bracketMatches[km.id]);
    roundMatches.forEach((km) => {
      if (!km.determined) return;
      const outcome = resolveKnockoutWinner(ratings[km.home], ratings[km.away], randFn);
      const winner = outcome.winner === 'home' ? km.home : km.away;
      const loser = outcome.winner === 'home' ? km.away : km.home;
      knockoutResults[km.id] = {
        winner, loser, via: outcome.via,
        home: km.home, away: km.away
      };
      if (roundName === rounds[rounds.length - 1]) {
        finalists.add(km.home);
        finalists.add(km.away);
        champion = winner;
        runnerUp = loser;
      }
      cloneMatches.push({
        id: km.id,
        stage: 'knockout',
        round: roundName,
        home: km.home,
        away: km.away,
        homeScore: winner === km.home ? 1 : 0,
        awayScore: winner === km.away ? 1 : 0,
        played: true,
        via: outcome.via,
        winner,
        loser
      });
    });
  }

  return {
    matches: cloneMatches,
    groupRankings,
    knockoutResults,
    advance: [...advanceTeams],
    final: [...finalists],
    champion,
    runnerUp
  };
}

module.exports = {
  createRNG,
  computeGroupRankings,
  instantiateKnockoutMatches,
  simulateFullTournament,
  resolveSlot
};
