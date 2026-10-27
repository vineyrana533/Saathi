/** Runs the recurring sweeps once (same code as /api/cron/run). */
import { runAllSweeps } from '../src/modules/jobs/service';
import { closeDb } from '../src/platform/db/client';

runAllSweeps()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .finally(() => closeDb());
