const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('./db');
const { requireAdminKey } = require('./middleware/admin-key');
const { deleteStagedLogo, deleteTeamLogo, getLogoExtension, logoUrl, saveTeamLogo, uploadRoot } = require('./storage/team-logos');

const router = express.Router();
const write = requireAdminKey;
const stagingDirectory = path.join(uploadRoot, '.staging');
const logoUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdir(stagingDirectory, { recursive: true }).then(
        () => callback(null, stagingDirectory), callback,
      );
    },
    filename(_req, _file, callback) {
      callback(null, `${crypto.randomUUID()}.upload`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter(_req, file, callback) {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) return callback(null, true);
    callback(new Error('Team logos must be PNG, JPEG, or WebP images.'));
  },
});

function parseLogoUpload(req, res, next) {
  logoUpload.single('logo')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? 'Team logos must be 5 MB or smaller.' : 'Upload one logo using the "logo" file field.',
      });
    }
    return res.status(400).json({ error: error.message || 'Invalid logo upload.' });
  });
}

function integerId(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function validText(value, max = 120) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function validDate(value) {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get('/tournaments', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM tournaments ORDER BY starts_at NULLS LAST, id DESC');
  res.json(rows);
}));

router.get('/tournaments/:id', asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid tournament id.' });
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Tournament not found.' });
  res.json(rows[0]);
}));

router.post('/tournaments', write, asyncRoute(async (req, res) => {
  const { name, description = '', status = 'upcoming', startsAt = null, registrationDeadline = null, maxTeams = null } = req.body;
  const statuses = ['upcoming', 'registration_open', 'in_progress', 'completed', 'cancelled'];
  if (!validText(name) || typeof description !== 'string' || !statuses.includes(status) ||
      (maxTeams !== null && (!Number.isInteger(maxTeams) || maxTeams < 1)) ||
      !validDate(startsAt) || !validDate(registrationDeadline)) {
    return res.status(400).json({ error: 'Provide a name, description, valid status, and a positive maxTeams value.' });
  }
  const { rows } = await pool.query(
    `INSERT INTO tournaments (name, description, status, starts_at, registration_deadline, max_teams)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name.trim(), description, status, startsAt, registrationDeadline, maxTeams],
  );
  res.status(201).json(rows[0]);
}));

router.patch('/tournaments/:id', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid tournament id.' });
  const fields = {
    name: 'name', description: 'description', status: 'status', startsAt: 'starts_at',
    registrationDeadline: 'registration_deadline', maxTeams: 'max_teams',
  };
  const updates = Object.entries(fields).filter(([key]) => Object.hasOwn(req.body, key));
  if (!updates.length) return res.status(400).json({ error: 'Provide at least one tournament field to update.' });
  const data = Object.fromEntries(updates.map(([key]) => [key, req.body[key]]));
  const statuses = ['upcoming', 'registration_open', 'in_progress', 'completed', 'cancelled'];
  if ((data.name !== undefined && !validText(data.name)) ||
      (data.description !== undefined && typeof data.description !== 'string') ||
      (data.status !== undefined && !statuses.includes(data.status)) ||
      (data.maxTeams !== undefined && data.maxTeams !== null && (!Number.isInteger(data.maxTeams) || data.maxTeams < 1)) ||
      (data.startsAt !== undefined && !validDate(data.startsAt)) ||
      (data.registrationDeadline !== undefined && !validDate(data.registrationDeadline))) {
    return res.status(400).json({ error: 'One or more tournament fields are invalid.' });
  }
  const values = updates.map(([key]) => key === 'name' ? data[key].trim() : data[key]);
  const setters = updates.map(([, column], index) => `${column} = $${index + 1}`);
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE tournaments SET ${setters.join(', ')} WHERE id = $${values.length} RETURNING *`, values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Tournament not found.' });
  res.json(rows[0]);
}));

const teamSelect = `SELECT t.id, t.name, t.captain_discord_name AS "captainDiscordName",
       (t.captain_agreement_accepted_at IS NOT NULL) AS "captainAgreementAccepted",
       ('/uploads/' || t.logo_path) AS "logoUrl", t.created_at AS "createdAt",
       count(p.id)::int AS "memberCount", 5 AS "maxMembers",
       (count(p.id) < 5) AS recruiting,
       COALESCE(json_agg(json_build_object('id', p.id, 'displayName', p.display_name,
         'mmr', p.mmr, 'position', tm.position, 'isCaptain', tm.is_captain)
         ORDER BY tm.is_captain DESC, p.id)
         FILTER (WHERE p.id IS NOT NULL), '[]') AS members
     FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id
     LEFT JOIN players p ON p.id = tm.player_id`;

router.get('/teams', asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`${teamSelect} GROUP BY t.id ORDER BY t.id DESC`);
  res.json(rows);
}));

