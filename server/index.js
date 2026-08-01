import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

const PORT = process.env.PORT || 9998

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Serve static files from out/renderer
const rendererPath = path.join(__dirname, '../out/renderer')
app.use(express.static(rendererPath))

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('[Server] Client connected:', socket.id)

  // Import and setup IPC handlers
  setupIpcHandlers(socket)

  socket.on('disconnect', () => {
    console.log('[Server] Client disconnected:', socket.id)
  })
})

// Setup IPC handlers
function setupIpcHandlers(socket) {
  // Load accounts
  socket.on('load-accounts', async (callback) => {
    try {
      const { loadAccounts } = await import('../src/main/storage.js')
      const data = await loadAccounts()
      callback({ success: true, data })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Save accounts
  socket.on('save-accounts', async (data, callback) => {
    try {
      const { saveAccounts } = await import('../src/main/storage.js')
      await saveAccounts(data)
      callback({ success: true })
    } catch (error) {
      callback({ success: false, error: error.message })
    }
  })

  // Get app version
  socket.on('get-app-version', (callback) => {
    callback('1.7.0-web')
  })

  // Proxy status
  socket.on('proxy-get-status', (callback) => {
    callback({
      running: false,
      config: {},
      stats: {}
    })
  })

  // Add more handlers as needed...
  console.log('[Server] IPC handlers registered for socket:', socket.id)
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(rendererPath, 'index.html'))
})

// Start server
httpServer.listen(PORT, () => {
  console.log('╔════════════════════════════════════════╗')
  console.log('║   Kiro Account Manager - Web Server   ║')
  console.log('╠════════════════════════════════════════╣')
  console.log(`║  URL: http://localhost:${PORT}           ║`)
  console.log(`║  WebSocket: ws://localhost:${PORT}       ║`)
  console.log('╠════════════════════════════════════════╣')
  console.log('║  Press Ctrl+C to stop                  ║')
  console.log('╚════════════════════════════════════════╝')
})

process.on('SIGTERM', () => {
  console.log('[Server] Shutting down...')
  httpServer.close(() => {
    process.exit(0)
  })
})
