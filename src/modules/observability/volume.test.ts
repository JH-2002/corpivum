// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MemoryErrorReporter } from '@/adapters/error-reporter/memory';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import type { Db } from '@/lib/db/client';
import { createLogger, type LogRecord } from '@/lib/logger';
import {
  createVolumeMonitor,
  evaluateVolume,
  registerObservabilityJobs,
  scheduleObservabilityJobs,
  VOLUME_CHECK_JOB,
  VOLUME_LIMITS,
} from './index';

const silent = createLogger({ sink: () => {} });

function fakeDb(rows: unknown[]): () => Db {
  const db = { $queryRaw: async () => rows } as unknown as Db;
  return () => db;
}

describe('evaluateVolume', () => {
  const base = { tuplesRead: 0, windowMinutes: 60, baselinePerHour: null, operatorActionsMax: 0 };

  it('sem histórico vale o piso; com histórico, a mediana vezes o multiplicador; escala com o período', () => {
    expect(evaluateVolume(base).read.threshold).toBe(VOLUME_LIMITS.readFloorPerHour);
    expect(evaluateVolume({ ...base, baselinePerHour: 1_000 }).read.threshold).toBe(
      VOLUME_LIMITS.readFloorPerHour,
    );
    expect(evaluateVolume({ ...base, baselinePerHour: 300_000 }).read.threshold).toBe(
      300_000 * VOLUME_LIMITS.readBaselineMultiplier,
    );
    expect(evaluateVolume({ ...base, windowMinutes: 120 }).read.threshold).toBe(
      2 * VOLUME_LIMITS.readFloorPerHour,
    );
  });

  it('leitura muito acima do normal é anômala; uso normal não', () => {
    const usual = { ...base, baselinePerHour: 50_000 };
    expect(evaluateVolume({ ...usual, tuplesRead: 90_000 }).read.anomalous).toBe(false);
    expect(evaluateVolume({ ...usual, tuplesRead: 2_000_000 }).read.anomalous).toBe(true);
  });

  it('operador acima de 20 ações por hora é anômalo', () => {
    expect(evaluateVolume({ ...base, operatorActionsMax: 20 }).operator.anomalous).toBe(false);
    expect(evaluateVolume({ ...base, operatorActionsMax: 21 }).operator.anomalous).toBe(true);
  });
});

describe('createVolumeMonitor', () => {
  it('primeira amostra: nada a comparar, nenhum alerta', async () => {
    const reporter = new MemoryErrorReporter();
    const monitor = createVolumeMonitor({
      workerDb: fakeDb([]),
      reporter: () => reporter,
      logger: silent,
    });
    expect(await monitor.check()).toBeNull();
    expect(reporter.alerts).toEqual([]);
  });

  it('alerta só com contagem e teto; log só com números', async () => {
    const reporter = new MemoryErrorReporter();
    const records: LogRecord[] = [];
    const monitor = createVolumeMonitor({
      workerDb: fakeDb([
        {
          tuples_read: 5_000_000n,
          window_minutes: 60,
          baseline_per_hour: 28_000n,
          operator_actions_max: 40,
        },
      ]),
      reporter: () => reporter,
      logger: createLogger({ minLevel: 'debug', sink: (r) => records.push(r) }),
      now: () => new Date('2026-10-16T12:00:00.000Z'),
    });
    await monitor.check();
    expect(reporter.alerts).toEqual([
      {
        name: 'security.read_volume_anomaly',
        count: 5_000_000,
        threshold: 140_000,
        occurredAt: '2026-10-16T12:00:00.000Z',
      },
      {
        name: 'security.operator_volume_anomaly',
        count: 40,
        threshold: 20,
        occurredAt: '2026-10-16T12:00:00.000Z',
      },
    ]);
    expect(records).toEqual([
      expect.objectContaining({
        event: 'observability.volume_checked',
        count: 5_000_000,
        threshold: 140_000,
      }),
    ]);
  });
});

describe('observability.volume_check', () => {
  it('roda e se reagenda mesmo quando a amostra falha', async () => {
    const queue = new MemoryJobQueue(silent);
    let calls = 0;
    registerObservabilityJobs(queue, {
      check: async () => {
        calls += 1;
        throw new Error('banco fora');
      },
    });
    await scheduleObservabilityJobs(queue, new Date(0));
    const enqueue = vi.spyOn(queue, 'enqueue');
    await queue.drain(new Date(1000));
    expect(calls).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(
      VOLUME_CHECK_JOB,
      {},
      {
        runAt: expect.any(Date),
        singletonKey: VOLUME_CHECK_JOB,
      },
    );
  });
});
