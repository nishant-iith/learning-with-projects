# F-05: SOLID Principles & Code Quality

Writing code that "just works" is only the first step of software engineering. Professional codebase lifecycles span years, during which many developers will read, maintain, and refactor your code. In this handbook, you will master the principles of **clean architecture**, **SOLID design**, and code quality standards that differentiate an amateur coder from an elite software engineer.

---

## 1. The SOLID Principles of Object-Oriented Design

Coined by Robert C. Martin ("Uncle Bob"), the **SOLID** principles are five design guidelines that make software designs understandable, flexible, and maintainable.

---

### S - Single Responsibility Principle (SRP)
> *"A class should have one, and only one, reason to change."*

A class must focus on a single, isolated job. If a class has multiple responsibilities, they become coupled, and changes to one responsibility can break the other.

#### ❌ Bad Practice (Violating SRP)
This class handles user storage AND formats user data for emails:
```java
public class User {
    private String name;
    private String email;

    // Responsibility 1: User Database operations
    public void saveToDatabase() {
        // SQL execution code...
    }

    // Responsibility 2: Notification formatting
    public String formatWelcomeEmail() {
        return "Hello " + name + ", welcome to DP World!";
    }
}
```

#### ✅ Good Practice (Adhering to SRP)
Separate database storage from presentation/notification logic:
```java
public class User {
    private String name;
    private String email;
    // Getters and setters...
}

public class UserRepository {
    public void save(User user) {
        // SQL execution code...
    }
}

public class EmailFormatter {
    public String formatWelcomeEmail(User user) {
        return "Hello " + user.getName() + ", welcome!";
    }
}
```

---

### O - Open/Closed Principle (OCP)
> *"Software entities (classes, modules, functions) should be open for extension, but closed for modification."*

You should be able to extend a class's behavior without editing its existing source code. This prevents introducing bugs into stable, tested code.

#### ❌ Bad Practice (Violating OCP)
Every time we add a new payment method, we must modify the core checkout method:
```java
public class PaymentProcessor {
    public void processPayment(String type) {
        if (type.equals("CreditCard")) {
            // Card logic...
        } else if (type.equals("PayPal")) {
            // PayPal logic...
        }
        // Violation: Adding ApplePay forces us to modify this class!
    }
}
```

#### ✅ Good Practice (Adhering to OCP)
Use interfaces to delegate dynamic payment logic. Adding ApplePay simply requires implementing the interface, leaving the processor untouched:
```java
public interface PaymentMethod {
    void pay(double amount);
}

public class CreditCardPayment implements PaymentMethod {
    public void pay(double amount) { /* Card logic */ }
}

public class PayPalPayment implements PaymentMethod {
    public void pay(double amount) { /* PayPal logic */ }
}

public class PaymentProcessor {
    public void process(PaymentMethod method, double amount) {
        method.pay(amount); // Closed for modification, open for extension!
    }
}
```

---

### L - Liskov Substitution Principle (LSP)
> *"Subclasses must be substitutable for their superclasses without altering the correctness of the program."*

If class `B` is a subclass of class `A`, we should be able to replace `A` with `B` anywhere in our code without causing crashes or unexpected behaviors.

#### ❌ Bad Practice (Violating LSP)
A common classic violation is a Square inheriting from a Rectangle:
```java
public class Rectangle {
    protected int width;
    protected int height;
    public void setWidth(int w) { this.width = w; }
    public void setHeight(int h) { this.height = h; }
    public int getArea() { return width * height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int w) {
        this.width = w;
        this.height = w; // Violation: Changing width alters height!
    }
    @Override
    public void setHeight(int h) {
        this.width = h;
        this.height = h;
    }
}
```
*   **The crash**: A unit test designed for Rectangle sets width to 5 and height to 10 and expects an area of 50. If you substitute a Square, the area results in 100, breaking the test!

#### ✅ Good Practice (Adhering to LSP)
Design around capabilities rather than forced physical inheritance:
```java
public interface Shape {
    int getArea();
}

public class Rectangle implements Shape {
    private int width;
    private int height;
    public int getArea() { return width * height; }
}

public class Square implements Shape {
    private int side;
    public int getArea() { return side * side; }
}
```

---

