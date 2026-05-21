# L-02: Custom Dependency Injection Container (Mini-Spring IoC)

Spring Boot makes building applications feel like magic. Annotating a class with `@Component` and another field with `@Autowired` makes dependencies appear out of thin air. This step-by-step study guide walks you through building your own **Inversion of Control (IoC) & Dependency Injection (DI) Container** from scratch in raw Java using the **Reflection API**.

---

## 🛠️ Step-by-Step Implementation Guide

---

### Step 1: Project Setup (Maven Configuration)
Create a raw Java project structure without Spring dependencies. We only need the JUnit test starters.

Create `pom.xml` in the root of `languages/l02-custom-di/starter/`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>org.dpworld</groupId>
    <artifactId>mini-ioc-container</artifactId>
    <version>1.0.0</version>
    <name>mini-ioc-container</name>
    <description>Custom Dependency Injection Laboratory</description>
    
    <properties>
        <java.version>17</java.version>
    </properties>
    
    <dependencies>
        <!-- JUnit 5 Engine for unit testing our container -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-api</artifactId>
            <version>5.10.2</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter-engine</artifactId>
            <version>5.10.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
</project>
```

---

### Step 2: Defining Custom Annotations
Create the custom annotations that instruct our scanner which classes to manage and which fields to inject.

Create `src/main/java/org/dpworld/ioc/annotation/Component.java`:
```java
package org.dpworld.ioc.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.TYPE) // Applicable only to classes, interfaces, or enums
@Retention(RetentionPolicy.RUNTIME) // Preserved in binary compilation and inspectable at runtime
public @interface Component {
}
```

Create `src/main/java/org/dpworld/ioc/annotation/Autowired.java`:
```java
package org.dpworld.ioc.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.FIELD) // Applicable only to object variables/fields
@Retention(RetentionPolicy.RUNTIME)
public @interface Autowired {
}
```

---

### Step 3: Defining the Context Lookup Interface
The context interface provides a standard retrieval lookup.

Create `src/main/java/org/dpworld/ioc/context/ApplicationContext.java`:
```java
package org.dpworld.ioc.context;

public interface ApplicationContext {
    /**
     * Look up and return the fully-wired singleton instance of a managed bean class.
     */
    <T> T getBean(Class<T> beanClass);
}
```

---

### Step 4: Implementing the Classpath Directory Scanner
The scanner traverses the local compiled directory, transforms package mappings into directory resources, and loads `.class` definitions dynamically.

Create `src/main/java/org/dpworld/ioc/scanner/ClasspathScanner.java`:
```java
package org.dpworld.ioc.scanner;

import java.io.File;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

public class ClasspathScanner {

    public static List<Class<?>> scan(String basePackage) {
        List<Class<?>> classes = new ArrayList<>();
        try {
            // Transform package dot notation: "org.dpworld.app" -> "org/dpworld/app"
            String path = basePackage.replace('.', '/');
            ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
            URL resource = classLoader.getResource(path);
            
            if (resource == null) {
                return classes; // Return empty if package resource path doesn't exist
            }
            
            File directory = new File(resource.getFile());
            if (directory.exists() && directory.isDirectory()) {
                scanDirectory(directory, basePackage, classes);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to scan classpath directory", e);
        }
        return classes;
    }

    private static void scanDirectory(File directory, String packageName, List<Class<?>> classes) throws ClassNotFoundException {
        File[] files = directory.listFiles();
        if (files == null) return;

        for (File file : files) {
            if (file.isDirectory()) {
                // Recursively scan subfolders, updating package name
                scanDirectory(file, packageName + "." + file.getName(), classes);
            } else if (file.getName().endsWith(".class")) {
                // Remove ".class" suffix to isolate name
                String className = packageName + "." + file.getName().substring(0, file.getName().length() - 6);
                classes.add(Class.forName(className)); // Load class dynamically
            }
        }
    }
}
```

---

### Step 5: Implementing Instantiation & Bean Registry
The core context class processes scanned definitions, checks for `@Component`, and calls no-argument constructors via reflection.

Create `src/main/java/org/dpworld/ioc/context/AnnotationConfigContext.java`:
```java
package org.dpworld.ioc.context;

import org.dpworld.ioc.annotation.Component;
import org.dpworld.ioc.annotation.Autowired;
import org.dpworld.ioc.scanner.ClasspathScanner;
import java.lang.reflect.Field;
import java.util.*;

public class AnnotationConfigContext implements ApplicationContext {
    // Bean registry maps the Class type to the instantiated Singleton Object
    private final Map<Class<?>, Object> beanRegistry = new HashMap<>();

    public AnnotationConfigContext(String basePackage) {
        initialize(basePackage);
    }

