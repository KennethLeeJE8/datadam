#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

import { PersonalDataMCPServer } from './PersonalDataMCPServer.js';
import { HTTPMCPServer } from '../http/http-server.js';
import { logger, ErrorCategory } from '../utils/logger.js';
import { errorMonitoring } from '../utils/monitoring.js';

dotenv.config();

// Environment-based transport selection
async function startServer(): Promise<void> {
  try {
    const transport = process.env.MCP_TRANSPORT || 'stdio';
    
    logger.info('Starting Personal Data MCP Server', { transport });

    if (transport === 'http') {
      // Start HTTP server
      const httpServer = new HTTPMCPServer();
      await httpServer.start();
    } else {
      // Start stdio server (default)
      const server = new PersonalDataMCPServer();
      await server.initializeDatabase();

      const stdioTransport = new StdioServerTransport();
      await server.getServer().connect(stdioTransport);

      logger.info('Personal Data MCP Server running on stdio');
      console.error('Server started - Personal Data MCP Server running on stdio');
    }
  } catch (error) {
    logger.critical(
      'Failed to start Personal Data MCP Server',
      error as Error,
      ErrorCategory.SYSTEM
    );
    throw error;
  }
}

// Start the server
startServer().catch((error) => {
  logger.critical(
    'Server startup failed',
    error,
    ErrorCategory.SYSTEM
  );
  console.error(error);
  process.exit(1);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  errorMonitoring.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  errorMonitoring.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.critical(
    'Unhandled Promise Rejection',
    reason as Error,
    ErrorCategory.SYSTEM,
    { promise: promise.toString() }
  );
});

process.on('uncaughtException', (error) => {
  logger.critical(
    'Uncaught Exception',
    error,
    ErrorCategory.SYSTEM
  );
  process.exit(1);
});