import { describe, it, expect } from 'vitest';
import { Calculator } from './calculator.js';

describe('Calculator TDD Lab', () => {
  it('should return 0 for an empty string', () => {
    const calc = new Calculator();
    expect(calc.add("")).toBe(0);
  });

  it('should return the sum of two comma-separated numbers', () => {
    const calc = new Calculator();
    expect(calc.add("1,2")).toBe(3);
  });
});
