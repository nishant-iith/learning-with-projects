import http from 'http';
import { NoteService } from './noteService.js';

const noteService = new NoteService();
const PORT = process.env.PORT || 3000;

export const server = http.createServer(async (req, res) => {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Set default JSON Content-Type headers
  res.setHeader('Content-Type', 'application/json');

  try {
    // 1. GET /api/notes - Get all notes
    if (url === '/api/notes' && method === 'GET') {
      // TODO: Call noteService.getAllNotes() and write JSON response.
      res.writeHead(200);
      res.end(JSON.stringify([]));
      return;
    }

    // 2. GET /api/notes/:id - Get a single note by ID
    if (url.startsWith('/api/notes/') && method === 'GET') {
      const id = url.substring('/api/notes/'.length);
      // TODO: Call noteService.getNoteById(id). Return 404 if null, 200 with note if found.
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Not implemented' }));
      return;
    }

    // 3. POST /api/notes - Create a new note
    if (url === '/api/notes' && method === 'POST') {
      let body = '';

      // Accumulate buffers from the request stream
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          // TODO: Parse request body (JSON.parse). Ensure it has 'title' and 'content'.
          // TODO: Call noteService.createNote(title, content).
          // TODO: Respond with 211 Created and the new note JSON.
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Not implemented' }));
        } catch (err) {
          // Bad JSON or syntax errors
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
        }
      });
      return;
    }

    // 4. DELETE /api/notes/:id - Delete a note
    if (url.startsWith('/api/notes/') && method === 'DELETE') {
      const id = url.substring('/api/notes/'.length);
      // TODO: Call noteService.deleteNote(id). Return 200 with success status, or 404 if not found.
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Not implemented' }));
      return;
    }

    // 5. Default Route - 404 Not Found
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Route not found' }));

  } catch (error) {
    // 6. Global Catch - 500 Internal Server Error
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Avoid executing listen if imported in tests
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}
