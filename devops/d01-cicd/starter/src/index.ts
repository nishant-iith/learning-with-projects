/**
 * @module PipelineUtilities
 * @description
 * Utility classes used as the target application in the CI/CD lab.
 *
 * This module exists to give the GitHub Actions pipeline something meaningful
 * to lint, test, and build — proving that the three-stage CI pipeline (lint
 * → test → build) functions correctly on a real TypeScript codebase.
 *
 * In a real project, this would be your application logic (API handlers,
 * business rules, data transformations). The CI pipeline verifies this
 * code on every commit, preventing regressions from reaching production.
 *
 * DESIGN INTENT (Deep Module Principle):
 * Even a simple utility class should be tested thoroughly in CI because:
 * 1. It proves the test runner (Vitest) executes correctly in the runner VM
 * 2. It proves the linter (ESLint) runs and enforces code style
 * 3. It proves the TypeScript compiler produces valid output in dist/
 *
 * The Calculator class here deliberately has a simple interface (2 methods)
 * hiding potentially complex validation and edge-case handling internally.
 */

/**
 * Calculator — a simple arithmetic utility class.
 *
 * Used as the sample application for the CI/CD pipeline lab.
 * The test suite (index.test.ts) verifies this class's behavior,
 * and the CI pipeline verifies those tests pass on every commit.
 *
 * Production relevance: Real pipelines test much more complex
 * business logic (payment processing, auth validation, data transforms)
 * but the pipeline structure is identical: lint → test → build.
 */
export class Calculator {
  /**
   * Adds two numbers together.
   *
   * @param a - The first operand (addend)
   * @param b - The second operand (addend)
   * @returns The arithmetic sum of a and b
   *
   * Edge cases handled:
   * - Negative numbers: add(-3, 5) = 2 ✓
   * - Floating point: add(0.1, 0.2) = 0.30000000000000004 (IEEE 754 behavior)
   * - Large numbers: add(Number.MAX_SAFE_INTEGER, 1) may lose precision
   * - Zero: add(0, 0) = 0 ✓
   *
   * Pipeline relevance: This method is tested by the 'test' job.
   * If this method is broken (e.g., returns a - b instead of a + b),
   * the test job fails and the build job never runs.
   */
  add(a: number, b: number): number {
    return a + b;
  }

  /**
   * Subtracts the second number from the first.
   *
   * @param a - The minuend (number to subtract from)
   * @param b - The subtrahend (number to subtract)
   * @returns The arithmetic difference a - b
   *
   * Edge cases handled:
   * - Negative result: subtract(3, 5) = -2 ✓
   * - Same values: subtract(5, 5) = 0 ✓
   * - Negative subtrahend: subtract(5, -3) = 8 (same as add) ✓
   */
  subtract(a: number, b: number): number {
    return a - b;
  }

  /**
   * Multiplies two numbers.
   *
   * @param a - The multiplicand
   * @param b - The multiplier
   * @returns The product of a and b
   *
   * Edge cases:
   * - Zero: multiply(0, anything) = 0 ✓
   * - Negative: multiply(-2, 3) = -6 ✓
   * - Both negative: multiply(-2, -3) = 6 ✓ (negative × negative = positive)
   */
  multiply(a: number, b: number): number {
    return a * b;
  }

  /**
   * Divides the first number by the second.
   *
   * @param a - The dividend
   * @param b - The divisor
   * @returns The quotient a / b
   * @throws {Error} When dividing by zero (b === 0)
   *
   * Edge cases:
   * - Division by zero: throws Error (not Infinity — explicit contract)
   * - Integer division: divide(7, 2) = 3.5 (not truncated — JavaScript behavior)
   * - Negative: divide(-10, 2) = -5 ✓
   *
   * This method demonstrates error handling in CI:
   * If the "throws on division by zero" test fails, the entire test job
   * fails and the pipeline stops — protecting production from NaN values
   * propagating through arithmetic operations.
   */
  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error("Division by zero is not allowed");
    }
    return a / b;
  }
}
