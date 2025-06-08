#!/usr/bin/env node

/**
 * Performance Monitoring Script
 * 
 * This script monitors key performance metrics and can be run periodically
 * to track performance trends over time.
 * 
 * Usage:
 *   node scripts/performance-monitor.js
 *   node scripts/performance-monitor.js --output=json
 *   node scripts/performance-monitor.js --baseline
 */

const fs = require('fs');
const path = require('path');
const { performance, PerformanceObserver } = require('perf_hooks');

class PerformanceMonitor {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      metrics: {},
      systemInfo: {},
      recommendations: []
    };
  }

  async collectSystemMetrics() {
    // Collect basic system information
    this.results.systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memory: {
        total: Math.round(require('os').totalmem() / 1024 / 1024), // MB
        free: Math.round(require('os').freemem() / 1024 / 1024), // MB
        usage: process.memoryUsage()
      },
      cpu: {
        cores: require('os').cpus().length,
        model: require('os').cpus()[0]?.model || 'Unknown'
      },
      uptime: Math.round(process.uptime())
    };
  }

  async measureDatabaseOperations() {
    console.log('📊 Measuring database operation performance...');
    
    // Simulate database operations timing
    const operations = [
      'simple_select',
      'complex_query', 
      'insert_operation',
      'bulk_insert',
      'aggregation'
    ];

    this.results.metrics.database = {};

    for (const op of operations) {
      const startTime = performance.now();
      
      // Simulate operation delay (replace with actual database calls)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
      const endTime = performance.now();
      this.results.metrics.database[op] = {
        duration: Math.round((endTime - startTime) * 100) / 100,
        unit: 'ms'
      };
    }
  }

  async measureMemoryUsage() {
    console.log('💾 Measuring memory usage patterns...');
    
    const initialMemory = process.memoryUsage();
    
    // Simulate memory-intensive operations
    const data = [];
    for (let i = 0; i < 10000; i++) {
      data.push({ id: i, data: 'test'.repeat(100) });
    }
    
    const peakMemory = process.memoryUsage();
    
    // Clean up
    data.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage();
    
    this.results.metrics.memory = {
      initial: {
        heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024),
        rss: Math.round(initialMemory.rss / 1024 / 1024)
      },
      peak: {
        heapUsed: Math.round(peakMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(peakMemory.heapTotal / 1024 / 1024),
        rss: Math.round(peakMemory.rss / 1024 / 1024)
      },
      final: {
        heapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(finalMemory.heapTotal / 1024 / 1024),
        rss: Math.round(finalMemory.rss / 1024 / 1024)
      },
      unit: 'MB'
    };
  }

  async measureCPUUsage() {
    console.log('⚡ Measuring CPU usage...');
    
    const startTime = process.hrtime.bigint();
    const startCPU = process.cpuUsage();
    
    // Simulate CPU-intensive work
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
      result += Math.sqrt(i);
    }
    
    const endTime = process.hrtime.bigint();
    const endCPU = process.cpuUsage(startCPU);
    
    const totalTime = Number(endTime - startTime) / 1000000; // Convert to ms
    const cpuTime = (endCPU.user + endCPU.system) / 1000; // Convert to ms
    
    this.results.metrics.cpu = {
      utilizationPercentage: Math.round((cpuTime / totalTime) * 100 * 100) / 100,
      totalTime: Math.round(totalTime * 100) / 100,
      cpuTime: Math.round(cpuTime * 100) / 100,
      unit: 'ms'
    };
  }

  generateRecommendations() {
    const { memory, cpu } = this.results.metrics;
    const { systemInfo } = this.results;
    
    // Memory recommendations
    if (memory && memory.peak.heapUsed > 200) {
      this.results.recommendations.push({
        type: 'memory',
        severity: 'warning',
        message: 'High memory usage detected. Consider enabling PERSIST_LOGS_TO_DB=false'
      });
    }
    
    if (memory && memory.peak.heapUsed > 500) {
      this.results.recommendations.push({
        type: 'memory',
        severity: 'critical', 
        message: 'Very high memory usage. Recommend ENABLE_MONITORING=false'
      });
    }
    
    // CPU recommendations
    if (cpu && cpu.utilizationPercentage > 80) {
      this.results.recommendations.push({
        type: 'cpu',
        severity: 'warning',
        message: 'High CPU usage. Consider increasing METRICS_INTERVAL'
      });
    }
    
    // System recommendations
    if (systemInfo.memory.total < 4096) {
      this.results.recommendations.push({
        type: 'hardware',
        severity: 'info',
        message: 'Low memory system detected. Use .env.performance low-end configuration'
      });
    }
    
    if (systemInfo.cpu.cores < 4) {
      this.results.recommendations.push({
        type: 'hardware', 
        severity: 'info',
        message: 'Low CPU core count. Consider disabling monitoring for better performance'
      });
    }
  }

  async saveBaseline() {
    const baselineFile = path.join(__dirname, '..', 'performance-baseline.json');
    
    try {
      fs.writeFileSync(baselineFile, JSON.stringify(this.results, null, 2));
      console.log(`📋 Baseline saved to ${baselineFile}`);
    } catch (error) {
      console.error('❌ Failed to save baseline:', error.message);
    }
  }

  compareToBaseline() {
    const baselineFile = path.join(__dirname, '..', 'performance-baseline.json');
    
    try {
      if (!fs.existsSync(baselineFile)) {
        console.log('ℹ️  No baseline found. Run with --baseline to create one.');
        return;
      }
      
      const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
      
      console.log('\n📈 Performance Comparison:');
      console.log('================================');
      
      // Compare memory usage
      if (baseline.metrics.memory && this.results.metrics.memory) {
        const baselineMem = baseline.metrics.memory.peak.heapUsed;
        const currentMem = this.results.metrics.memory.peak.heapUsed;
        const memDiff = currentMem - baselineMem;
        const memPercent = Math.round((memDiff / baselineMem) * 100);
        
        console.log(`Memory Usage: ${currentMem}MB (${memDiff > 0 ? '+' : ''}${memDiff}MB, ${memPercent > 0 ? '+' : ''}${memPercent}%)`);
      }
      
      // Compare database operations
      if (baseline.metrics.database && this.results.metrics.database) {
        console.log('\nDatabase Operations:');
        for (const [op, current] of Object.entries(this.results.metrics.database)) {
          const baselineOp = baseline.metrics.database[op];
          if (baselineOp) {
            const diff = current.duration - baselineOp.duration;
            const percent = Math.round((diff / baselineOp.duration) * 100);
            console.log(`  ${op}: ${current.duration}ms (${diff > 0 ? '+' : ''}${diff}ms, ${percent > 0 ? '+' : ''}${percent}%)`);
          }
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to compare to baseline:', error.message);
    }
  }

  outputResults(format = 'text') {
    if (format === 'json') {
      console.log(JSON.stringify(this.results, null, 2));
      return;
    }
    
    console.log('\n🎯 Performance Monitor Results');
    console.log('===============================');
    console.log(`Timestamp: ${this.results.timestamp}`);
    
    // System Info
    console.log(`\n💻 System Information:`);
    console.log(`  Platform: ${this.results.systemInfo.platform} (${this.results.systemInfo.arch})`);
    console.log(`  Node.js: ${this.results.systemInfo.nodeVersion}`);
    console.log(`  CPU: ${this.results.systemInfo.cpu.cores} cores`);
    console.log(`  Memory: ${this.results.systemInfo.memory.usage.heapUsed / 1024 / 1024}MB used of ${this.results.systemInfo.memory.total}MB total`);
    
    // Database Metrics
    if (this.results.metrics.database) {
      console.log(`\n📊 Database Performance:`);
      for (const [op, metrics] of Object.entries(this.results.metrics.database)) {
        console.log(`  ${op}: ${metrics.duration}ms`);
      }
    }
    
    // Memory Metrics
    if (this.results.metrics.memory) {
      console.log(`\n💾 Memory Usage:`);
      console.log(`  Initial: ${this.results.metrics.memory.initial.heapUsed}MB`);
      console.log(`  Peak: ${this.results.metrics.memory.peak.heapUsed}MB`);
      console.log(`  Final: ${this.results.metrics.memory.final.heapUsed}MB`);
    }
    
    // CPU Metrics
    if (this.results.metrics.cpu) {
      console.log(`\n⚡ CPU Usage:`);
      console.log(`  Utilization: ${this.results.metrics.cpu.utilizationPercentage}%`);
      console.log(`  Total Time: ${this.results.metrics.cpu.totalTime}ms`);
    }
    
    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      for (const rec of this.results.recommendations) {
        const icon = rec.severity === 'critical' ? '🔴' : rec.severity === 'warning' ? '🟡' : 'ℹ️';
        console.log(`  ${icon} ${rec.message}`);
      }
    }
  }

  async run() {
    console.log('🚀 Starting performance monitoring...');
    
    await this.collectSystemMetrics();
    await this.measureDatabaseOperations();
    await this.measureMemoryUsage();
    await this.measureCPUUsage();
    this.generateRecommendations();
    
    console.log('✅ Performance monitoring complete!');
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  const options = {
    baseline: args.includes('--baseline'),
    output: args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'text'
  };
  
  const monitor = new PerformanceMonitor();
  
  try {
    await monitor.run();
    
    if (options.baseline) {
      await monitor.saveBaseline();
    } else {
      monitor.compareToBaseline();
    }
    
    monitor.outputResults(options.output);
    
  } catch (error) {
    console.error('❌ Performance monitoring failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PerformanceMonitor;