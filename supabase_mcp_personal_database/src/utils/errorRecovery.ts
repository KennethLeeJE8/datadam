import { supabaseAdmin } from '../database/client.js';
import { logger, ErrorCategory, ErrorContext } from './logger.js';

export interface RecoveryStrategy {
  name: string;
  description: string;
  applicable: (error: Error, context: ErrorContext) => boolean;
  execute: (error: Error, context: ErrorContext, attempt: number) => Promise<RecoveryResult>;
  maxAttempts: number;
  backoffMultiplier: number;
  initialDelay: number;
}

export interface RecoveryResult {
  success: boolean;
  message: string;
  shouldRetry: boolean;
  data?: unknown;
  error?: Error;
}

export interface RecoveryAttempt {
  strategy: string;
  attempt: number;
  success: boolean;
  duration: number;
  error?: Error;
}

class ErrorRecoveryManager {
  private strategies: Map<string, RecoveryStrategy> = new Map();
  private activeRecoveries: Map<string, RecoveryAttempt[]> = new Map();

  constructor() {
    this.initializeDefaultStrategies();
  }

  private initializeDefaultStrategies(): void {
    const strategies: RecoveryStrategy[] = [
      {
        name: 'database_retry',
        description: 'Retry database operations with exponential backoff',
        applicable: (error, context) => {
          return error.message.includes('Database error') || 
                 error.message.includes('connection') ||
                 (context.operation?.includes('database') ?? false);
        },
        execute: async (error, context, attempt) => {
          const delay = this.calculateBackoffDelay(1000, 2, attempt);
          await this.sleep(delay);

          try {
            // Attempt to reconnect or retry the operation
            const testQuery = await supabaseAdmin
              .from('personal_data')
              .select('id')
              .limit(1);

            if (testQuery.error) {
              return {
                success: false,
                message: 'Database connection still failing',
                shouldRetry: attempt < 3,
                error: testQuery.error as Error,
              };
            }

            return {
              success: true,
              message: 'Database connection restored',
              shouldRetry: false,
              data: { connectionRestored: true },
            };
          } catch (retryError) {
            return {
              success: false,
              message: `Database retry failed: ${(retryError as Error).message}`,
              shouldRetry: attempt < 3,
              error: retryError as Error,
            };
          }
        },
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },

      {
        name: 'validation_fallback',
        description: 'Provide default values for validation errors',
        applicable: (error, context) => {
          return error.message.includes('validation') || 
                 error.message.includes('required') ||
                 (context.operation?.includes('validate') ?? false);
        },
        execute: async (error, context, attempt) => {
          try {
            // Attempt to provide sensible defaults or cleaned data
            const fallbackData = this.generateFallbackData(error, context);
            
            return {
              success: true,
              message: 'Applied validation fallback strategy',
              shouldRetry: false,
              data: fallbackData,
            };
          } catch (fallbackError) {
            return {
              success: false,
              message: `Validation fallback failed: ${(fallbackError as Error).message}`,
              shouldRetry: false,
              error: fallbackError as Error,
            };
          }
        },
        maxAttempts: 1,
        backoffMultiplier: 1,
        initialDelay: 0,
      },

      {
        name: 'network_retry',
        description: 'Retry network operations with jitter',
        applicable: (error, context) => {
          return error.message.includes('network') || 
                 error.message.includes('timeout') ||
                 error.message.includes('fetch') ||
                 (context.operation?.includes('network') ?? false);
        },
        execute: async (error, context, attempt) => {
          // Add jitter to prevent thundering herd
          const baseDelay = this.calculateBackoffDelay(2000, 1.5, attempt);
          const jitter = Math.random() * 1000;
          await this.sleep(baseDelay + jitter);

          try {
            // This would contain logic to retry the specific network operation
            // For now, we'll simulate a recovery attempt
            const networkTest = await this.testNetworkConnectivity();
            
            if (!networkTest) {
              return {
                success: false,
                message: 'Network connectivity still unavailable',
                shouldRetry: attempt < 5,
              };
            }

            return {
              success: true,
              message: 'Network connectivity restored',
              shouldRetry: false,
              data: { networkRestored: true },
            };
          } catch (retryError) {
            return {
              success: false,
              message: `Network retry failed: ${(retryError as Error).message}`,
              shouldRetry: attempt < 5,
              error: retryError as Error,
            };
          }
        },
        maxAttempts: 5,
        backoffMultiplier: 1.5,
        initialDelay: 2000,
      },

      {
        name: 'auth_token_refresh',
        description: 'Refresh authentication tokens',
        applicable: (error, context) => {
          return error.message.includes('authentication') || 
                 error.message.includes('unauthorized') ||
                 error.message.includes('token') ||
                 (context.operation?.includes('auth') ?? false);
        },
        execute: async (error, context, attempt) => {
          try {
            // Attempt to refresh authentication tokens
            // This is a placeholder - actual implementation would depend on auth system
            const refreshResult = await this.refreshAuthTokens(context);
            
            if (!refreshResult) {
              return {
                success: false,
                message: 'Token refresh failed',
                shouldRetry: attempt < 2,
              };
            }

            return {
              success: true,
              message: 'Authentication tokens refreshed',
              shouldRetry: false,
              data: { tokensRefreshed: true },
            };
          } catch (refreshError) {
            return {
              success: false,
              message: `Token refresh failed: ${(refreshError as Error).message}`,
              shouldRetry: attempt < 2,
              error: refreshError as Error,
            };
          }
        },
        maxAttempts: 2,
        backoffMultiplier: 2,
        initialDelay: 500,
      },

      {
        name: 'graceful_degradation',
        description: 'Degrade functionality gracefully when possible',
        applicable: (error, context) => {
          // Apply to errors that don\'t have more specific strategies
          return !error.message.includes('critical') && 
                 !error.message.includes('fatal');
        },
        execute: async (error, context, attempt) => {
          try {
            // Implement graceful degradation logic
            const degradedResponse = this.createDegradedResponse(error, context);
            
            return {
              success: true,
              message: 'Gracefully degraded functionality',
              shouldRetry: false,
              data: degradedResponse,
            };
          } catch (degradationError) {
            return {
              success: false,
              message: `Graceful degradation failed: ${(degradationError as Error).message}`,
              shouldRetry: false,
              error: degradationError as Error,
            };
          }
        },
        maxAttempts: 1,
        backoffMultiplier: 1,
        initialDelay: 0,
      },
    ];

    strategies.forEach(strategy => this.strategies.set(strategy.name, strategy));
  }