router.get('/teams/:id', asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid team id.' });
  const { rows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Team not found.' });
  res.json(rows[0]);
}));

// Discord bot integration routes. The bot authenticates with the API key and
// supplies the Discord user ID for captain ownership checks.
function validDiscordActor(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 64;
}

async function requireTeamCaptain(client, teamId, actorDiscordId) {
  if (!validDiscordActor(actorDiscordId)) return { error: 'A Discord user ID is required.' };
  const { rows } = await client.query(
    'SELECT id FROM teams WHERE id = $1 AND captain_discord_id = $2 FOR UPDATE', [teamId, actorDiscordId.trim()],
  );
  return rows[0] ? { team: rows[0] } : { error: 'Only this team’s captain can make that change.', status: 403 };
}

router.get('/discord/tournaments/open', write, asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.description, t.starts_at AS "startsAt",
       t.registration_deadline AS "registrationDeadline", t.max_teams AS "maxTeams",
       (SELECT count(*)::int FROM tournament_registrations r
        WHERE r.tournament_id = t.id AND r.status IN ('pending', 'approved')) AS "registeredTeams"
     FROM tournaments t WHERE t.status = 'registration_open'
       AND (t.registration_deadline IS NULL OR t.registration_deadline > now())
     ORDER BY t.starts_at NULLS LAST, t.id DESC`,
  );
  res.json(rows.map((tournament) => ({
    ...tournament,
    spotsRemaining: tournament.maxTeams === null ? null : Math.max(0, tournament.maxTeams - tournament.registeredTeams),
  })));
}));

router.get('/discord/teams/mine', write, asyncRoute(async (req, res) => {
  if (!validDiscordActor(req.query.discordId)) return res.status(400).json({ error: 'Provide your Discord user ID.' });
  const { rows } = await pool.query(
    `${teamSelect} WHERE t.captain_discord_id = $1 GROUP BY t.id ORDER BY t.created_at DESC`,
    [req.query.discordId.trim()],
  );
  res.json(rows);
}));

router.post('/discord/teams', write, asyncRoute(async (req, res) => {
  const { name, captainDiscordId, captainDiscordName, captainDisplayName, captainMmr,
    captainAgreementAccepted, members = [] } = req.body;
  if (!validText(name) || !validDiscordActor(captainDiscordId) || !validText(captainDiscordName) ||
      !validText(captainDisplayName) || !Number.isInteger(captainMmr) || captainMmr < 0 ||
      captainAgreementAccepted !== true || !Array.isArray(members) || members.length > 4) {
    return res.status(400).json({ error: 'Provide a team name, captain details, accepted agreement, and up to four teammates.' });
  }
  if (members.some((member) => member == null || typeof member !== 'object' ||
      !validText(member.displayName) || !Number.isInteger(member.mmr) || member.mmr < 0 ||
      (member.discordId != null && !validDiscordActor(member.discordId)))) {
    return res.status(400).json({ error: 'Each teammate needs a Dota name and non-negative integer MMR.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: teamRows } = await client.query(
      `INSERT INTO teams (name, captain_discord_name, captain_discord_id,
         captain_agreement_accepted_at, captain_agreement_version)
       VALUES ($1, $2, $3, now(), $4) RETURNING id`,
      [name.trim(), captainDiscordName.trim(), captainDiscordId.trim(), 'pronoobs-captain-agreement-v1'],
    );
    const teamId = teamRows[0].id;
    const roster = [{ displayName: captainDisplayName, mmr: captainMmr, discordId: captainDiscordId, isCaptain: true }, ...members];
    for (const member of roster) {
      const { rows: playerRows } = await client.query(
        `INSERT INTO players (display_name, discord_id, mmr) VALUES ($1, $2, $3)
         RETURNING id`, [member.displayName.trim(), member.discordId || null, member.mmr],
      );
      await client.query(
        'INSERT INTO team_members (team_id, player_id, is_captain) VALUES ($1, $2, $3)',
        [teamId, playerRows[0].id, member.isCaptain === true],
      );
    }
    await client.query('COMMIT');
    const { rows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [teamId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/discord/teams/:id', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid team id.' });
  const fields = { name: 'name', captainDiscordName: 'captain_discord_name' };
  const updates = Object.entries(fields).filter(([key]) => Object.hasOwn(req.body, key));
  if (!updates.length || updates.some(([key]) => !validText(req.body[key]))) {
    return res.status(400).json({ error: 'Provide a valid team name or captain Discord name.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await requireTeamCaptain(client, req.params.id, req.body.actorDiscordId);
    if (!access.team) { await client.query('ROLLBACK'); return res.status(access.status || 400).json({ error: access.error }); }
    const values = updates.map(([key]) => req.body[key].trim());
    const setters = updates.map(([, column], index) => `${column} = $${index + 1}`);
    values.push(req.params.id);
    await client.query(`UPDATE teams SET ${setters.join(', ')} WHERE id = $${values.length}`, values);
    await client.query('COMMIT');
    const { rows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [req.params.id]);
    res.json(rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.post('/discord/teams/:id/members', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid team id.' });
  const { displayName, mmr, discordId = null, actorDiscordId } = req.body;
  if (!validText(displayName) || !Number.isInteger(mmr) || mmr < 0 ||
      (discordId !== null && !validDiscordActor(discordId))) {
    return res.status(400).json({ error: 'Provide a Dota name, non-negative integer MMR, and optional Discord user ID.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await requireTeamCaptain(client, req.params.id, actorDiscordId);
    if (!access.team) { await client.query('ROLLBACK'); return res.status(access.status || 400).json({ error: access.error }); }
    const { rows: countRows } = await client.query('SELECT count(*)::int AS count FROM team_members WHERE team_id = $1', [req.params.id]);
    if (countRows[0].count >= 5) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Your roster already has five players.' }); }
    const { rows: playerRows } = await client.query(
      'INSERT INTO players (display_name, discord_id, mmr) VALUES ($1, $2, $3) RETURNING id',
      [displayName.trim(), discordId, mmr],
    );
    await client.query('INSERT INTO team_members (team_id, player_id) VALUES ($1, $2)', [req.params.id, playerRows[0].id]);
    await client.query('COMMIT');
    const { rows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [req.params.id]);
    res.status(201).json(rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.patch('/discord/teams/:id/members/:playerId', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id) || !integerId(req.params.playerId)) return res.status(400).json({ error: 'Invalid team or player id.' });
  const fields = { displayName: 'display_name', mmr: 'mmr', discordId: 'discord_id' };
  const updates = Object.entries(fields).filter(([key]) => Object.hasOwn(req.body, key));
  if (!updates.length || (Object.hasOwn(req.body, 'displayName') && !validText(req.body.displayName)) ||
      (Object.hasOwn(req.body, 'mmr') && (!Number.isInteger(req.body.mmr) || req.body.mmr < 0)) ||
      (Object.hasOwn(req.body, 'discordId') && req.body.discordId !== null && !validDiscordActor(req.body.discordId))) {
    return res.status(400).json({ error: 'Provide valid player details to update.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await requireTeamCaptain(client, req.params.id, req.body.actorDiscordId);
    if (!access.team) { await client.query('ROLLBACK'); return res.status(access.status || 400).json({ error: access.error }); }
    const { rows: memberRows } = await client.query(
      'SELECT 1 FROM team_members WHERE team_id = $1 AND player_id = $2', [req.params.id, req.params.playerId],
    );
    if (!memberRows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Player is not on this team.' }); }
    const values = updates.map(([key]) => key === 'displayName' ? req.body[key]?.trim() : req.body[key]);
    const setters = updates.map(([, column], index) => `${column} = $${index + 1}`);
    values.push(req.params.playerId);
    await client.query(`UPDATE players SET ${setters.join(', ')} WHERE id = $${values.length}`, values);
    await client.query('COMMIT');
    const { rows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [req.params.id]);
    res.json(rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.delete('/discord/teams/:id/members/:playerId', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id) || !integerId(req.params.playerId)) return res.status(400).json({ error: 'Invalid team or player id.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await requireTeamCaptain(client, req.params.id, req.body.actorDiscordId);
    if (!access.team) { await client.query('ROLLBACK'); return res.status(access.status || 400).json({ error: access.error }); }
    const { rows } = await client.query(
      `DELETE FROM team_members WHERE team_id = $1 AND player_id = $2 AND is_captain = false
       RETURNING player_id`, [req.params.id, req.params.playerId],
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Teammate not found, or the captain cannot be removed.' }); }
    await client.query('DELETE FROM players WHERE id = $1', [req.params.playerId]);
    await client.query('COMMIT');
    const { rows: teamRows } = await pool.query(`${teamSelect} WHERE t.id = $1 GROUP BY t.id`, [req.params.id]);
    res.json(teamRows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.post('/discord/teams/:id/registrations', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id) || !integerId(String(req.body.tournamentId ?? ''))) {
    return res.status(400).json({ error: 'Provide valid team and tournament ids.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const access = await requireTeamCaptain(client, req.params.id, req.body.actorDiscordId);
    if (!access.team) { await client.query('ROLLBACK'); return res.status(access.status || 400).json({ error: access.error }); }
    const { rows: tournamentRows } = await client.query(
      'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [req.body.tournamentId],
    );
    const tournament = tournamentRows[0];
    if (!tournament) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Tournament not found.' }); }
    if (tournament.status !== 'registration_open' ||
        (tournament.registration_deadline && new Date(tournament.registration_deadline) <= new Date())) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Tournament registration is closed.' });
    }
    const { rows: existing } = await client.query(
      'SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND team_id = $2',
      [req.body.tournamentId, req.params.id],
    );
    if (existing[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This team is already registered.' }); }
    if (tournament.max_teams !== null) {
      const { rows: countRows } = await client.query(
        `SELECT count(*)::int AS count FROM tournament_registrations
         WHERE tournament_id = $1 AND status IN ('pending', 'approved')`, [req.body.tournamentId],
      );
      if (countRows[0].count >= tournament.max_teams) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Tournament has reached its team limit.' });
      }
    }
    const { rows } = await client.query(
      'INSERT INTO tournament_registrations (tournament_id, team_id) VALUES ($1, $2) RETURNING *',
      [req.body.tournamentId, req.params.id],
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.put('/teams/:id/logo', write, (req, res, next) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid team id.' });
  next();
}, parseLogoUpload, asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a logo in the "logo" file field.' });
  let extension;
  try {
    extension = await getLogoExtension(req.file);
  } catch (error) {
    await deleteStagedLogo(req.file.path);
    throw error;
  }
  if (!extension) {
    await deleteStagedLogo(req.file.path);
    return res.status(400).json({ error: 'The uploaded file is not a valid PNG, JPEG, or WebP image.' });
  }

  const { rows: existingRows } = await pool.query('SELECT logo_path FROM teams WHERE id = $1', [req.params.id]);
  if (!existingRows[0]) {
    await deleteStagedLogo(req.file.path);
    return res.status(404).json({ error: 'Team not found.' });
  }

  let storedPath;
  try {
    storedPath = await saveTeamLogo(req.params.id, req.file, extension);
  } catch (error) {
    await deleteStagedLogo(req.file.path);
    throw error;
  }
  try {
    const { rows } = await pool.query(
      'UPDATE teams SET logo_path = $1 WHERE id = $2 RETURNING id', [storedPath, req.params.id],
    );
    if (!rows[0]) {
      await deleteTeamLogo(storedPath);
      return res.status(404).json({ error: 'Team not found.' });
    }
  } catch (error) {
    await deleteTeamLogo(storedPath);
    throw error;
  }
  void deleteTeamLogo(existingRows[0].logo_path).catch((error) => console.error('Could not remove replaced team logo:', error));
  res.json({ id: req.params.id, logoUrl: logoUrl(storedPath) });
}));

router.patch('/players/:id', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid player id.' });
  const allowed = ['displayName', 'mmr', 'discordId', 'steamId'];
  const updates = allowed.filter((key) => Object.hasOwn(req.body, key));
  if (!updates.length) return res.status(400).json({ error: 'Provide at least one player field to update.' });
  if ((Object.hasOwn(req.body, 'displayName') && !validText(req.body.displayName)) ||
      (Object.hasOwn(req.body, 'mmr') && (!Number.isInteger(req.body.mmr) || req.body.mmr < 0)) ||
      ['discordId', 'steamId'].some((key) => Object.hasOwn(req.body, key) && req.body[key] !== null && typeof req.body[key] !== 'string')) {
    return res.status(400).json({ error: 'One or more player fields are invalid.' });
  }
  const columns = { displayName: 'display_name', mmr: 'mmr', discordId: 'discord_id', steamId: 'steam_id' };
  const values = updates.map((key) => key === 'displayName' ? req.body[key].trim() : req.body[key]);
  const setters = updates.map((key, index) => `${columns[key]} = $${index + 1}`);
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE players SET ${setters.join(', ')} WHERE id = $${values.length}
     RETURNING id, display_name, discord_id, steam_id, mmr`, values,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Player not found.' });
  res.json(rows[0]);
}));

