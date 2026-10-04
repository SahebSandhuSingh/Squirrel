const fs = require('fs');
const code = fs.readFileSync('src/workers/finalize_run/finalize.ts', 'utf8');

const newImport = "import { captureTerritory } from './capture.js';\n";

const searchStr = 'export async function finalizeRun(runId: string): Promise<FinalizeResult> {';
const before = code.substring(0, code.indexOf(searchStr));
let rest = code.substring(code.indexOf(searchStr) + searchStr.length);

rest = rest.replace('await client.query("BEGIN");', 'await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");');

const trySearch = 'try {';
const catchSearch = '} catch (error) {';

const originalTryBody = rest.substring(rest.indexOf(trySearch) + trySearch.length, rest.indexOf(catchSearch));

const territoryInsertStart = 'await client.query(INSERT_TERRITORY, [';
const territoryInsertEnd = ']);';
const insertBlockStartIdx = originalTryBody.indexOf(territoryInsertStart);
const insertBlockEndIdx = originalTryBody.indexOf(territoryInsertEnd, insertBlockStartIdx) + territoryInsertEnd.length;

const captureCode = `
    const captureRes = await captureTerritory({
      client,
      runId,
      ownerId: run.user_id,
      geomWkt4326: pipelineResult.multiPolygonWkt4326,
      areaM2: pipelineResult.areaM2,
      attempts
    });
`;

let newTryBody = originalTryBody.substring(0, insertBlockStartIdx) + captureCode + originalTryBody.substring(insertBlockEndIdx);
newTryBody = newTryBody.replace('const territoryId = crypto.randomUUID();', '');
newTryBody = newTryBody.replace('territoryId,', 'territoryId: captureRes.territoryId, attempts: captureRes.attempts,');

const newRest = `export async function finalizeRun(runId: string): Promise<FinalizeResult> {
  let attempts = 0;
  while (attempts < 5) {
    attempts++;
    const client = await pool.connect();
    try {${newTryBody}} catch (error: any) {
      await client.query("ROLLBACK");
      if (error.code === '40001' || error.code === '40P01') {
        if (attempts >= 5) throw error;
        const backoff = 20 * Math.pow(2, attempts - 1) + Math.random() * 10;
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
  throw new Error('unreachable');
}`;

fs.writeFileSync('src/workers/finalize_run/finalize.ts', newImport + before + newRest);
console.log('finalize.ts rewritten');