### I - Interface Segregation Principle (ISP)
> *"Clients should not be forced to depend on interfaces they do not use."*

It is better to have many small, highly focused interfaces rather than one large, "fat" general-purpose interface.

#### ❌ Bad Practice (Violating ISP)
A fat interface forces classes to write empty mock implementations for methods they don't support:
```java
public interface Worker {
    void work();
    void eat();
}

public class Robot implements Worker {
    public void work() { /* assembling cars */ }
    public void eat() { 
        // Violation: Robots do not eat! Empty method written just to satisfy compile.
    }
}
```

#### ✅ Good Practice (Adhering to ISP)
Segregate interfaces by precise domain behaviors:
```java
public interface Workable {
    void work();
}

public interface Feedable {
    void eat();
}

public class Human implements Workable, Feedable {
    public void work() { /* coding */ }
    public void eat() { /* eating lunch */ }
}

public class Robot implements Workable {
    public void work() { /* assembling */ }
}
```

---

### D - Dependency Inversion Principle (DIP)
> *"High-level modules should not depend on low-level modules. Both should depend on abstractions."*

Code should depend on abstract interfaces, not concrete implementations. This keeps components highly decoupled and testable.

#### ❌ Bad Practice (Violating DIP)
The high-level `Car` class is tightly coupled to the concrete `V8Engine` class:
```java
public class V8Engine {
    public void start() { /* start engine */ }
}

public class Car {
    private V8Engine engine; // Direct tight coupling!

    public Car() {
        this.engine = new V8Engine(); // Direct instantiation
    }
}
```
*   **The Problem**: If we want to replace the `V8Engine` with an `ElectricEngine`, or if we want to run unit tests and mock the engine, we must modify the `Car` class source code.

#### ✅ Good Practice (Adhering to DIP)
Inject an abstraction (`Engine` interface) into the `Car` constructor:
```java
public interface Engine {
    void start();
}

public class V8Engine implements Engine {
    public void start() { /* start V8 */ }
}

public class ElectricEngine implements Engine {
    public void start() { /* start Electric */ }
}

public class Car {
    private final Engine engine; // Depends on abstraction!

    // Constructor Injection
    public Car(Engine engine) {
        this.engine = engine;
    }
}
```

---

## 2. Core Clean Code Foundations
Beyond SOLID, keep these clean principles at the front of your mind during every coding cycle:

### KISS (Keep It Simple, Stupid)
Avoid over-engineering. Do not write complex, nested conditions or use abstract patterns when simple, highly readable code accomplishes the exact same goal.
*   *Amateur code is complex because the developer wants to look smart.*
*   *Elite code is so simple it looks obvious.*

### DRY (Don't Repeat Yourself)
Every piece of knowledge or business logic must have a single, unambiguous representation within a system.
*   If you copy-paste code in three different places, extract it into a dedicated helper module. If that business logic changes in the future, you will only have to update it in one place!

### YAGNI (You Aren't Gonna Need It)
Never write code or features because you *think* you might need them in the future. 
*   Only write code that satisfies immediate, active requirements. Extra code increases the system's surface area for bugs and wastes precious maintenance time.

---

## 3. The Professional Code Review Checklist

When review-checking PRs (Pull Requests) written by your peers, use this structured checklist:

1.  **Correctness**: Does the code accurately satisfy the acceptance criteria of the story? Are there edge cases that will cause crashes (e.g. `null` pointers, division by zero, database connection dropouts)?
2.  **Design & Architecture**:
    *   Does it follow established design patterns and keep classes decoupled?
    *   Are the changes aligned with the **SOLID** principles?
3.  **Performance**:
    *   Are there queries executing inside loops (the $N+1$ query problem)?
    *   Are database queries utilizing indexes?
    *   Are objects being created excessively in memory, causing Garbage Collection load?
4.  **Testability**:
    *   Are there unit and integration tests covering positive, negative, and edge case scenarios?
    *   Are the tests testing behaviors through public interfaces, or are they fragilely testing private mock details?
5.  **Readability & Styling**:
    *   Are variable and function names self-descriptive and clear?
    *   Is the code properly formatted?
    *   Are there left-over debug lines (`console.log`, `System.out.println`) or commented-out blocks of code? (Delete them!)