    private void initialize(String basePackage) {
        try {
            // Step 1: Scan package for compiled class files
            List<Class<?>> scannedClasses = ClasspathScanner.scan(basePackage);

            // Step 2: Instantiation (Create Singleton instances for all Component beans)
            for (Class<?> clazz : scannedClasses) {
                if (clazz.isAnnotationPresent(Component.class)) {
                    // Call default private or public constructor
                    var constructor = clazz.getDeclaredConstructor();
                    constructor.setAccessible(true); // Bypass visibility locks
                    Object instance = constructor.newInstance();
                    beanRegistry.put(clazz, instance);
                }
            }

            // Step 3: Injection (Wire dependencies together)
            for (Object beanInstance : beanRegistry.values()) {
                injectDependencies(beanInstance);
            }
        } catch (Exception e) {
            throw new RuntimeException("DI Context Initialization Failed", e);
        }
    }
```

---

### Step 6: Implementing Dependency Injection (Wiring)
Add the low-level wiring loop inside `AnnotationConfigContext.java`. It checks fields for `@Autowired`, gets active beans from the registry, overrides private visibility locks, and injects them.

Continue editing `src/main/java/org/dpworld/ioc/context/AnnotationConfigContext.java`:
```java
    private void injectDependencies(Object targetInstance) throws IllegalAccessException {
        Class<?> clazz = targetInstance.getClass();
        Field[] fields = clazz.getDeclaredFields();

        for (Field field : fields) {
            if (field.isAnnotationPresent(Autowired.class)) {
                Class<?> dependencyType = field.getType();
                Object dependencyInstance = beanRegistry.get(dependencyType);

                // Crash early if the requested dependency bean is missing from the container
                if (dependencyInstance == null) {
                    throw new NoSuchElementException("Unsatisfied dependency: no bean of type " 
                        + dependencyType.getName() + " registered for " + clazz.getName());
                }

                field.setAccessible(true); // Overrides private variables lock
                field.set(targetInstance, dependencyInstance); // Dynamically set value!
            }
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> T getBean(Class<T> beanClass) {
        T bean = (T) beanRegistry.get(beanClass);
        if (bean == null) {
            throw new NoSuchElementException("No bean managed for type: " + beanClass.getName());
        }
        return bean;
    }
}
```

---

### Step 7: Creating a Mock Application to Verify Integration
Create a mock application structure to verify our container.

Create `src/main/java/org/dpworld/ioc/mock/MockRepository.java`:
```java
package org.dpworld.ioc.mock;

import org.dpworld.ioc.annotation.Component;

@Component
public class MockRepository {
    public String findData() {
        return "Real Database Records";
    }
}
```

Create `src/main/java/org/dpworld/ioc/mock/MockService.java`:
```java
package org.dpworld.ioc.mock;

import org.dpworld.ioc.annotation.Component;
import org.dpworld.ioc.annotation.Autowired;

@Component
public class MockService {
    @Autowired
    private MockRepository mockRepository; // Wired automatically

    public String execute() {
        return "Processed: " + mockRepository.findData();
    }
}
```

Create `src/main/java/org/dpworld/ioc/mock/MockController.java`:
```java
package org.dpworld.ioc.mock;

import org.dpworld.ioc.annotation.Component;
import org.dpworld.ioc.annotation.Autowired;

@Component
public class MockController {
    @Autowired
    private MockService mockService; // Wired automatically

    public String handleRequest() {
        return "Response: " + mockService.execute();
    }
}
```

---

### Step 8: Writing and Executing the Verification Test Suite
Create a comprehensive test suite to verify the container's behavior.

Create `src/test/java/org/dpworld/ioc/ContainerTests.java`:
```java
package org.dpworld.ioc;

import org.dpworld.ioc.context.AnnotationConfigContext;
import org.dpworld.ioc.context.ApplicationContext;
import org.dpworld.ioc.mock.MockController;
import org.dpworld.ioc.mock.MockService;
import org.junit.jupiter.api.Test;
import java.util.NoSuchElementException;

import static org.junit.jupiter.api.Assertions.*;

public class ContainerTests {

    @Test
    void shouldScanAndInstantiateBeans() {
        ApplicationContext context = new AnnotationConfigContext("org.dpworld.ioc.mock");
        
        MockController controller = context.getBean(MockController.class);
        assertNotNull(controller, "Bean should be instantiated and registered");
    }

    @Test
    void shouldRegisterBeansAsSingletons() {
        ApplicationContext context = new AnnotationConfigContext("org.dpworld.ioc.mock");
        
        MockService service1 = context.getBean(MockService.class);
        MockService service2 = context.getBean(MockService.class);
        
        assertSame(service1, service2, "Beans must be registered as singletons");
    }

    @Test
    void shouldInjectDependenciesRecursively() {
        ApplicationContext context = new AnnotationConfigContext("org.dpworld.ioc.mock");
        
        MockController controller = context.getBean(MockController.class);
        
        String result = controller.handleRequest();
        assertEquals("Response: Processed: Real Database Records", result, 
            "Dependencies must be fully wired and functional");
    }

    @Test
    void shouldThrowOnMissingBeanRequest() {
        ApplicationContext context = new AnnotationConfigContext("org.dpworld.ioc.mock");
        
        assertThrows(NoSuchElementException.class, () -> {
            context.getBean(String.class); // Request an unmanaged type
        });
    }
}
```

To run this custom DI test suite:
```bash
mvn test
```
This execution validates that the classpath scanner dynamically loads classes, allocates singleton mappings, overrides private field access, and resolves multi-tier dependency chains successfully under TDD rules!
