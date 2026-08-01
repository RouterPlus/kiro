import express, { Application } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import cors from 'cors';
import { ipcMain } from 'electron';

export class WebServer {
  private app: Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;

  constructor(port: number = 9998) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: [`http://localhost:${port}`, 'http://localhost:5173'],
        credentials: true
      }
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.bridgeIpcEvents();
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: [`http://localhost:${this.port}`, 'http://localhost:5173'],
      credentials: true
    }));
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ success: true, status: 'healthy', timestamp: Date.now() });
    });

    // Account endpoints - bridge to IPC
    this.app.get('/api/accounts', async (req, res) => {
      try {
        const accounts = await this.invokeIpc('load-accounts');
        res.json({ success: true, data: accounts });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/accounts/:id/refresh', async (req, res) => {
      try {
        const result = await this.invokeIpc('refresh-account-token', req.body);
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Proxy endpoints
    this.app.get('/api/proxy/status', async (req, res) => {
      try {
        const status = await this.invokeIpc('proxy-get-status');
        res.json({ success: true, data: status });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/proxy/start', async (req, res) => {
      try {
        const result = await this.invokeIpc('proxy-start', req.body);
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/proxy/stop', async (req, res) => {
      try {
        const result = await this.invokeIpc('proxy-stop');
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Add more routes as needed...
  }

  private setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('[WebSocket] Client connected:', socket.id);

      socket.on('subscribe', (data: { topics: string[] }) => {
        data.topics?.forEach(topic => {
          socket.join(topic);
          console.log(`[WebSocket] Client ${socket.id} subscribed to ${topic}`);
        });
      });

      socket.on('disconnect', () => {
        console.log('[WebSocket] Client disconnected:', socket.id);
      });
    });
  }

  private bridgeIpcEvents() {
    // Forward IPC events to WebSocket clients
    const events = [
      'proxy-request',
      'proxy-response',
      'proxy-error',
      'proxy-status-change',
      'proxy-account-update',
      'kproxy-request',
      'kproxy-response',
      'kproxy-status-change',
      'background-refresh-progress',
      'background-refresh-result',
      'registration-log',
      'registration-complete'
    ];

    events.forEach(event => {
      ipcMain.on(event, (_, data) => {
        const wsEvent = event.replace(/-/g, ':');
        this.io.emit(wsEvent, { event: wsEvent, data, timestamp: Date.now() });
      });
    });
  }

  private invokeIpc(channel: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      // Since we're in main process, we need to call the handler directly
      // In production, you'd import and call the actual handler functions
      reject(new Error('IPC bridge not fully implemented yet'));
    });
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`[Web Server] Running on http://localhost:${this.port}`);
      console.log(`[WebSocket] Running on ws://localhost:${this.port}`);
    });
  }

  stop() {
    this.server?.close();
    this.io?.close();
  }
}

// Export singleton instance
let webServerInstance: WebServer | null = null;

export function startWebServer(port: number = 9998): WebServer {
  if (!webServerInstance) {
    webServerInstance = new WebServer(port);
    webServerInstance.start();
  }
  return webServerInstance;
}

export function getWebServer(): WebServer | null {
  return webServerInstance;
}

export function stopWebServer() {
  if (webServerInstance) {
    webServerInstance.stop();
    webServerInstance = null;
  }
}
