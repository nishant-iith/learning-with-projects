import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { NoteService } from '../src/noteService.js';

const DATA_DIR = path.resolve('./data');

describe('Notes System Integration Tests', () => {
  beforeEach(async () => {
    // Ensure clean state: delete and recreate data directory
    await fs.rm(DATA_DIR, { recursive: true, force: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  });

  it('should create and retrieve notes successfully', async () => {
    const service = new NoteService();
    const note = await service.createNote('Hello World', 'This is my first note');
    
    expect(note.id).toBeDefined();
    expect(note.title).toBe('Hello World');
    expect(note.content).toBe('This is my first note');

    const retrieved = await service.getNoteById(note.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('Hello World');
  });

  it('should return null for non-existent notes', async () => {
    const service = new NoteService();
    const retrieved = await service.getNoteById('invalid-id');
    expect(retrieved).toBeNull();
  });

  it('should list all notes ordered by date descending', async () => {
    const service = new NoteService();
    const n1 = await service.createNote('First', 'Content');
    // Force a small delay to separate timestamps
    await new Promise((r) => setTimeout(r, 15));
    const n2 = await service.createNote('Second', 'Content');

    const list = await service.getAllNotes();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(n2.id); // Descending order
    expect(list[1].id).toBe(n1.id);
  });

  it('should delete notes successfully', async () => {
    const service = new NoteService();
    const note = await service.createNote('To Delete', 'Goodbye');
    
    const deleted = await service.deleteNote(note.id);
    expect(deleted).toBe(true);

    const retrieved = await service.getNoteById(note.id);
    expect(retrieved).toBeNull();
  });

  it('should return false when deleting non-existent note', async () => {
    const service = new NoteService();
    const deleted = await service.deleteNote('missing-id');
    expect(deleted).toBe(false);
  });
});
