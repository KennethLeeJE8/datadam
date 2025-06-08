# Performance Documentation

This directory contains comprehensive performance analysis and optimization documentation for the MCP Personal Data Server.

## Documentation Files

### 📊 PERFORMANCE_ANALYSIS.md
Complete performance analysis report including:
- Benchmark results and test metrics
- Bottleneck identification and fixes
- Hardware requirement analysis
- Before/after optimization comparisons
- Future improvement recommendations

### 📈 PERFORMANCE_TRACKING.md
Performance tracking log for monitoring improvements over time:
- Historical performance data
- Change impact documentation
- Performance regression detection
- Hardware compatibility matrix
- Optimization backlog

### ⚙️ PERFORMANCE.md
Practical performance optimization guide:
- Configuration options for different hardware levels
- Step-by-step optimization instructions
- Environment variable reference
- Troubleshooting performance issues

## Performance Configuration Files

### 🔧 .env.performance
Ready-to-use configuration templates:
- Low-end hardware settings
- Medium hardware settings  
- High-end hardware settings
- Production optimization examples

## Performance Monitoring Tools

### 📊 scripts/performance-monitor.js
Automated performance monitoring script:

```bash
# Basic performance monitoring
npm run perf:monitor

# Create performance baseline
npm run perf:baseline  

# Compare current performance to baseline
npm run perf:compare

# Output results as JSON
npm run perf:json
```

### Available Performance Commands

```bash
# Test suite performance
npm run test:performance       # Run performance tests
npm test -- tests/performance/ # Run specific performance tests

# Performance monitoring
npm run perf:monitor           # Monitor current performance
npm run perf:baseline          # Create baseline for comparison
npm run perf:compare           # Compare to baseline
npm run perf:json              # Output metrics as JSON

# Development performance
npm run dev                    # Development with hot reload
npm run build                  # Production build
npm start                      # Production server
```

## Quick Start Guide

### 1. Assess Your Hardware
```bash
# Check system resources
npm run perf:monitor
```

### 2. Choose Configuration
```bash
# Copy appropriate template to .env
cp .env.performance .env

# Edit for your hardware level:
# - Uncomment low-end section for 2GB RAM, 2-core
# - Uncomment medium section for 4GB RAM, 4-core  
# - Use defaults for 8GB+ RAM, 8+ core
```

### 3. Test Performance
```bash
# Set baseline
npm run perf:baseline

# Run server and test
npm start

# Compare performance
npm run perf:compare
```

### 4. Monitor Over Time
```bash
# Regular monitoring (add to CI/CD)
npm run perf:monitor >> performance-log.txt

# Weekly baseline updates
npm run perf:baseline
```

## Performance Optimization Workflow

1. **Measure Current Performance**
   ```bash
   npm run perf:baseline
   npm run test:performance
   ```

2. **Identify Bottlenecks**
   - Review PERFORMANCE_ANALYSIS.md
   - Check monitoring output for recommendations
   - Profile specific operations

3. **Apply Optimizations**
   - Adjust environment variables
   - Update configuration based on hardware
   - Test changes incrementally

4. **Validate Improvements**
   ```bash
   npm run perf:compare
   npm run test:performance
   ```

5. **Document Changes**
   - Update PERFORMANCE_TRACKING.md
   - Record benchmark improvements
   - Note any compatibility changes

## Environment-Specific Recommendations

### Development
- Enable all features for comprehensive testing
- Use detailed logging for debugging
- Monitor performance impact of changes

### Staging  
- Use production-like performance settings
- Test under realistic load conditions
- Validate optimization effectiveness

### Production
- Optimize for your specific hardware
- Monitor performance continuously  
- Set up alerting for performance degradation

## Integration with CI/CD

Add performance monitoring to your pipeline:

```yaml
# Example GitHub Actions step
- name: Performance Baseline
  run: npm run perf:baseline

- name: Run Performance Tests  
  run: npm run test:performance

- name: Monitor Performance
  run: npm run perf:compare
```

## Troubleshooting Performance Issues

1. **High Memory Usage**
   - Set `PERSIST_LOGS_TO_DB=false`
   - Reduce `MAX_METRICS_SIZE`
   - Disable monitoring: `ENABLE_MONITORING=false`

2. **High CPU Usage**
   - Increase `METRICS_INTERVAL` to 5+ minutes
   - Set `LOG_LEVEL=ERROR`
   - Reduce log processing frequency

3. **Slow Database Operations**
   - Check Supabase region proximity
   - Optimize query patterns
   - Consider local development database

4. **Memory Leaks**
   - Monitor with `npm run perf:monitor`
   - Check session metrics growth
   - Review log buffer sizes

For detailed troubleshooting, see PERFORMANCE.md.

## Support and Contributing

- **Performance Issues**: Check PERFORMANCE_ANALYSIS.md for known bottlenecks
- **Configuration Help**: See PERFORMANCE.md optimization guide  
- **Tracking Changes**: Update PERFORMANCE_TRACKING.md with improvements
- **Monitoring**: Use scripts/performance-monitor.js for automated tracking

This documentation ensures you can effectively monitor, optimize, and improve the MCP server's performance over time.