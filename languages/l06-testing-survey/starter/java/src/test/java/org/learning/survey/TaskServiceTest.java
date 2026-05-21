package org.learning.survey;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class TaskServiceTest {

    @Mock
    private TaskRepository repository;

    @InjectMocks
    private TaskService service;

    @Test
    public void shouldThrowOnCompletedTaskModification() {
        when(repository.isTaskCompleted("123")).thenReturn(true);

        assertThrows(IllegalStateException.class, () -> {
            service.updateTask("123", "New Content");
        });
    }
}
