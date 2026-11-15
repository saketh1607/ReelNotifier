import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const render = YAML.parse(await readFile(new URL('../render.yaml', import.meta.url), 'utf8'));
const services = Object.fromEntries(render.services.filter((service) => service.type !== 'keyvalue').map((service) => [service.type, service]));

describe('Render deployment configuration', () => {
  it('shares admin credentials and uses the same database and Redis resources for web and worker', () => {
    expect(render.envVarGroups.find((group) => group.name === 'reelnotifier-shared').envVars.filter((item) => item.key === 'API_ADMIN_KEY' && item.generateValue)).toHaveLength(1);
    for (const type of ['web', 'worker']) {
      const vars = services[type].envVars;
      expect(vars).toContainEqual({ fromGroup: 'reelnotifier-shared' });
      expect(vars.find((item) => item.key === 'DATABASE_URL')?.fromDatabase?.name).toBe('reelnotifier-db');
      expect(vars.find((item) => item.key === 'REDIS_URL')?.fromService?.name).toBe('reelnotifier-redis');
    }
  });

  it('configures account IDs, scopes webhook secrets to web, and runs migrations before startup', () => {
    const shared = render.envVarGroups.find((group) => group.name === 'reelnotifier-shared').envVars;
    expect(shared.find((item) => item.key === 'META_PAGE_ID')?.value).toBe('1471732602688156');
    expect(shared.find((item) => item.key === 'INSTAGRAM_ACCOUNT_ID')?.value).toBe('17841423026295491');
    expect(services.web.envVars.some((item) => item.key === 'META_VERIFY_TOKEN')).toBe(true);
    expect(services.worker.envVars.some((item) => item.key === 'META_VERIFY_TOKEN')).toBe(false);
    expect(services.worker.envVars.some((item) => item.key === 'META_PAGE_ACCESS_TOKEN')).toBe(true);
    expect(services.web.preDeployCommand).toBe('npm run db:migrate');
    expect(services.web.startCommand).toBe('npm start');
  });
});
