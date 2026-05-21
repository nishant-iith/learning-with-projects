# L-01: Java Spring Boot Essentials (Bookstore REST API)

Spring Boot is the premier corporate framework for building production-grade, highly-scalable, and secure enterprise microservices in Java. This step-by-step study guide walks you through bootstrap setups, database integrations, layered logic design, and test validation.

---

## 🛠️ Step-by-Step Implementation Guide

---

### Step 1: Project Bootstrapping & Dependencies
To start, configure your Maven build file (`pom.xml`) with the core starters for Web, Data JPA, PostgreSQL, and Validation.

Create `pom.xml` in the root of `languages/l01-spring-boot/starter/`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>
    
    <groupId>org.learning</groupId>
    <artifactId>bookstore-api</artifactId>
    <version>1.0.0</version>
    <name>bookstore-api</name>
    <description>Enterprise Bookstore REST API Laboratory</description>
    
    <properties>
        <java.version>17</java.version>
    </properties>
    
    <dependencies>
        <!-- Core Web starter for REST APIs -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        
        <!-- JPA starter using Hibernate ORM -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        
        <!-- Validation starter for JSR-380 input checks -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        
        <!-- PostgreSQL driver -->
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        
        <!-- Testing starter (JUnit 5, Mockito, AssertJ, MockMvc) -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

---

### Step 2: Database Setup & Local Connection
To run PostgreSQL locally and for free, create a `docker-compose.yml` file in your project starter root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: dpw-bookstore-db
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: bookstore_user
      POSTGRES_PASSWORD: bookstore_password
      POSTGRES_DB: bookstore_db
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Now, configure Spring Boot to connect to this database by creating `src/main/resources/application.properties`:

```properties
# Spring Boot DB Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/bookstore_db
spring.datasource.username=bookstore_user
spring.datasource.password=bookstore_password
spring.datasource.driver-class-name=org.postgresql.Driver

# JPA/Hibernate Configurations
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
```
*   `spring.jpa.hibernate.ddl-auto=update`: Automatically updates database schemas to match entity code changes.
*   `spring.jpa.show-sql=true`: Prints SQL commands in the console for analysis.

---

### Step 3: Designing the Domain Entity
Create the `Book` data model. The entity must have annotations mapping it to a database table and validating inputs.

Create `src/main/java/org/learning/bookstore/model/Book.java`:
```java
package org.learning.bookstore.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;

@Entity
@Table(name = "books")
public class Book {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotBlank(message = "Title is required")
    @Size(max = 255, message = "Title cannot exceed 255 characters")
    @Column(nullable = false)
    private String title;

    @NotBlank(message = "ISBN is required")
    @Pattern(regexp = "^(97(8|9))?\\d{9}(\\d|X)$", message = "Invalid ISBN-13 format")
    @Column(unique = true, nullable = false)
    private String isbn;

    @NotNull(message = "Price is required")
    @Min(value = 0, message = "Price cannot be negative")
    @Column(nullable = false)
    private Double price;

    // Standard constructor requirements
    public Book() {}

    public Book(String title, String isbn, Double price) {
        this.title = title;
        this.isbn = isbn;
        this.price = price;
    }

    // Getters and Setters...
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getIsbn() { return isbn; }
    public void setIsbn(String isbn) { this.isbn = isbn; }
    public Double getPrice() { return price; }
    public void setPrice(Double price) { this.price = price; }
}
```

---

### Step 4: Writing the JPA Repository
Create an interface extending `JpaRepository` to manage database operations.

Create `src/main/java/org/learning/bookstore/repository/BookRepository.java`:
```java
package org.learning.bookstore.repository;

import org.learning.bookstore.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface BookRepository extends JpaRepository<Book, Long> {
    // Derived query: checks database for duplicates using ISBN
    Optional<Book> findByIsbn(String isbn);
}
```

---

### Step 5: Implementing Custom Exceptions
When validation or check exceptions occur, we throw specialized class models to represent conflict errors.

Create `src/main/java/org/learning/bookstore/exception/DuplicateIsbnException.java`:
```java
package org.learning.bookstore.exception;

public class DuplicateIsbnException extends RuntimeException {
    public DuplicateIsbnException(String message) {
        super(message);
    }
}
```

Create `src/main/java/org/learning/bookstore/exception/ResourceNotFoundException.java`:
```java
package org.learning.bookstore.exception;

public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
```

