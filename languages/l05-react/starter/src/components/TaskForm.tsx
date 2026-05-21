import React, { useState } from 'react';

interface TaskFormProps {
  onAddTask: (title: string, description: string, priority: 'Low' | 'Medium' | 'High') => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onAddTask }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    // TODO: Invoke onAddTask callback with state values. Clear input fields.
  };

  return (
    <form onSubmit={handleSubmit} className="task-form flex flex-col gap-2">
      {/* TODO: Add input fields for:
                  - Title (with placeholder "Task title")
                  - Description (with placeholder "Task description")
                  - Priority Select box (values: Low, Medium, High)
                  - Add Task Submit button
      */}
      <input 
        type="text" 
        placeholder="Task title" 
        value={title} 
        onChange={(e) => setTitle(e.target.value)} 
      />
      <input 
        type="text" 
        placeholder="Task description" 
        value={description} 
        onChange={(e) => setDescription(e.target.value)} 
      />
      <button type="submit">Add Task</button>
    </form>
  );
};

export default TaskForm;
