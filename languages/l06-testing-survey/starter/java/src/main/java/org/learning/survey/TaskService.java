package org.learning.survey;

interface TaskRepository {
    boolean isTaskCompleted(String taskId);
}

public class TaskService {
    private final TaskRepository repository;

    public TaskService(TaskRepository repository) {
        this.repository = repository;
    }

    public void updateTask(String taskId, String newContent) {
        // TODO: Query repository. If isTaskCompleted(taskId) is true, throw IllegalStateException.
    }
}
