// Utility to extract historical rows from DataGolf JSON or similar payloads
function extractHistoricalRowsFromSnapshotPayload(payload) {
  if (!payload) return [];
  // Single-event payload shape: { event_id, ..., scores: [ { dg_id, ..., round_1: {...}, ... } ] }
  if (payload && typeof payload === 'object' && Array.isArray(payload.scores)) {
    const meta = {
      event_name: payload.event_name || payload.eventName || null,
      event_id: payload.event_id || payload.eventId || null,
      tour: payload.tour || null,
      event_completed: payload.event_completed || payload.eventCompleted || null,
      year: payload.year || null,
      season: payload.season || payload.year || null
    };

    const rows = [];
    payload.scores.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      const dgId = entry.dg_id ?? entry.dgId ?? entry.player_id ?? entry.playerId ?? entry.id;
      if (!dgId) return;
      const playerName = entry.player_name || entry.playerName || entry.name || null;
      const finText = entry.fin_text || entry.finish || entry.finishPosition || entry.fin || null;

      Object.keys(entry).forEach(key => {
        if (!key.startsWith('round_')) return;
        const roundData = entry[key];
        if (!roundData || typeof roundData !== 'object') return;
        const roundNum = parseInt(key.replace('round_', ''), 10);
        rows.push({
          ...meta,
          dg_id: dgId,
          player_name: playerName,
          fin_text: finText,
          round_num: Number.isNaN(roundNum) ? null : roundNum,
          ...roundData
        });
      });
    });

    return rows;
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.rounds)) return payload.rounds;
  if (typeof payload === 'object') {
    const nested = Object.values(payload).flatMap(value => Array.isArray(value) ? value : []);
    if (nested.length > 0) return nested;

    const expanded = [];
    Object.entries(payload).forEach(([eventKey, eventEntry]) => {
      if (!eventEntry || typeof eventEntry !== 'object') return;
      const scores = Array.isArray(eventEntry.scores) ? eventEntry.scores : [];
      if (scores.length === 0) return;
      const eventId = eventEntry.event_id || eventEntry.eventId || eventKey;
      const eventCompleted = eventEntry.event_completed || eventEntry.eventCompleted || null;
      const year = eventCompleted ? String(eventCompleted).slice(0, 4) : null;

      scores.forEach(playerEntry => {
        if (!playerEntry) return;
        const base = {
          event_id: eventId,
          event_name: eventEntry.event_name || eventEntry.eventName || null,
          event_completed: eventCompleted,
          year: year || null,
          season: year || null,
          dg_id: playerEntry.dg_id || playerEntry.dgId || playerEntry.player_id || playerEntry.playerId,
          player_name: playerEntry.player_name || playerEntry.playerName || null,
          fin_text: playerEntry.fin_text || playerEntry.finish || playerEntry.finishPosition || null
        };

        [1, 2, 3, 4].forEach(roundNum => {
          const roundKey = `round_${roundNum}`;
          const roundData = playerEntry[roundKey];
          if (!roundData || typeof roundData !== 'object') return;
          expanded.push({
            ...base,
            round_num: roundNum,
            ...roundData
          });
        });
      });
    });

    if (expanded.length > 0) return expanded;
  }
  return [];
}

module.exports = { extractHistoricalRowsFromSnapshotPayload };
