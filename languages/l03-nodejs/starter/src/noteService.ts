import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export class NoteService {
  private dataDir: string;

  constructor(dataDir: string = './data') {
    this.dataDir = path.resolve(dataDir);
  }

  /**
   * Scans the data directory, reads all JSON note files,
   * and returns them sorted by createdAt timestamp descending.
   */
  async getAllNotes(): Promise<Note[]> {
    // TODO: Step 1. Ensure directory exists using fs.mkdir with recursive option.
    // TODO: Step 2. Read all files in dataDir directory.
    // TODO: Step 3. Filter files keeping only those with '.json' extension.
    // TODO: Step 4. Read each file content asynchronously using fs.readFile.
    // TODO: Step 5. Parse JSON content, accumulate into Note objects, and sort them descending by createdAt.
    return [];
  }

  /**
   * Reads a single note by its ID. Returns null if not found.
   */
  async getNoteById(id: string): Promise<Note | null> {
    // TODO: Step 1. Construct the absolute filepath for the target note.
    // TODO: Step 2. Read file content. Catch ENOENT errors and return null.
    // TODO: Step 3. Parse JSON content and return the Note model.
    return null;
  }

  /**
   * Generates a unique note ID and saves the note atomically to prevent race conditions.
   */
  async createNote(title: string, content: string): Promise<Note> {
    // TODO: Step 1. Ensure the data directory exists.
    // TODO: Step 2. Construct the Note object with crypto.randomUUID() and new Date().toISOString().
    // TODO: Step 3. Construct paths for a temporary file (e.g. ./data/${id}.tmp) and final file (./data/${id}.json).
    // TODO: Step 4. Write the JSON string to the temporary file.
    // TODO: Step 5. Atomically rename the temporary file to the final destination file (fs.rename).
    // TODO: Step 6. Return the newly created Note object.
    throw new Error('Not implemented');
  }

  /**
   * Deletes a note by its ID. Returns true if deleted, false if the note did not exist.
   */
  async deleteNote(id: string): Promise<boolean> {
    // TODO: Step 1. Construct the absolute file path.
    // TODO: Step 2. Delete the file using fs.unlink. Handle ENOENT gracefully by returning false.
    return false;
  }
}
