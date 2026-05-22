import { describe, it, expect } from "vitest";
import { Calculator } from "./index.js";

// ============================================================
// Test Suite: Calculator — the sample app for the CI/CD lab
//
// These tests are the primary subject of the 'test' job in ci.yml.
// If any test here fails, the CI pipeline stops at the test stage
// and the build stage never runs — preventing broken code from
// being compiled and deployed.
//
// TDD philosophy: Tests describe BEHAVIOR through the public interface,
// not implementation. Each test reads like a specification:
// "When I add 2 and 3, I get 5" — not "When add() runs, a+b is called"
// ============================================================

describe("Calculator — Arithmetic Operations", () => {
  /**
   * Scenario: Basic addition of two positive integers.
   * Verifies the fundamental add() contract in the CI pipeline.
   */
  it("should correctly add two positive numbers", () => {
    const calc = new Calculator();
    expect(calc.add(2, 3)).toBe(5);
  });

  /**
   * Scenario: Addition with a negative number.
   * Ensures the add() method handles mixed signs correctly,
   * not just the happy-path positive + positive case.
   */
  it("should handle adding a negative number (net subtraction)", () => {
    const calc = new Calculator();
    expect(calc.add(10, -3)).toBe(7);
    expect(calc.add(-5, -5)).toBe(-10);
  });

  /**
   * Scenario: Adding zero to a number (identity element check).
   */
  it("should return the same value when adding zero", () => {
    const calc = new Calculator();
    expect(calc.add(42, 0)).toBe(42);
    expect(calc.add(0, 0)).toBe(0);
  });

  /**
   * Scenario: Basic subtraction of two positive integers.
   */
  it("should correctly subtract numbers", () => {
    const calc = new Calculator();
    expect(calc.subtract(10, 4)).toBe(6);
  });

  /**
   * Scenario: Subtraction resulting in a negative value.
   * Ensures subtract() doesn't clamp to zero or throw for negative results.
   */
  it("should return a negative result when subtracting a larger number", () => {
    const calc = new Calculator();
    expect(calc.subtract(3, 10)).toBe(-7);
  });

  /**
   * Scenario: Subtracting a negative (double negative = addition).
   * subtract(5, -3) should equal 8, not 2.
   */
  it("should correctly handle subtracting a negative number (double negative)", () => {
    const calc = new Calculator();
    expect(calc.subtract(5, -3)).toBe(8);
  });

  /**
   * Scenario: Basic multiplication.
   */
  it("should correctly multiply two positive numbers", () => {
    const calc = new Calculator();
    expect(calc.multiply(4, 5)).toBe(20);
  });

  /**
   * Scenario: Multiplying by zero (zero property).
   */
  it("should return zero when multiplying by zero", () => {
    const calc = new Calculator();
    expect(calc.multiply(99, 0)).toBe(0);
    expect(calc.multiply(0, 0)).toBe(0);
  });

  /**
   * Scenario: Multiplying two negative numbers (result should be positive).
   */
  it("should return positive result when multiplying two negative numbers", () => {
    const calc = new Calculator();
    expect(calc.multiply(-3, -4)).toBe(12);
  });

  /**
   * Scenario: Multiplying a positive by a negative (result should be negative).
   */
  it("should return negative result when multiplying positive by negative", () => {
    const calc = new Calculator();
    expect(calc.multiply(6, -2)).toBe(-12);
  });

  /**
   * Scenario: Basic division.
   */
  it("should correctly divide two positive numbers", () => {
    const calc = new Calculator();
    expect(calc.divide(10, 2)).toBe(5);
  });

  /**
   * Scenario: Division resulting in a decimal (non-integer quotient).
   * JavaScript's division always returns a float — no integer truncation.
   */
  it("should return a decimal result for non-integer division", () => {
    const calc = new Calculator();
    expect(calc.divide(7, 2)).toBe(3.5);
  });

  /**
   * Scenario: Division by zero must throw an Error.
   * This is the critical error-case test for the divide() method.
   * In CI, this ensures the error handling code path is verified.
   * If divide(5, 0) returned Infinity (JavaScript default behavior),
   * this test would FAIL and the CI pipeline would block the build.
   *
   * Production relevance: Unhandled division-by-zero can produce NaN/Infinity
   * values that silently propagate through calculations, corrupting financial
   * data, pricing calculations, or statistical outputs before anyone notices.
   */
  it("should throw an Error when dividing by zero", () => {
    const calc = new Calculator();
    expect(() => calc.divide(5, 0)).toThrowError("Division by zero is not allowed");
  });

  /**
   * Scenario: Division of negative number by positive.
   */
  it("should correctly divide negative by positive number", () => {
    const calc = new Calculator();
    expect(calc.divide(-10, 2)).toBe(-5);
  });

  /**
   * Scenario: Division of 1 by a number (reciprocal check).
   */
  it("should compute the reciprocal when dividing 1 by a number", () => {
    const calc = new Calculator();
    expect(calc.divide(1, 4)).toBe(0.25);
  });
});
