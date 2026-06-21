const fs = require('fs');
const path = require('path');

const VALID_TIEBREAKERS = new Set(['points', 'goalDiff', 'goalsFor', 'h2hPoints', 'h2hGoalDiff', 'h2hGoalsFor']);

function loadTournament(filePath) {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`赛程文件不存在: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
}

function validateTournament(t) {
  const errors = [];
  const warnings = [];
  const teamIds = new Set();

  if (!t || typeof t !== 'object') {
    errors.push('根对象无效');
    return { valid: false, errors, warnings };
  }

  if (!t.name || typeof t.name !== 'string') {
    errors.push('缺少赛事名称 (name)');
  }

  // ===== 球队校验 =====
  if (!Array.isArray(t.teams) || t.teams.length === 0) {
    errors.push('teams 必须是非空数组');
  } else {
    const seenIds = new Set();
    t.teams.forEach((team, idx) => {
      if (!team || typeof team !== 'object') {
        errors.push(`teams[${idx}] 不是对象`);
        return;
      }
      if (!team.id || typeof team.id !== 'string') {
        errors.push(`teams[${idx}] 缺少字符串类型的 id`);
      } else if (seenIds.has(team.id)) {
        errors.push(`重复的球队 id: ${team.id}`);
      } else {
        seenIds.add(team.id);
        teamIds.add(team.id);
      }
      if (!team.name || typeof team.name !== 'string') {
        warnings.push(`球队 ${team.id || idx} 缺少 name`);
      }
      if (typeof team.baseRating !== 'number') {
        errors.push(`球队 ${team.id || idx} 的 baseRating 必须是数字`);
      } else if (team.baseRating <= 0) {
        warnings.push(`球队 ${team.id} 的 baseRating 建议为正数 (当前: ${team.baseRating})`);
      }
    });
  }

  // ===== 赛制配置校验 =====
  const fmt = t.format;
  if (!fmt || typeof fmt !== 'object') {
    errors.push('缺少 format 配置');
  } else {
    if (!fmt.tiebreakers || !Array.isArray(fmt.tiebreakers) || fmt.tiebreakers.length === 0) {
      errors.push('format.tiebreakers 必须是非空数组');
    } else {
      fmt.tiebreakers.forEach((tb, i) => {
        if (!VALID_TIEBREAKERS.has(tb)) {
          errors.push(`format.tiebreakers[${i}] 无效: "${tb}", 可选值: ${[...VALID_TIEBREAKERS].join(', ')}`);
        }
      });
      if (fmt.tiebreakers[0] !== 'points') {
        warnings.push('tiebreakers 通常以 "points" 开头');
      }
    }
    if (typeof fmt.pointsForWin !== 'number' || fmt.pointsForWin <= 0) {
      errors.push('format.pointsForWin 必须是正数');
    }
    if (typeof fmt.pointsForDraw !== 'number' || fmt.pointsForDraw < 0) {
      errors.push('format.pointsForDraw 必须是非负数');
    }
    if (!fmt.groups || typeof fmt.groups !== 'object') {
      errors.push('缺少 format.groups 配置');
    } else {
      if (typeof fmt.groups.count !== 'number' || fmt.groups.count <= 0) {
        errors.push('format.groups.count 必须是正整数');
      }
      if (typeof fmt.groups.advancePerGroup !== 'number' || fmt.groups.advancePerGroup <= 0) {
        errors.push('format.groups.advancePerGroup 必须是正整数');
      }
    }
    if (!fmt.knockout || typeof fmt.knockout !== 'object') {
      errors.push('缺少 format.knockout 配置');
    } else {
      if (!Array.isArray(fmt.knockout.rounds) || fmt.knockout.rounds.length === 0) {
        errors.push('format.knockout.rounds 必须是非空数组');
      }
    }
  }

  // ===== 分组校验 =====
  const allGroupTeams = new Set();
  const groupSizes = [];
  if (!t.groups || typeof t.groups !== 'object') {
    errors.push('缺少 groups 配置');
  } else {
    const groupKeys = Object.keys(t.groups);
    if (fmt && fmt.groups && groupKeys.length !== fmt.groups.count) {
      errors.push(`groups 数量 (${groupKeys.length}) 与 format.groups.count (${fmt.groups.count}) 不匹配`);
    }
    groupKeys.forEach((gkey) => {
      const members = t.groups[gkey];
      if (!Array.isArray(members)) {
        errors.push(`groups.${gkey} 必须是数组`);
        return;
      }
      groupSizes.push(members.length);
      members.forEach((tid) => {
        if (!teamIds.has(tid)) {
          errors.push(`groups.${gkey} 中的球队 "${tid}" 未在 teams 中定义`);
        }
        if (allGroupTeams.has(tid)) {
          errors.push(`球队 "${tid}" 出现在多个分组中`);
        }
        allGroupTeams.add(tid);
      });
    });
  }
  if (teamIds.size > 0 && allGroupTeams.size !== teamIds.size) {
    const missing = [...teamIds].filter((id) => !allGroupTeams.has(id));
    errors.push(`以下球队未被分配到任何分组: ${missing.join(', ')}`);
  }
  if (groupSizes.length > 0) {
    const minSize = Math.min(...groupSizes);
    const maxSize = Math.max(...groupSizes);
    if (minSize !== maxSize) {
      warnings.push(`各小组球队数量不一致 (min=${minSize}, max=${maxSize})`);
    }
    if (fmt && fmt.groups && fmt.groups.advancePerGroup >= maxSize) {
      errors.push('advancePerGroup 必须小于小组球队数量');
    }
  }

  // ===== 比赛校验 =====
  const matchIds = new Set();
  const playedPairKeys = new Map(); // key -> [matchIds]
  if (!Array.isArray(t.matches)) {
    errors.push('matches 必须是数组');
  } else {
    t.matches.forEach((m, idx) => {
      if (!m || typeof m !== 'object') {
        errors.push(`matches[${idx}] 不是对象`);
        return;
      }
      // id
      if (!m.id || typeof m.id !== 'string') {
        errors.push(`matches[${idx}] 缺少字符串类型的 id`);
      } else if (matchIds.has(m.id)) {
        errors.push(`重复的比赛 id: ${m.id}`);
      } else {
        matchIds.add(m.id);
      }
      // stage
      if (m.stage !== 'group') {
        // 非小组赛暂时放过，后面校验 knockoutBracket
        return;
      }
      // group
      if (!m.group || !t.groups || !t.groups[m.group]) {
        errors.push(`比赛 ${m.id || idx} 指定了无效的 group: ${m.group}`);
      } else {
        const groupMembers = t.groups[m.group];
        [m.home, m.away].forEach((tid) => {
          if (!teamIds.has(tid)) {
            errors.push(`比赛 ${m.id || idx} 引用了未定义的球队: ${tid}`);
          } else if (!groupMembers.includes(tid)) {
            errors.push(`比赛 ${m.id || idx}: 球队 ${tid} 不在分组 ${m.group} 中`);
          }
        });
      }
      // home vs away
      if (m.home === m.away) {
        errors.push(`比赛 ${m.id || idx}: 主客队不能相同 (${m.home})`);
      }
      // 检查重复对阵 (同组顺序无关)
      if (m.home && m.away && m.home !== m.away) {
        const pairKey = [m.home, m.away].sort().join('__VS__') + `@${m.group || ''}`;
        if (!playedPairKeys.has(pairKey)) playedPairKeys.set(pairKey, []);
        playedPairKeys.get(pairKey).push(m.id || idx);
      }
      // played 字段
      if (typeof m.played !== 'boolean') {
        errors.push(`比赛 ${m.id || idx}: played 必须是布尔值`);
      } else {
        if (m.played) {
          if (!Number.isInteger(m.homeScore) || m.homeScore < 0) {
            errors.push(`比赛 ${m.id || idx}: 已赛必须有非负整数 homeScore`);
          }
          if (!Number.isInteger(m.awayScore) || m.awayScore < 0) {
            errors.push(`比赛 ${m.id || idx}: 已赛必须有非负整数 awayScore`);
          }
        } else {
          if (m.homeScore !== null || m.awayScore !== null) {
            warnings.push(`比赛 ${m.id || idx}: 未赛比赛的比分建议设为 null`);
          }
        }
      }
      if (!m.date) {
        warnings.push(`比赛 ${m.id || idx} 缺少 date 字段`);
      }
    });
  }

  // 检查小组内是否有重复对阵（杯赛单循环每组每对球队只打1次）
  playedPairKeys.forEach((ids, key) => {
    if (ids.length > 1) {
      errors.push(`小组赛重复对阵: ${key} 出现了 ${ids.length} 次 (比赛ID: ${ids.join(', ')})`);
    }
  });

  // ===== 淘汰赛签表校验 =====
  const bracketMatchIds = new Set();
  if (!t.knockoutBracket || typeof t.knockoutBracket !== 'object') {
    errors.push('缺少 knockoutBracket 配置');
  } else {
    const rounds = fmt && fmt.knockout ? fmt.knockout.rounds : [];
    rounds.forEach((r) => {
      const roundMatches = t.knockoutBracket[r];
      if (!Array.isArray(roundMatches)) {
        errors.push(`knockoutBracket.${r} 必须是数组`);
        return;
      }
      roundMatches.forEach((km, idx) => {
        if (!km.id || typeof km.id !== 'string') {
          errors.push(`knockoutBracket.${r}[${idx}] 缺少 id`);
        } else if (bracketMatchIds.has(km.id) || matchIds.has(km.id)) {
          errors.push(`knockoutBracket 中出现重复的 id: ${km.id}`);
        } else {
          bracketMatchIds.add(km.id);
        }
        ['slot1', 'slot2'].forEach((slotName) => {
          const slot = km[slotName];
          if (!slot || typeof slot !== 'object') {
            errors.push(`淘汰赛 ${km.id || idx} 缺少 ${slotName}`);
            return;
          }
          if (slot.group && slot.position) {
            if (!t.groups || !t.groups[slot.group]) {
              errors.push(`${km.id} ${slotName} 引用了不存在的分组: ${slot.group}`);
            }
            if (typeof slot.position !== 'number' || slot.position <= 0) {
              errors.push(`${km.id} ${slotName} position 必须是正整数`);
            } else if (fmt && fmt.groups && slot.position > fmt.groups.advancePerGroup) {
              errors.push(`${km.id} ${slotName} position (${slot.position}) 超过 advancePerGroup (${fmt.groups.advancePerGroup})`);
            }
          } else if (slot.match && typeof slot.winner === 'boolean') {
            // 引用前序比赛: 必须是已定义的淘汰赛 id，且来自更早的轮次
            const rIdx = rounds.indexOf(r);
            let foundEarlier = false;
            for (let i = 0; i < rIdx; i++) {
              const earlier = t.knockoutBracket[rounds[i]] || [];
              if (earlier.some((em) => em.id === slot.match)) { foundEarlier = true; break; }
            }
            if (!foundEarlier) {
              errors.push(`${km.id} ${slotName} 引用的 match=${slot.match} 不在更早的淘汰赛轮次中`);
            }
          } else {
            errors.push(`${km.id} ${slotName} 必须是 {group,position} 或 {match,winner} 格式`);
          }
        });
      });
    });
  }

  // ===== 综合检查 =====
  const valid = errors.length === 0;
  return { valid, errors, warnings, stats: { teamCount: teamIds.size, matchCount: (t.matches || []).length, bracketCount: bracketMatchIds.size } };
}

module.exports = { loadTournament, validateTournament, VALID_TIEBREAKERS };
