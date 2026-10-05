-- INSERT_CHALLENGE
INSERT INTO challenges (id, type, title, metric, comparator, threshold, starts_at, ends_at, xp_reward, state, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *;

----
-- INSERT_PARTICIPANT
INSERT INTO challenge_participants (challenge_id, user_id, status)
VALUES ($1, $2, $3) RETURNING *;

----
-- UPDATE_PARTICIPANT_STATUS
UPDATE challenge_participants SET status = $2 WHERE challenge_id = $1 AND user_id = $3 RETURNING *;

----
-- UPDATE_CHALLENGE_STATE
UPDATE challenges SET state = $2 WHERE id = $1 RETURNING *;

----
-- GET_CHALLENGE
SELECT * FROM challenges WHERE id = $1;

----
-- GET_PARTICIPANTS
SELECT * FROM challenge_participants WHERE challenge_id = $1;

----
-- CHECK_PARTICIPANT
SELECT 1 FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2;

----
-- LIST_MY_CHALLENGES
SELECT c.*,
       COALESCE(SUM(
         CASE
           WHEN a.id IS NULL OR a.type <> 'run' THEN 0::double precision
           WHEN c.metric = 'distance_m'
             AND jsonb_typeof(a.metrics -> 'distance_m') = 'number'
             THEN (a.metrics ->> 'distance_m')::double precision
           WHEN c.metric = 'duration_s'
             AND jsonb_typeof(a.metrics -> 'elapsed_time_s') = 'number'
             THEN (a.metrics ->> 'elapsed_time_s')::double precision
           WHEN c.metric = 'runs_completed' THEN 1::double precision
           WHEN c.metric = 'territory_area_m2'
             AND a.metrics -> 'territory_claimed' = 'true'::jsonb
             AND jsonb_typeof(a.metrics -> 'area_m2') = 'number'
             THEN (a.metrics ->> 'area_m2')::double precision
           WHEN c.metric = 'territories_captured'
             AND a.metrics -> 'territory_claimed' = 'true'::jsonb
             THEN 1::double precision
           ELSE 0::double precision
         END
       ), 0)::double precision AS "myProgress"
FROM challenges c
JOIN challenge_participants cp ON cp.challenge_id = c.id
LEFT JOIN activity_sessions a
  ON a.user_id = cp.user_id
 AND a.started_at >= c.starts_at
 AND a.started_at <= c.ends_at
WHERE cp.user_id = $1
GROUP BY c.id
ORDER BY c.ends_at DESC;

----
-- RESOLVER_GET_RESOLVABLE
SELECT * FROM challenges 
WHERE state = 'active' AND ends_at <= now()
LIMIT $1;

----
-- RESOLVER_GET_ACTIVITY
SELECT type, metrics FROM activity_sessions 
WHERE user_id = $1 AND started_at >= $2 AND started_at <= $3;

----
-- RESOLVER_UPDATE_PARTICIPANT
UPDATE challenge_participants 
SET final_progress = $2, is_winner = $3, xp_awarded = $4
WHERE challenge_id = $1 AND user_id = $5;

----
-- RESOLVER_UPDATE_CHALLENGE
UPDATE challenges SET state = 'resolved', resolved_at = now() WHERE id = $1 RETURNING *;
