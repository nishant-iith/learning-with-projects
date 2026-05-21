import React, { useState, useEffect } from 'react';
import TaskForm from './TaskForm.tsx';
import TaskCard, { Task } from './TaskCard.tsx';

export const Dashboard: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'All' | 'Active' | 'Completed'>('All');

  // TODO: Step 1. Implement useEffect to load tasks from localStorage on initial render.
  // TODO: Step 2. Implement useEffect to synchronize tasks state with localStorage when tasks array changes.

  const handleAddTask = (title: string, description: string, priority: 'Low' | 'Medium' | 'High') => {
    // TODO: Create a new Task object (generating an id via crypto.randomUUID() or a timestamp).
    // TODO: Prepend/append the task to the active tasks list state.
    const newTask: Task = {
      id: String(Date.now()),
      title,
      description,
      priority,
      completed: false,
    };
    setTasks((prev) => [...prev, newTask]);
  };

  const handleDeleteTask = (id: string) => {
    // TODO: Filter tasks keeping those with IDs not matching deleted target.
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggleComplete = (id: string) => {
    // TODO: Map tasks toggling 'completed' value for the target matching ID.
  };

  return (
    <div className="dashboard-container max-w-2xl mx-auto p-6">
      <h1>Task Dashboard</h1>
      <TaskForm onAddTask={handleAddTask} />
      
      {/* TODO: Add filter button navigation controls:
                  - Buttons triggering setFilter to "All", "Active", "Completed".
      */}

      <div className="task-list mt-6">
        {tasks.length === 0 ? (
          <p>No tasks available</p>
        ) : (
          tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onDelete={handleDeleteTask} 
              onToggleComplete={handleToggleComplete} 
            />
          ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
