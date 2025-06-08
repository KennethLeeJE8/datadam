import { supabaseAdmin } from '../database/client.js';
import { logger, ErrorCategory, LogLevel } from './logger.js';

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  threshold: number;
  timeWindow: string; // e.g., '5m', '1h', '1d'
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  actions: AlertAction[];
}

export interface AlertCondition {
  metric: 'error_rate' | 'error_count' | 'critical_errors' | 'specific_error';
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  filters?: {
    category?: ErrorCategory;
    level?: LogLevel;
    message_pattern?: string;
    user_id?: string;
  };
}

export interface AlertAction {
  type: 'log' | 'webhook' | 'email' | 'database';
  config: Record<string, unknown>;
}

export interface MonitoringMetrics {
  errorRate: number;
  errorCount: number;
  criticalErrors: number;
  averageResponseTime: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastUpdate: string;
}

class ErrorMonitoring {
  private alertRules: Map<string, AlertRule> = new Map();
  private metricsInterval: NodeJS.Timeout | null = null;
  private alertHistory: Map<string, Date> = new Map();
  private readonly MAX_ALERT_HISTORY = parseInt(process.env.MAX_ALERT_HISTORY || '100');

  constructor() {
    this.initializeDefaultRules();
    this.startMetricsCollection();
  }

  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        condition: {
          metric: 'error_rate',
          operator: 'gt',
        },
        threshold: 10, // errors per minute
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'critical' } },
          { type: 'database', config: { table: 'error_alerts' } },
        ],
      },
      {
        id: 'critical-errors',
        name: 'Critical Errors Detected',
        condition: {
          metric: 'critical_errors',
          operator: 'gt',
        },
        threshold: 0,
        timeWindow: '1m',
        severity: 'critical',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'critical' } },
          { type: 'database', config: { table: 'error_alerts' } },
        ],
      },
      {
        id: 'database-errors',
        name: 'Database Connection Issues',
        condition: {
          metric: 'error_count',
          operator: 'gt',
          filters: { category: ErrorCategory.DATABASE },
        },
        threshold: 5,
        timeWindow: '5m',
        severity: 'high',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'error' } },
          { type: 'database', config: { table: 'error_alerts' } },
        ],
      },
      {
        id: 'auth-failures',
        name: 'Authentication Failures',
        condition: {
          metric: 'error_count',
          operator: 'gt',
          filters: { category: ErrorCategory.AUTHENTICATION },
        },
        threshold: 3,
        timeWindow: '1m',
        severity: 'medium',
        enabled: true,
        actions: [
          { type: 'log', config: { level: 'warn' } },
          { type: 'database', config: { table: 'error_alerts' } },
        ],
      },
    ];

    defaultRules.forEach(rule => this.alertRules.set(rule.id, rule));
  }

  private startMetricsCollection(): void {
    const isEnabled = process.env.ENABLE_MONITORING !== 'false';
    const interval = parseInt(process.env.METRICS_INTERVAL || '300000'); // Default 5 minutes
    
    if (!isEnabled) {
      logger.info('Monitoring disabled via environment variable');
      return;
    }
    
    // Collect metrics at configurable interval (default 5 minutes)
    this.metricsInterval = setInterval(async () => {
      await this.collectAndEvaluateMetrics();
    }, interval);

    // Cleanup interval (every hour)
    setInterval(async () => {
      await this.cleanupOldData();
    }, 3600000);
    
    logger.info(`Monitoring started with ${interval}ms interval`);
  }

  private async collectAndEvaluateMetrics(): Promise<void> {
    try {
      const metrics = await this.getCurrentMetrics();
      await this.persistMetrics(metrics);
      await this.evaluateAlertRules(metrics);
    } catch (error) {
      logger.error('Failed to collect metrics', error as Error, ErrorCategory.SYSTEM);
    }
  }

  private async getCurrentMetrics(): Promise<MonitoringMetrics> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    try {
      // Get error counts for the last 5 minutes
      const { data: recentErrors } = await supabaseAdmin
        .from('error_logs')
        .select('level, timestamp')
        .gte('timestamp', fiveMinutesAgo.toISOString());

      const errorCount = recentErrors?.length || 0;
      const criticalErrors = recentErrors?.filter(e => e.level === 'critical').length || 0;
      const errorRate = errorCount / 5; // errors per minute

      // Determine health status
      let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (criticalErrors > 0) {
        healthStatus = 'unhealthy';
      } else if (errorRate > 5) {
        healthStatus = 'degraded';
      }

      return {
        errorRate,
        errorCount,
        criticalErrors,
        averageResponseTime: 0, // Would need to implement response time tracking
        healthStatus,
        lastUpdate: now.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get current metrics', error as Error, ErrorCategory.DATABASE);
      return {
        errorRate: 0,
        errorCount: 0,
        criticalErrors: 0,
        averageResponseTime: 0,
        healthStatus: 'unhealthy',
        lastUpdate: now.toISOString(),
      };
    }
  }

  private async persistMetrics(metrics: MonitoringMetrics): Promise<void> {
    try {
      const timestamp = new Date().toISOString();

      await supabaseAdmin.from('error_metrics').insert([
        {
          metric_type: 'performance',
          metric_name: 'error_rate',
          metric_value: metrics.errorRate,
          timestamp,
        },
        {
          metric_type: 'performance',
          metric_name: 'error_count',
          metric_value: metrics.errorCount,
          timestamp,
        },
        {
          metric_type: 'performance',
          metric_name: 'critical_errors',
          metric_value: metrics.criticalErrors,
          timestamp,
        },
        {
          metric_type: 'health',
          metric_name: 'status',
          metric_value: metrics.healthStatus === 'healthy' ? 1 : 0,
          labels: { status: metrics.healthStatus },
          timestamp,
        },
      ]);
    } catch (error) {
      logger.error('Failed to persist metrics', error as Error, ErrorCategory.DATABASE);
    }
  }

  private async evaluateAlertRules(metrics: MonitoringMetrics): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldAlert = await this.evaluateRule(rule, metrics);
        if (shouldAlert) {
          await this.triggerAlert(rule, metrics);
        }
      } catch (error) {
        logger.error(
          `Failed to evaluate alert rule: ${rule.name}`,
          error as Error,
          ErrorCategory.SYSTEM
        );
      }
    }
  }

  private async evaluateRule(rule: AlertRule, metrics: MonitoringMetrics): Promise<boolean> {
    // Check if we've recently alerted for this rule (prevent spam)
    const lastAlert = this.alertHistory.get(rule.id);
    const cooldownPeriod = this.parseTimeWindow(rule.timeWindow) * 1000; // Convert to ms
    if (lastAlert && Date.now() - lastAlert.getTime() < cooldownPeriod) {
      return false;
    }

    let metricValue: number;

    switch (rule.condition.metric) {
      case 'error_rate':
        metricValue = metrics.errorRate;
        break;
      case 'error_count':
        metricValue = await this.getFilteredErrorCount(rule);
        break;
      case 'critical_errors':
        metricValue = metrics.criticalErrors;
        break;
      case 'specific_error':
        metricValue = await this.getSpecificErrorCount(rule);
        break;
      default:
        return false;
    }

    return this.compareValues(metricValue, rule.condition.operator, rule.threshold);
  }

  private async getFilteredErrorCount(rule: AlertRule): Promise<number> {
    const timeWindow = this.parseTimeWindow(rule.timeWindow);
    const since = new Date(Date.now() - timeWindow * 1000);

    let query = supabaseAdmin
      .from('error_logs')
      .select('id', { count: 'exact' })
      .gte('timestamp', since.toISOString());

    if (rule.condition.filters) {
      const filters = rule.condition.filters;
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.level !== undefined) {
        query = query.eq('level', LogLevel[filters.level].toLowerCase());
      }
      if (filters.user_id) {
        query = query.eq('context->>userId', filters.user_id);
      }
      if (filters.message_pattern) {
        query = query.ilike('message', `%${filters.message_pattern}%`);
      }
    }

    const { count, error } = await query;
    if (error) {
      logger.error('Failed to get filtered error count', error as Error, ErrorCategory.DATABASE);
      return 0;
    }

    return count || 0;
  }

  private async getSpecificErrorCount(rule: AlertRule): Promise<number> {
    return this.getFilteredErrorCount(rule);
  }

  private compareValues(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  private parseTimeWindow(timeWindow: string): number {
    const match = timeWindow.match(/^(\d+)([smhd])$/);
    if (!match) return 300; // Default 5 minutes

    const [, value, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(value) * (multipliers[unit as keyof typeof multipliers] || 60);
  }

  private async triggerAlert(rule: AlertRule, metrics: MonitoringMetrics): Promise<void> {
    this.alertHistory.set(rule.id, new Date());

    const alertData = {
      rule_id: rule.id,
      rule_name: rule.name,
      severity: rule.severity,
      metrics,
      timestamp: new Date().toISOString(),
    };

    for (const action of rule.actions) {
      try {
        await this.executeAction(action, alertData);
      } catch (error) {
        logger.error(
          `Failed to execute alert action: ${action.type}`,
          error as Error,
          ErrorCategory.SYSTEM
        );
      }
    }
  }

  private async executeAction(action: AlertAction, alertData: any): Promise<void> {
    switch (action.type) {
      case 'log':
        logger.critical(
          `Alert triggered: ${alertData.rule_name}`,
          undefined,
          ErrorCategory.SYSTEM,
          { alertData }
        );
        break;

      case 'database':
        await supabaseAdmin.from('error_alerts').insert({
          level: alertData.severity,
          message: `Alert: ${alertData.rule_name}`,
          context: alertData,
          timestamp: alertData.timestamp,
          status: 'pending',
        });
        break;

      case 'webhook':
        if (action.config.url) {
          await this.sendWebhook(action.config.url as string, alertData);
        }
        break;

      case 'email':
        // Email implementation would go here
        logger.info('Email alert action not implemented', { alertData });
        break;
    }
  }

  private async sendWebhook(url: string, data: any): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to send webhook', error as Error, ErrorCategory.NETWORK);
    }
  }

  private async cleanupOldData(): Promise<void> {
    try {
      // Clean up in-memory alert history if it exceeds limit
      if (this.alertHistory.size > this.MAX_ALERT_HISTORY) {
        const entries = Array.from(this.alertHistory.entries());
        entries.sort((a, b) => a[1].getTime() - b[1].getTime());
        
        // Remove oldest entries
        const toRemove = entries.slice(0, Math.floor(entries.length / 2));
        toRemove.forEach(([key]) => {
          this.alertHistory.delete(key);
        });
      }

      // Clean up old metrics (keep last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await supabaseAdmin
        .from('error_metrics')
        .delete()
        .lt('timestamp', sevenDaysAgo.toISOString());

      // Auto-resolve old alerts
      await supabaseAdmin.rpc('auto_resolve_alerts');

      // Clean up old error logs based on retention policy
      await supabaseAdmin.rpc('cleanup_old_error_logs', { retention_days: 30 });

      logger.info('Completed data cleanup');
    } catch (error) {
      logger.error('Failed to cleanup old data', error as Error, ErrorCategory.SYSTEM);
    }
  }

  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    logger.info(`Added alert rule: ${rule.name}`, { ruleId: rule.id });
  }

  public removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    logger.info(`Removed alert rule: ${ruleId}`, { ruleId });
  }

  public updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    const existing = this.alertRules.get(ruleId);
    if (existing) {
      this.alertRules.set(ruleId, { ...existing, ...updates });
      logger.info(`Updated alert rule: ${ruleId}`, { ruleId, updates });
    }
  }

  public getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  public async getHealthStatus(): Promise<MonitoringMetrics> {
    return this.getCurrentMetrics();
  }

  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export const errorMonitoring = new ErrorMonitoring();