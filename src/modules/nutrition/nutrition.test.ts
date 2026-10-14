import {
  averagePerception,
  averageWaterMl,
  dailyMealCounts,
  dailyWaterMl,
  dayKcalTotal,
  daysWithMeals,
} from './metrics';
import { mealInputSchema } from './schemas';
import type { MealRecord } from './types';

const meal = (day: string, over: Partial<MealRecord> = {}): MealRecord => ({
  id: `m-${day}-${Math.random()}`,
  eatenAt: `${day}T15:00:00.000Z`,
  day,
  time: '12:00',
  category: 'lunch',
  description: null,
  hunger: null,
  fullness: null,
  satisfaction: null,
  kcalEstimate: null,
  note: null,
  ...over,
});

const RANGE = { from: '2026-10-01', to: '2026-10-03' };

describe('métricas de alimentação (§25, LEG-M07)', () => {
  it('descrevem registro, água e percepções', () => {
    const meals = [
      meal('2026-10-01', { hunger: 4 }),
      meal('2026-10-01', { hunger: 2 }),
      meal('2026-10-03'),
    ];
    expect(daysWithMeals(meals, RANGE)).toBe(2);
    expect(dailyMealCounts(meals, RANGE).map((d) => d.meals)).toEqual([2, null, 1]);
    expect(averagePerception(meals, 'hunger')).toBe(3);
    expect(averagePerception(meals, 'fullness')).toBeNull();
    const water = [
      { id: 'w1', day: '2026-10-01', ml: 300 },
      { id: 'w2', day: '2026-10-01', ml: 500 },
      { id: 'w3', day: '2026-10-02', ml: 400 },
    ];
    expect(dailyWaterMl(water, RANGE).map((d) => d.ml)).toEqual([800, 400, null]);
    expect(averageWaterMl(water)).toBe(600);
  });

  it('total calórico do dia só com estimativas presentes', () => {
    expect(dayKcalTotal([meal('2026-10-01')], '2026-10-01')).toBeNull();
    expect(
      dayKcalTotal(
        [meal('2026-10-01', { kcalEstimate: 500 }), meal('2026-10-01', { kcalEstimate: 300 })],
        '2026-10-01',
      ),
    ).toBe(800);
  });

  it('registro mínimo: categoria e horário bastam', () => {
    expect(mealInputSchema.parse({ eatenAt: '2026-10-01T12:00', category: 'lunch' })).toEqual({
      eatenAt: '2026-10-01T12:00',
      category: 'lunch',
    });
    expect(
      mealInputSchema.safeParse({ eatenAt: '2026-10-01T12:00', category: 'bad' }).success,
    ).toBe(false);
  });
});