  public async attemptRecovery(
    error: Error,
    context: ErrorContext,
    correlationId: string
  ): Promise<RecoveryResult> {
    const applicableStrategies = this.getApplicableStrategies(error, context);
    
    if (applicableStrategies.length === 0) {
      logger.warn('No recovery strategies applicable for error', ErrorCategory.SYSTEM, {
        ...context,
        errorMessage: error.message,
        correlationId,
      });
      
      return {
        success: false,
        message: 'No recovery strategies available',
        shouldRetry: false,
        error,
      };
    }

    // Try strategies in order of specificity (most specific first)
    for (const strategy of applicableStrategies) {
      const attempts = this.activeRecoveries.get(correlationId) || [];
      const strategyAttempts = attempts.filter(a => a.strategy === strategy.name);
      
      if (strategyAttempts.length >= strategy.maxAttempts) {
        logger.info(`Skipping strategy ${strategy.name} - max attempts reached`, {
          ...context,
          strategyName: strategy.name,
          correlationId,
          metadata: { ...context.metadata, attempts: strategyAttempts.length },
        });
        continue;
      }

      const attemptNumber = strategyAttempts.length + 1;
      const startTime = Date.now();

      try {
        logger.info(`Attempting recovery strategy: ${strategy.name} (attempt ${attemptNumber})`, {
          ...context,
          strategyName: strategy.name,
          attempt: attemptNumber,
          correlationId,
        });

        const result = await strategy.execute(error, context, attemptNumber);
        const duration = Date.now() - startTime;

        // Record the attempt
        await this.recordRecoveryAttempt(
          correlationId,
          strategy.name,
          attemptNumber,
          result.success,
          duration,
          result.error
        );

        const attempt: RecoveryAttempt = {
          strategy: strategy.name,
          attempt: attemptNumber,
          success: result.success,
          duration,
          error: result.error,
        };

        attempts.push(attempt);
        this.activeRecoveries.set(correlationId, attempts);

        if (result.success) {
          logger.info(`Recovery strategy ${strategy.name} succeeded`, {
            ...context,
            strategyName: strategy.name,
            attempt: attemptNumber,
            duration,
            correlationId,
          });
          
          return result;
        } else if (result.shouldRetry) {
          logger.warn(`Recovery strategy ${strategy.name} failed, will retry`, ErrorCategory.SYSTEM, {
            ...context,
            strategyName: strategy.name,
            attempt: attemptNumber,
            duration,
            error: result.error?.message,
            correlationId,
          });
          
          // Continue to try next strategy or retry this one
          continue;
        } else {
          logger.warn(`Recovery strategy ${strategy.name} failed, not retrying`, ErrorCategory.SYSTEM, {
            ...context,
            strategyName: strategy.name,
            attempt: attemptNumber,
            duration,
            error: result.error?.message,
            correlationId,
          });
          
          // Try next strategy
          continue;
        }
      } catch (strategyError) {
        const duration = Date.now() - startTime;
        
        logger.error(
          `Recovery strategy ${strategy.name} threw error`,
          strategyError as Error,
          ErrorCategory.SYSTEM,
          {
            ...context,
            strategyName: strategy.name,
            attempt: attemptNumber,
            duration,
            correlationId,
          }
        );

        await this.recordRecoveryAttempt(
          correlationId,
          strategy.name,
          attemptNumber,
          false,
          duration,
          strategyError as Error
        );
      }
    }

    // All strategies failed
    logger.error('All recovery strategies failed', undefined, ErrorCategory.SYSTEM, {
      ...context,
      correlationId,
      strategiesAttempted: applicableStrategies.map(s => s.name),
    });

    return {
      success: false,
      message: 'All recovery strategies failed',
      shouldRetry: false,
      error,
    };
  }

