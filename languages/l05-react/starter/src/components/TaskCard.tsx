import React from 'react';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High';
  completed: boolean;
}

interface TaskCardProps {
  task: Task;
  onDelete: (id: string) => void;
  onToggleComplete: (id: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onDelete, onToggleComplete }) => {
  return (
    <div className={`task-card p-4 rounded border my-2 ${task.completed ? 'opacity-50 line-through' : ''}`}>
      {/* TODO: Step 1. Render task title and description. */}
      {/* TODO: Step 2. Render priority tag (with conditional colors for Low, Medium, High). */}
      {/* TODO: Step 3. Implement interactive controls:
                    - Checkbox or button to trigger onToggleComplete(task.id).
                    - Delete button to trigger onDelete(task.id).
      */}
      <h3>{task.title}</h3>
      <p>{task.description}</p>
      <span>{task.priority}</span>
      <button onClick={() => onDelete(task.id)}>Delete</button>
    </div>
  );
};

export default TaskCard;
