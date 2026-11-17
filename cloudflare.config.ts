import { bindings, defineConfig, triggers } from 'cf/config';
export default defineConfig({
  accountId: 'a4a8a6977c12dfe478ec3ce8323a1546',
  worker: {
    name: 'training',
    entrypoint: './services/integration/index.ts',
    compatibilityDate: '2026-11-17',
    assets: { notFoundHandling: 'single-page-application', runWorkerFirst: ['/api/*', '/viewer*'] },
    domains: ['training.jordanvoss.dev'],
    placement: { region: 'aws:eu-west-3' },
    observability: { enabled: true, redactQueryString: true, traces: { enabled: true } },
    env: {
      ASSETS: bindings.assets(),
      SUPABASE_URL: bindings.text<string>('https://mlanifhsliasndkgndhd.supabase.co'),
      SUPABASE_PUBLISHABLE_KEY: bindings.text<string>(
        'sb_publishable_xhs6RM2RtVvoit5A98BSUA_C0zF0M9o',
      ),
      WORKBOOK_ID: bindings.text<string>('1YpjaZM1KaE3GoJTEunVEmsJOPsevHfk3fy0elkcI2eM'),
      APP_ORIGIN: bindings.text<string>('https://training.jordanvoss.dev'),
      GARMIN_OWNER_ID: bindings.text<string>('52e014b8-7ef8-41a3-a1c6-295ad5818733'),
      SHEETS_WRITEBACK_ENABLED: bindings.text<string>('false'),
      SUPABASE_SECRET_KEY: bindings.secret(),
      GOOGLE_SERVICE_ACCOUNT_JSON: bindings.secret(),
      GOOGLE_WRITE_SERVICE_ACCOUNT_JSON: bindings.secret(),
      GARMIN_PERSONAL_API_KEY: bindings.secret(),
    },
    triggers: [triggers.scheduled({ schedule: '*/15 * * * *' })],
  },
});
