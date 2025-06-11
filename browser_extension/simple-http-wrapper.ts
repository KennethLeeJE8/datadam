// Simple HTTP wrapper to add to your existing MCP server
// Add this to the end of your src/server/index.ts file

import express from 'express';
import cors from 'cors';

class SimpleHttpWrapper {
  private app: express.Application;
  private mcpServer: any; // Your existing MCP server instance

  constructor(mcpServer: any, port: number = 3001) {
    this.mcpServer = mcpServer;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.start(port);
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'MCP HTTP API' });
    });

    // Extract personal data endpoint
    this.app.post('/api/extract_personal_data', async (req, res) => {
      try {
        const { user_id } = req.body;

        if (!user_id) {
          return res.status(400).json({ error: 'user_id is required' });
        }

        // Simulate calling your MCP tool
        // In reality, you'd call your actual extractPersonalData function
        const result = await this.extractPersonalData(req.body);

        res.json({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  private async extractPersonalData(params: any): Promise<any> {
    // Import your database query directly
    const { supabaseAdmin } = await import('../../database/client.js');
    
    try {
      const { data, error } = await supabaseAdmin
        .from('personal_data')
        .select('*')
        .eq('user_id', params.user_id)
        .limit(params.limit || 50);

      if (error) throw error;

      return {
        data: data || [],
        pagination: {
          offset: params.offset || 0,
          limit: params.limit || 50,
          total: data?.length || 0
        },
        extracted_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database query failed:', error);
      throw error;
    }
  }

  private start(port: number): void {
    this.app.listen(port, () => {
      console.log(`🌐 HTTP API running on http://localhost:${port}`);
      console.log(`📋 Endpoints:`);
      console.log(`   GET  http://localhost:${port}/health`);
      console.log(`   POST http://localhost:${port}/api/extract_personal_data`);
    });
  }
}

export { SimpleHttpWrapper };