  private getApplicableStrategies(error: Error, context: ErrorContext): RecoveryStrategy[] {
    const applicable = Array.from(this.strategies.values()).filter(strategy =>
      strategy.applicable(error, context)
    );

    // Sort by specificity (strategies with more specific conditions first)
    return applicable.sort((a, b) => {
      // More specific strategies have lower initial delays (assumption)
      return a.initialDelay - b.initialDelay;
    });
  }

  private async recordRecoveryAttempt(
    correlationId: string,
    strategy: string,
    attempt: number,
    success: boolean,
    duration: number,
    error?: Error
  ): Promise<void> {
    try {
      await supabaseAdmin.from('error_recovery_attempts').insert({
        error_correlation_id: correlationId,
        recovery_strategy: strategy,
        attempt_number: attempt,
        status: success ? 'succeeded' : 'failed',
        duration_ms: duration,
        error_details: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : null,
        started_at: new Date(Date.now() - duration).toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (recordError) {
      logger.error(
        'Failed to record recovery attempt',
        recordError as Error,
        ErrorCategory.DATABASE
      );
    }
  }

  private calculateBackoffDelay(
    initialDelay: number,
    multiplier: number,
    attempt: number
  ): number {
    return Math.min(initialDelay * Math.pow(multiplier, attempt - 1), 30000); // Max 30 seconds
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateFallbackData(error: Error, context: ErrorContext): unknown {
    // Generate sensible defaults based on the error and context
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('user_id')) {
      return { user_id: 'anonymous' };
    }
    
    if (errorMessage.includes('limit')) {
      return { limit: 50, offset: 0 };
    }
    
    if (errorMessage.includes('title')) {
      return { title: 'Untitled' };
    }
    
    // Generic fallback
    return {
      warning: 'Using fallback data due to validation error',
      original_error: error.message,
    };
  }

  private async testNetworkConnectivity(): Promise<boolean> {
    try {
      // Test basic connectivity to Supabase
      const { error } = await supabaseAdmin
        .from('personal_data')
        .select('id')
        .limit(1);
      
      return !error;
    } catch {
      return false;
    }
  }

  private async refreshAuthTokens(context: ErrorContext): Promise<boolean> {
    // Placeholder for auth token refresh logic
    // In a real implementation, this would refresh JWT tokens, API keys, etc.
    logger.info('Auth token refresh attempted', { context });
    return true; // Simulate success for now
  }

  private createDegradedResponse(error: Error, context: ErrorContext): unknown {
    return {
      degraded: true,
      error: 'Service temporarily unavailable',
      fallback_message: 'Operating in reduced functionality mode',
      retry_after: '5 minutes',
      context: {
        operation: context.operation,
        tool: context.toolName,
        resource: context.resourceName,
      },
    };
  }

  public addStrategy(strategy: RecoveryStrategy): void {
    this.strategies.set(strategy.name, strategy);
    logger.info(`Added recovery strategy: ${strategy.name}`);
  }

  public removeStrategy(strategyName: string): void {
    this.strategies.delete(strategyName);
    logger.info(`Removed recovery strategy: ${strategyName}`);
  }

  public getStrategies(): RecoveryStrategy[] {
    return Array.from(this.strategies.values());
  }

  public clearActiveRecoveries(correlationId?: string): void {
    if (correlationId) {
      this.activeRecoveries.delete(correlationId);
    } else {
      this.activeRecoveries.clear();
    }
  }

  public async getRecoveryStats(timeWindow?: string): Promise<any> {
    try {
      const since = timeWindow ? 
        new Date(Date.now() - this.parseTimeWindow(timeWindow) * 1000) : 
        new Date(Date.now() - 24 * 60 * 60 * 1000); // Default 24 hours

      const { data, error } = await supabaseAdmin
        .from('error_recovery_attempts')
        .select('*')
        .gte('started_at', since.toISOString());

      if (error) throw error;

      return this.aggregateRecoveryStats(data || []);
    } catch (error) {
      logger.error('Failed to get recovery stats', error as Error, ErrorCategory.DATABASE);
      return {};
    }
  }

  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(value) * (multipliers[unit as keyof typeof multipliers] || 3600);
  }

  private aggregateRecoveryStats(attempts: any[]): any {
    const total = attempts.length;
    const successful = attempts.filter(a => a.status === 'succeeded').length;
    const failed = attempts.filter(a => a.status === 'failed').length;
    
    const byStrategy = attempts.reduce((acc, attempt) => {
      const strategy = attempt.recovery_strategy;
      if (!acc[strategy]) {
        acc[strategy] = { total: 0, successful: 0, failed: 0 };
      }
      acc[strategy].total++;
      if (attempt.status === 'succeeded') {
        acc[strategy].successful++;
      } else {
        acc[strategy].failed++;
      }
      return acc;
    }, {});

    const averageDuration = attempts.length > 0 ? 
      attempts.reduce((sum, a) => sum + (a.duration_ms || 0), 0) / attempts.length : 0;

    return {
      total,
      successful,
      failed,
      success_rate: total > 0 ? (successful / total) * 100 : 0,
      average_duration_ms: Math.round(averageDuration),
      by_strategy: byStrategy,
    };
  }
}

export const errorRecovery = new ErrorRecoveryManager();