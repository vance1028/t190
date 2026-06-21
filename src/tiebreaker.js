function buildGroupStandings(groupTeams, matches, format) {
  const { pointsForWin, pointsForDraw, tiebreakers } = format;
  const row = {};
  groupTeams.forEach((tid) => {
    row[tid] = {
      team: tid,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0,
      points: 0,
      h2h: {}
    };
    groupTeams.forEach((opp) => {
      if (opp !== tid) {
        row[tid].h2h[opp] = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
      }
    });
  });
  const groupSet = new Set(groupTeams);
  matches.forEach((m) => {
    if (!m.played) return;
    if (!groupSet.has(m.home) || !groupSet.has(m.away)) return;
    const hs = m.homeScore, as = m.awayScore;
    const r1 = row[m.home], r2 = row[m.away];
    r1.played++; r2.played++;
    r1.goalsFor += hs; r1.goalsAgainst += as;
    r2.goalsFor += as; r2.goalsAgainst += hs;
    r1.goalDiff = r1.goalsFor - r1.goalsAgainst;
    r2.goalDiff = r2.goalsFor - r2.goalsAgainst;
    if (hs > as) {
      r1.won++; r1.lost = r1.lost; r1.points += pointsForWin;
      r2.lost++; r2.points += 0;
    } else if (hs < as) {
      r2.won++; r2.points += pointsForWin;
      r1.lost++;
    } else {
      r1.drawn++; r1.points += pointsForDraw;
      r2.drawn++; r2.points += pointsForDraw;
    }
    const h1 = r1.h2h[m.away], h2 = r2.h2h[m.home];
    h1.played++; h2.played++;
    h1.goalsFor += hs; h1.goalsAgainst += as;
    h2.goalsFor += as; h2.goalsAgainst += hs;
    h1.goalDiff = h1.goalsFor - h1.goalsAgainst;
    h2.goalDiff = h2.goalsFor - h2.goalsAgainst;
    if (hs > as) { h1.won++; h1.points += pointsForWin; h2.lost++; }
    else if (hs < as) { h2.won++; h2.points += pointsForWin; h1.lost++; }
    else { h1.drawn++; h1.points += pointsForDraw; h2.drawn++; h2.points += pointsForDraw; }
  });
  const rows = groupTeams.map((t) => row[t]);
  return sortStandings(rows, tiebreakers);
}

function sortStandings(rows, tiebreakers) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const tb of tiebreakers) {
      let va = 0, vb = 0;
      switch (tb) {
        case 'points': va = a.points; vb = b.points; break;
        case 'goalDiff': va = a.goalDiff; vb = b.goalDiff; break;
        case 'goalsFor': va = a.goalsFor; vb = b.goalsFor; break;
        case 'h2hPoints': va = a.h2h[b.team] ? a.h2h[b.team].points : 0; vb = b.h2h[a.team] ? b.h2h[a.team].points : 0; break;
        case 'h2hGoalDiff': va = a.h2h[b.team] ? a.h2h[b.team].goalDiff : 0; vb = b.h2h[a.team] ? b.h2h[a.team].goalDiff : 0; break;
        case 'h2hGoalsFor': va = a.h2h[b.team] ? a.h2h[b.team].goalsFor : 0; vb = b.h2h[a.team] ? b.h2h[a.team].goalsFor : 0; break;
      }
      if (va !== vb) return vb - va;
    }
    return a.team.localeCompare(b.team);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

module.exports = { buildGroupStandings, sortStandings };