router.post('/teams', write, asyncRoute(async (req, res) => {
  const { name, captainDiscordName, captainAgreementAccepted, members } = req.body;
  if (!validText(name) || !validText(captainDiscordName) || captainAgreementAccepted !== true ||
      !Array.isArray(members) || members.length !== 5) {
    return res.status(400).json({ error: 'Provide a team name, captain Discord name, accepted captain agreement, and exactly five members.' });
  }
  const invalidMember = members.some((member, index) => member == null || typeof member !== 'object' ||
    !validText(member.displayName) ||
    !Number.isInteger(member.mmr) || member.mmr < 0 ||
    (member.isCaptain === true && index !== 0) ||
    (member.discordId != null && typeof member.discordId !== 'string') ||
    (member.steamId != null && typeof member.steamId !== 'string') ||
    (member.position != null && typeof member.position !== 'string') ||
    (member.isCaptain != null && typeof member.isCaptain !== 'boolean'));
  if (invalidMember) return res.status(400).json({ error: 'Each of the five members needs a displayName and non-negative integer mmr.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const teamResult = await client.query(
      `INSERT INTO teams (name, captain_discord_name, captain_agreement_accepted_at, captain_agreement_version)
       VALUES ($1, $2, now(), $3) RETURNING *`,
      [name.trim(), captainDiscordName.trim(), 'pronoobs-captain-agreement-v1'],
    );
    const team = teamResult.rows[0];
    const resultMembers = [];
    for (const [index, member] of members.entries()) {
      const playerResult = await client.query(
        `INSERT INTO players (display_name, discord_id, steam_id, mmr)
         VALUES ($1, $2, $3, $4) RETURNING id, display_name, discord_id, steam_id, mmr`,
        [member.displayName.trim(), member.discordId || null, member.steamId || null, member.mmr],
      );
      const player = playerResult.rows[0];
      const position = member.position == null ? null : String(member.position).slice(0, 40);
      const isCaptain = index === 0;
      await client.query(
        'INSERT INTO team_members (team_id, player_id, position, is_captain) VALUES ($1, $2, $3, $4)',
        [team.id, player.id, position, isCaptain],
      );
      resultMembers.push({
        id: player.id,
        displayName: player.display_name,
        mmr: player.mmr,
        position,
        isCaptain,
      });
    }
    await client.query('COMMIT');
    res.status(201).json({
      id: team.id,
      name: team.name,
      captainDiscordName: team.captain_discord_name,
      captainAgreementAccepted: true,
      logoUrl: null,
      createdAt: team.created_at,
      members: resultMembers,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/tournaments/:id/registrations', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id) || !integerId(String(req.body.teamId ?? ''))) {
    return res.status(400).json({ error: 'Provide valid tournament and team ids.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: tournamentRows } = await client.query(
      'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE', [req.params.id],
    );
    const tournament = tournamentRows[0];
    if (!tournament) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tournament not found.' });
    }
    if (tournament.status !== 'registration_open' ||
        (tournament.registration_deadline && new Date(tournament.registration_deadline) <= new Date())) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Tournament registration is closed.' });
    }
    const { rows: teamRows } = await client.query('SELECT id FROM teams WHERE id = $1', [req.body.teamId]);
    if (!teamRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Team not found.' });
    }
    const { rows: existing } = await client.query(
      'SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND team_id = $2',
      [req.params.id, req.body.teamId],
    );
    if (existing[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This team is already registered.' });
    }
    if (tournament.max_teams !== null) {
      const { rows: countRows } = await client.query(
        `SELECT count(*)::int AS count FROM tournament_registrations
         WHERE tournament_id = $1 AND status IN ('pending', 'approved')`, [req.params.id],
      );
      if (countRows[0].count >= tournament.max_teams) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Tournament has reached its team limit.' });
      }
    }
    const { rows } = await client.query(
      'INSERT INTO tournament_registrations (tournament_id, team_id) VALUES ($1, $2) RETURNING *',
      [req.params.id, req.body.teamId],
    );
    await client.query('COMMIT');
    return res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/tournaments/:id/registrations', asyncRoute(async (req, res) => {
  if (!integerId(req.params.id)) return res.status(400).json({ error: 'Invalid tournament id.' });
  const { rows } = await pool.query(
    `SELECT r.*, t.name AS team_name FROM tournament_registrations r
     JOIN teams t ON t.id = r.team_id WHERE r.tournament_id = $1 ORDER BY r.registered_at`,
    [req.params.id],
  );
  res.json(rows);
}));

router.patch('/registrations/:id', write, asyncRoute(async (req, res) => {
  if (!integerId(req.params.id) || !['pending', 'approved', 'rejected', 'withdrawn'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Provide a valid registration id and status.' });
  }
  const { rows } = await pool.query(
    'UPDATE tournament_registrations SET status = $1 WHERE id = $2 RETURNING *',
    [req.body.status, req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Registration not found.' });
  res.json(rows[0]);
}));

module.exports = router;
