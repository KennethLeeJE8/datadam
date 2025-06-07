import { supabaseAdmin } from '../database/client.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export enum ErrorCategory {
  VALIDATION = 'validation',
  DATABASE = 'database',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NETWORK = 'network',
  SYSTEM = 'system',
  BUSINESS_LOGIC = 'business_logic',
  EXTERNAL_SERVICE = 'external_service',
}

export interface ErrorContext {
  userId?: string;
  toolName?: string;
  resourceName?: string;
  requestId?: string;
  sessionId?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
  promise?: string;
  duration?: number;
  recoveryStrategy?: string;
  errorMessage?: string;
  strategyName?: string;
  correlationId?: string;
  alertData?: Record<string, unknown>;
  ruleId?: string;
  context?: Record<string, unknown>;
  attempt?: number;
  strategiesAttempted?: string[];
  updates?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  category?: ErrorCategory;
  context?: ErrorContext;
  error?: Error;
  timestamp: string;
  hostname: string;
  processId: number;
  correlationId?: string;
}

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  lastErrorTime: string;
  topErrors: Array<{ message: string; count: number }>;
  errorsByCategory: Record<ErrorCategory, number>;
}

class Logger {
  private correlationId: string;
  private sessionMetrics: Map<string, ErrorMetrics> = new Map();

  constructor() {
    this.correlationId = this.generateCorrelationId();
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    category?: ErrorCategory,
    context?: ErrorContext,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      category,
      context,
      error,
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME || 'unknown',
      processId: process.pid,
      correlationId: this.correlationId,
    };
  }

  private async persistLog(entry: LogEntry): Promise<void> {
    try {
      await supabaseAdmin
        .from('error_logs')
        .insert({
          level: LogLevel[entry.level].toLowerCase(),
          message: entry.message,
          category: entry.category,
          context: entry.context,
          error_details: entry.error ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          } : null,
          timestamp: entry.timestamp,
          hostname: entry.hostname,
          process_id: entry.processId,
          correlation_id: entry.correlationId,
        });
    } catch (persistError) {
      console.error('Failed to persist log entry:', persistError);
    }
  }

  private updateMetrics(entry: LogEntry): void {
    if (entry.level >= LogLevel.ERROR && entry.context?.sessionId) {
      const sessionId = entry.context.sessionId;
      const metrics = this.sessionMetrics.get(sessionId) || {
        errorCount: 0,
        errorRate: 0,
        lastErrorTime: '',
        topErrors: [],
        errorsByCategory: {} as Record<ErrorCategory, number>,
      };

      metrics.errorCount++;
      metrics.lastErrorTime = entry.timestamp;
      
      if (entry.category) {
        metrics.errorsByCategory[entry.category] = (metrics.errorsByCategory[entry.category] || 0) + 1;
      }

      const existingError = metrics.topErrors.find(e => e.message === entry.message);
      if (existingError) {
        existingError.count++;
      } else {
        metrics.topErrors.push({ message: entry.message, count: 1 });
      }

      metrics.topErrors.sort((a, b) => b.count - a.count).slice(0, 10);
      this.sessionMetrics.set(sessionId, metrics);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const logLevel = process.env.LOG_LEVEL ? 
      LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] : 
      LogLevel.INFO;
    return level >= logLevel;
  }

  private formatConsoleOutput(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level].padEnd(5);
    const contextStr = entry.context ? 
      `[${entry.context.toolName || entry.context.resourceName || 'unknown'}]` : 
      '';
    const categoryStr = entry.category ? `[${entry.category}]` : '';
    
    let output = `${entry.timestamp} ${levelStr} ${contextStr}${categoryStr} ${entry.message}`;
    
    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack && entry.level >= LogLevel.ERROR) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }
    
    if (entry.context?.metadata) {
      output += `\n  Metadata: ${JSON.stringify(entry.context.metadata, null, 2)}`;
    }
    
    return output;
  }

  private outputToConsole(entry: LogEntry): void {
    const output = this.formatConsoleOutput(entry);
    
    if (entry.level >= LogLevel.ERROR) {
      console.error(output);
    } else if (entry.level === LogLevel.WARN) {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  debug(message: string, context?: ErrorContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, message, undefined, context);
    this.outputToConsole(entry);
  }

  info(message: string, context?: ErrorContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, message, undefined, context);
    this.outputToConsole(entry);
  }

  warn(message: string, category?: ErrorCategory, context?: ErrorContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, message, category, context);
    this.outputToConsole(entry);
    this.updateMetrics(entry);
    this.persistLog(entry);
  }

  error(
    message: string, 
    error?: Error, 
    category?: ErrorCategory, 
    context?: ErrorContext
  ): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, category, context, error);
    this.outputToConsole(entry);
    this.updateMetrics(entry);
    this.persistLog(entry);
  }

  critical(
    message: string, 
    error?: Error, 
    category?: ErrorCategory, 
    context?: ErrorContext
  ): void {
    const entry = this.createLogEntry(LogLevel.CRITICAL, message, category, context, error);
    this.outputToConsole(entry);
    this.updateMetrics(entry);
    this.persistLog(entry);
    
    // Critical errors should trigger immediate alerts
    this.triggerAlert(entry);
  }

  private async triggerAlert(entry: LogEntry): Promise<void> {
    try {
      await supabaseAdmin
        .from('error_alerts')
        .insert({
          level: 'critical',
          message: entry.message,
          context: entry.context,
          timestamp: entry.timestamp,
          correlation_id: entry.correlationId,
          status: 'pending',
        });
    } catch (alertError) {
      console.error('Failed to trigger alert:', alertError);
    }
  }

  getMetrics(sessionId: string): ErrorMetrics | undefined {
    return this.sessionMetrics.get(sessionId);
  }

  async getRecentErrors(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('error_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch recent errors:', error);
      return [];
    }
  }

  async getErrorStats(timeWindow: string = '1 hour'): Promise<Record<string, number>> {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('get_error_stats', { time_window: timeWindow });

      if (error) throw error;
      return data || {};
    } catch (error) {
      console.error('Failed to fetch error stats:', error);
      return {};
    }
  }

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  getCorrelationId(): string {
    return this.correlationId;
  }
}

export const logger = new Logger();

export function createRequestLogger(requestId: string, sessionId?: string) {
  const requestLogger = new Logger();
  requestLogger.setCorrelationId(requestId);
  
  return {
    debug: (message: string, context?: Omit<ErrorContext, 'requestId' | 'sessionId'>) => 
      requestLogger.debug(message, { ...context, requestId, sessionId }),
    
    info: (message: string, context?: Omit<ErrorContext, 'requestId' | 'sessionId'>) => 
      requestLogger.info(message, { ...context, requestId, sessionId }),
    
    warn: (message: string, category?: ErrorCategory, context?: Omit<ErrorContext, 'requestId' | 'sessionId'>) => 
      requestLogger.warn(message, category, { ...context, requestId, sessionId }),
    
    error: (message: string, error?: Error, category?: ErrorCategory, context?: Omit<ErrorContext, 'requestId' | 'sessionId'>) => 
      requestLogger.error(message, error, category, { ...context, requestId, sessionId }),
    
    critical: (message: string, error?: Error, category?: ErrorCategory, context?: Omit<ErrorContext, 'requestId' | 'sessionId'>) => 
      requestLogger.critical(message, error, category, { ...context, requestId, sessionId }),
    
    getCorrelationId: () => requestLogger.getCorrelationId(),
  };
}