---

### Step 6: Coding the Service Layer
The service coordinates data transactions and isolates core business logic validations.

Create `src/main/java/org/learning/bookstore/service/BookService.java`:
```java
package org.learning.bookstore.service;

import org.learning.bookstore.model.Book;
import org.learning.bookstore.repository.BookRepository;
import org.learning.bookstore.exception.DuplicateIsbnException;
import org.learning.bookstore.exception.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class BookService {
    private final BookRepository bookRepository;

    // Constructor Injection
    public BookService(BookRepository bookRepository) {
        this.bookRepository = bookRepository;
    }

    @Transactional(readOnly = true)
    public List<Book> getAllBooks() {
        return bookRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Book getBookById(Long id) {
        return bookRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Book not found with ID: " + id));
    }

    @Transactional
    public Book createBook(Book book) {
        if (bookRepository.findByIsbn(book.getIsbn()).isPresent()) {
            throw new DuplicateIsbnException("ISBN " + book.getIsbn() + " already exists.");
        }
        return bookRepository.save(book);
    }
}
```

---

### Step 7: Configuring REST Controller Routing
Set up the HTTP communication routes. We validate payloads using `@Valid`.

Create `src/main/java/org/learning/bookstore/controller/BookController.java`:
```java
package org.learning.bookstore.controller;

import jakarta.validation.Valid;
import org.learning.bookstore.model.Book;
import org.learning.bookstore.service.BookService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/books")
public class BookController {
    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @GetMapping
    public ResponseEntity<List<Book>> getAllBooks() {
        return ResponseEntity.ok(bookService.getAllBooks());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Book> getBookById(@PathVariable Long id) {
        return ResponseEntity.ok(bookService.getBookById(id));
    }

    @PostMapping
    public ResponseEntity<Book> createBook(@Valid @RequestBody Book book) {
        Book created = bookService.createBook(book);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

---

### Step 8: Creating Global Interceptors for Custom Errors
Map our business validation and checking exceptions cleanly into JSON output payloads.

Create `src/main/java/org/learning/bookstore/exception/GlobalExceptionHandler.java`:
```java
package org.learning.bookstore.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(DuplicateIsbnException.class)
    public ResponseEntity<Object> handleDuplicateIsbn(DuplicateIsbnException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", HttpStatus.CONFLICT.value());
        body.put("error", "Conflict");
        body.put("message", ex.getMessage());
        return new ResponseEntity<>(body, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Object> handleNotFound(ResourceNotFoundException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", HttpStatus.NOT_FOUND.value());
        body.put("error", "Not Found");
        body.put("message", ex.getMessage());
        return new ResponseEntity<>(body, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Object> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, Object> body = new HashMap<>();
        body.put("timestamp", LocalDateTime.now());
        body.put("status", HttpStatus.BAD_REQUEST.value());
        body.put("error", "Validation Failed");

        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach((error) -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        body.put("validationErrors", errors);

        return new ResponseEntity<>(body, HttpStatus.BAD_REQUEST);
    }
}
```

---

### Step 9: Writing and Executing the Integration Test Suite
To verify the application end-to-end, write an integration test suite.

Create `src/test/java/org/learning/bookstore/BookstoreApplicationTests.java`:
```java
package org.learning.bookstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.learning.bookstore.model.Book;
import org.learning.bookstore.repository.BookRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
public class BookstoreApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BookRepository bookRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        bookRepository.deleteAll(); // Clear state before each test run
    }

    @Test
    void shouldCreateBookSuccessfully() throws Exception {
        Book book = new Book("Effective Java", "978-0134685991", 45.00);

        mockMvc.perform(post("/api/books")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(book)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.title").value("Effective Java"));
    }

    @Test
    void shouldReturnConflictOnDuplicateIsbn() throws Exception {
        Book book1 = new Book("Clean Code", "978-0132350884", 40.00);
        bookRepository.save(book1); // Persist baseline

        Book book2 = new Book("Clean Code (Copy)", "978-0132350884", 42.00);

        mockMvc.perform(post("/api/books")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(book2)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Conflict"))
                .andExpect(jsonPath("$.message").value("ISBN 978-0132350884 already exists."));
    }
}
```

To run this test suite using Maven CLI:
```bash
mvn test
```
This compilation, bootstrapping, and test suite execution verifies that your bookstore application functions as specified!
