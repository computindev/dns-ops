import { defineRailway, github, postgres, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-east4-eqdc4a" });
  const Redis = redis("Redis", { region: "us-east4-eqdc4a" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const collector = service("collector", {
    replicas: { "us-east4-eqdc4a": 1 },
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/collector/Dockerfile.railway",
    },
    start: "node apps/collector/dist/index.js",
    healthcheck: "/readyz",
    healthcheckTimeout: 60,
    env: {
      API_KEY_SECRET: preserve(),
      DATABASE_URL: preserve(),
      ENABLE_ACTIVE_PROBES: preserve(),
      INTERNAL_SECRET: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      REDIS_URL: preserve(),
      WORKER_ENABLED: preserve(),
    },
  });
  const web = service("web", {
    source: github("computindev/dns-ops", { branch: "master", checkSuites: false }),
    replicas: { "us-east4-eqdc4a": 1 },
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile.railway",
    },
    start: "node apps/web/.output/server/index.mjs",
    preDeploy: "node scripts/run-migrations.mjs",
    healthcheck: "/api/health",
    healthcheckTimeout: 60,
    env: {
      API_KEY_SECRET: preserve(),
      COLLECTOR_URL: preserve(),
      DATABASE_URL: preserve(),
      INTERNAL_SECRET: preserve(),
      NODE_ENV: preserve(),
    },
  });

  return project("dns-ops-staging", {
    resources: [collector, web, Postgres, Redis, redisVolume, postgresVolume],
  });
});
