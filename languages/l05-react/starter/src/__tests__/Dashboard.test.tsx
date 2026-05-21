import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dashboard from '../components/Dashboard.tsx';

describe('React Task Dashboard Unit Tests', () => {
  it('should render the dashboard successfully with empty state', () => {
    render(<Dashboard />);
    expect(screen.getByText(/Task Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/No tasks available/i)).toBeInTheDocument();
  });

  it('should allow users to add a new task', () => {
    render(<Dashboard />);
    
    // Simulate user typing in input fields
    const titleInput = screen.getByPlaceholderText(/Task title/i);
    const descInput = screen.getByPlaceholderText(/Task description/i);
    const addButton = screen.getByText(/Add Task/i);

    fireEvent.change(titleInput, { target: { value: 'Learn React Hooks' } });
    fireEvent.change(descInput, { target: { value: 'Master useState and useEffect' } });
    fireEvent.click(addButton);

    // Verify task is added to the screen
    expect(screen.getByText('Learn React Hooks')).toBeInTheDocument();
    expect(screen.getByText('Master useState and useEffect')).toBeInTheDocument();
  });

  it('should allow users to delete a task', () => {
    render(<Dashboard />);
    
    // Add a task
    const titleInput = screen.getByPlaceholderText(/Task title/i);
    const addButton = screen.getByText(/Add Task/i);
    fireEvent.change(titleInput, { target: { value: 'Discardable Task' } });
    fireEvent.click(addButton);

    expect(screen.getByText('Discardable Task')).toBeInTheDocument();

    // Click delete
    const deleteButton = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButton);

    // Verify task is removed
    expect(screen.queryByText('Discardable Task')).not.toBeInTheDocument();
  });
});
