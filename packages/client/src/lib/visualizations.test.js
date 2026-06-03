import { describe, it, expect } from 'vitest';
import { buildVisualizationQuery } from './visualizations';

describe('buildVisualizationQuery', () => {
  it('빈 필터는 빈 문자열', () => {
    expect(buildVisualizationQuery({})).toBe('');
  });

  it('값이 있는 필드만 포함', () => {
    const qs = buildVisualizationQuery({ q: '원', subject: '수학', majorUnit: '' });
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('원');
    expect(params.get('subject')).toBe('수학');
    expect(params.has('majorUnit')).toBe(false);
  });

  it('null/undefined/false 는 제외, mine=1 은 포함', () => {
    const qs = buildVisualizationQuery({ minorUnit: null, page: undefined, mine: false });
    expect(qs).toBe('');
    const qs2 = buildVisualizationQuery({ mine: 1, page: 2 });
    const params = new URLSearchParams(qs2);
    expect(params.get('mine')).toBe('1');
    expect(params.get('page')).toBe('2');
  });
});
